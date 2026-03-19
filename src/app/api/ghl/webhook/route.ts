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
    const rawTags = body.tags;
    let tags: string[] = [];
    if (Array.isArray(rawTags)) {
      tags = rawTags.flatMap((t: string) => t.split(',').map((s: string) => s.trim())).filter(Boolean);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      tags = rawTags.split(',').map((s: string) => s.trim()).filter(Boolean);
    }

    // Determine webinar date:
    // If contact has a webinar-MMDD tag (e.g. webinar-0318), derive the date from that tag.
    // This prevents late-syncing past registrants from getting the upcoming webinar date.
    // Otherwise fall back to active_webinar_date from settings.
    let webinar_date: string | null = null;
    const webinarTagMatch = tags.find(t => /^webinar-\d{4}$/.test(t));
    if (webinarTagMatch) {
      const mmdd = webinarTagMatch.replace('webinar-', '');
      const mm = mmdd.substring(0, 2);
      const dd = mmdd.substring(2, 4);
      const year = new Date().getFullYear();
      webinar_date = `${year}-${mm}-${dd}`;
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
      if (webinar_date && webinar_date !== prevWebinarDate) {
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
