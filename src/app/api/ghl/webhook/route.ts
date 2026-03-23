import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncWebinarTagAndDate } from '@/lib/webinar-utils';

/**
 * GHL Webhook — Receives contact data from GoHighLevel workflows.
 * 
 * Expected POST body:
 * {
 *   "contact_id": "ghl_abc123",         // GHL contact ID
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "phone": "+601234567890",
 *   "webinar_link": "https://zoom.us/j/unique123",
 *   "webinar_date": "2026-03-18T20:00:00+08:00",
 *   "tags": ["Webinar-Registered", "Lead"]
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('GHL Webhook received body:', JSON.stringify(body));

    // GHL sends fields at top level — handle all possible field name variations
    const ghlId = body.contact_id || body.id;
    const name = body.full_name || body.name || `${body.first_name || ''} ${body.last_name || ''}`.trim() || '';
    const email = body.email || '';
    const phone = body.phone || '';
    const uid = body.uid || body['UID (If applicable)'] || body.uid_if_applicable || '';
    const webinar_link = body['Webinar link'] || body['Webinar replay link'] || body.webinar_link || '';

    // Normalise tags — GHL may send a string, array, or comma-separated string
    // Also check common GHL field name variations
    const rawTags = body.tags ?? body.contactTags ?? body.contact_tags ?? body.tag;
    let tags: string[] = [];
    if (Array.isArray(rawTags)) {
      tags = rawTags.flatMap((t: string) => t.split(',').map((s: string) => s.trim())).filter(Boolean);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      tags = rawTags.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    // Normalise webinar tags: webinar0325 → webinar-0325
    tags = tags.map(t => t.replace(/^webinar(\d{4})$/, 'webinar-$1'));
    console.log(`GHL Webhook [${email || ghlId}] rawTags:`, JSON.stringify(rawTags), '→ parsed:', JSON.stringify(tags));

    // Sync webinar tag ↔ date (always resolves to nearest Wednesday)
    const synced = syncWebinarTagAndDate(tags, null);
    tags = synced.tags;
    let webinar_date: string | null = synced.webinar_date;

    // If no webinar tag found, fall back to active_webinar_date from settings
    if (!webinar_date) {
      const { data: dateSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'active_webinar_date')
        .single();
      webinar_date = dateSetting?.value || null;
    }

    if (!ghlId && !email) {
      return NextResponse.json({ success: false, error: 'Need contact_id or email' }, { status: 400 });
    }

    // Try to find existing contact by GHL ID, email, or phone (in priority order)
    let existingContact = null;

    if (ghlId) {
      const { data } = await supabase.from('contacts').select('*').eq('ghl_contact_id', ghlId).single();
      existingContact = data;
    }

    if (!existingContact && email) {
      const { data } = await supabase.from('contacts').select('*').eq('email', email).single();
      existingContact = data;
    }

    // Also try by phone — catches cases where same person exists from LINE without email
    if (!existingContact && phone) {
      const cleanPhone = phone.replace(/[\s\-()]/g, '');
      const { data } = await supabase.from('contacts').select('*').eq('phone', cleanPhone).single();
      existingContact = data;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();

    if (existingContact) {
      // Update existing contact — sync tags ↔ webinar_date
      const mergedTags = [...new Set([...(existingContact.tags || []), ...(tags || [])])];
      const merged = syncWebinarTagAndDate(mergedTags, webinar_date || existingContact.webinar_date);
      console.log(`GHL Webhook [${email || ghlId}] existing tags:`, JSON.stringify(existingContact.tags), '+ incoming:', JSON.stringify(tags), '= merged:', JSON.stringify(merged.tags));
      const { error: updateError } = await supabase.from('contacts').update({
        name: name || existingContact.name,
        email: email || existingContact.email,
        phone: phone || existingContact.phone,
        ghl_contact_id: ghlId || existingContact.ghl_contact_id,
        uid: uid || existingContact.uid || '',
        webinar_link: webinar_link || existingContact.webinar_link,
        webinar_date: merged.webinar_date || existingContact.webinar_date,
        tags: merged.tags,
        signup_day: dayOfWeek,
        updated_at: now.toISOString(),
      }).eq('id', existingContact.id);

      if (updateError) {
        console.error('GHL Update Error:', updateError.message);
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }

      // Log
      await supabase.from('contact_history').insert({
        contact_id: existingContact.id,
        action: `GHL Sync: Updated from GoHighLevel`
      });

      // Auto-push webinar link to LINE if it was newly added/changed
      const prevWebinarLink = existingContact.webinar_link || '';
      if (webinar_link && webinar_link !== prevWebinarLink && existingContact.line_id) {
        const { autoPushWebinarLink } = await import('@/lib/webinar-utils');
        autoPushWebinarLink({
          id: existingContact.id,
          line_id: existingContact.line_id,
          webinar_link: webinar_link,
          name: name || existingContact.name,
          email: email || existingContact.email,
          webinar_date: webinar_date || existingContact.webinar_date,
          tags: mergedTags,
        }).catch(console.error);
      }

      // Auto-register new tags in tag_definitions + trigger automations
      const newTags = (tags || []).filter((t: string) => !(existingContact.tags || []).includes(t));
      if (newTags.length > 0) {
        for (const tag of newTags) {
          await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' });
        }
        const { processAutomations } = await import('@/lib/automation-engine');
        for (const tag of newTags) {
          processAutomations('TAG_ADDED', tag, existingContact.id, existingContact.line_id || '');
        }
      }

      // Auto-enroll in webinar sequence if:
      // 1. webinar_date is new or changed, OR
      // 2. contact has a webinar_date + LINE ID but no active enrollment (catch-up)
      const prevWebinarDate = existingContact.webinar_date;
      const finalWebinarDate = webinar_date || existingContact.webinar_date;
      if (finalWebinarDate) {
        const dateChanged = webinar_date && webinar_date.substring(0, 10) !== (prevWebinarDate || '').substring(0, 10);
        if (dateChanged) {
          const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
          enrollInWebinarSequence(existingContact.id, finalWebinarDate, name || existingContact.name).catch(console.error);
        } else if (existingContact.line_id) {
          // Check if already enrolled — if not, enroll now (catch-up for contacts that got LINE ID after GHL import)
          const { data: activeEnrollment } = await supabase
            .from('webinar_enrollments')
            .select('id')
            .eq('contact_id', existingContact.id)
            .eq('status', 'active')
            .single();
          if (!activeEnrollment) {
            const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
            enrollInWebinarSequence(existingContact.id, finalWebinarDate, name || existingContact.name).catch(console.error);
          }
        }
      }

      return NextResponse.json({ success: true, action: 'updated', id: existingContact.id, debug: { name, email, phone, uid, webinar_link, webinar_date } });

    } else {
      // Create new contact
      const { data: newContact, error } = await supabase.from('contacts').insert({
        name: name || '',
        email: email || '',
        phone: phone || '',
        ghl_contact_id: ghlId,
        uid: uid || '',
        webinar_link: webinar_link || '',
        webinar_date: webinar_date || null,
        tags: tags || [],
        signup_day: dayOfWeek,
        status: 'Lead',
      }).select().single();

      if (error) throw error;

      // Auto-register all tags in tag_definitions
      if (tags && tags.length > 0) {
        for (const tag of tags) {
          await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' });
        }
      }

      await supabase.from('contact_history').insert({
        contact_id: newContact.id,
        action: `GHL Sync: Created from GoHighLevel`
      });

      // Auto-enroll in webinar sequence if webinar_date present
      if (webinar_date) {
        const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
        enrollInWebinarSequence(newContact.id, webinar_date, name).catch(console.error);
      }

      return NextResponse.json({ success: true, action: 'created', id: newContact.id });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'GHL webhook error';
    const stack = error instanceof Error ? error.stack : '';
    console.error('GHL Webhook Error:', msg, stack);
    return NextResponse.json({ success: false, error: msg, detail: stack }, { status: 500 });
  }
}
