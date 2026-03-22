import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
    console.log(`GHL Webhook [${email || ghlId}] rawTags:`, JSON.stringify(rawTags), '→ parsed:', JSON.stringify(tags));

    // Determine webinar date:
    // If contact has webinar-MMDD tag(s), pick the LATEST one to handle returning leads
    // who have tags from multiple webinars (e.g. webinar-0318 + webinar-0325).
    // Falls back to active_webinar_date from settings if no tag found.
    let webinar_date: string | null = null;
    const year = new Date().getFullYear();
    const webinarDateTags = tags
      .filter(t => /^webinar-\d{4}$/.test(t))
      .map(t => {
        const mmdd = t.replace('webinar-', '');
        return `${year}-${mmdd.substring(0, 2)}-${mmdd.substring(2, 4)}`;
      })
      .sort();
    if (webinarDateTags.length > 0) {
      webinar_date = webinarDateTags[webinarDateTags.length - 1]; // latest date
    } else {
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
      // Update existing contact
      const mergedTags = [...new Set([...(existingContact.tags || []), ...(tags || [])])];
      console.log(`GHL Webhook [${email || ghlId}] existing tags:`, JSON.stringify(existingContact.tags), '+ incoming:', JSON.stringify(tags), '= merged:', JSON.stringify(mergedTags));
      const { error: updateError } = await supabase.from('contacts').update({
        name: name || existingContact.name,
        email: email || existingContact.email,
        phone: phone || existingContact.phone,
        ghl_contact_id: ghlId || existingContact.ghl_contact_id,
        uid: uid || existingContact.uid || '',
        webinar_link: webinar_link || existingContact.webinar_link,
        webinar_date: webinar_date || existingContact.webinar_date,
        tags: mergedTags,
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

      // Trigger automations for new tags
      const newTags = (tags || []).filter((t: string) => !(existingContact.tags || []).includes(t));
      if (newTags.length > 0) {
        const { processAutomations } = await import('@/lib/automation-engine');
        for (const tag of newTags) {
          processAutomations('TAG_ADDED', tag, existingContact.id, existingContact.line_id || '');
        }
      }

      // Auto-enroll in webinar sequence if webinar_date is new or changed
      const prevWebinarDate = existingContact.webinar_date;
      if (webinar_date && webinar_date.substring(0, 10) !== (prevWebinarDate || '').substring(0, 10)) {
        const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
        enrollInWebinarSequence(existingContact.id, webinar_date, name || existingContact.name).catch(console.error);
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
