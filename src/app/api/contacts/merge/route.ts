import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/contacts/merge
 * Merges a LINE-only contact into an email-only contact.
 * Copies line_id from the LINE contact to the email contact,
 * merges tags, then deletes the LINE-only contact.
 *
 * Body: { line_contact_id, email_contact_id }
 */
export async function POST(req: Request) {
  try {
    const { line_contact_id, email_contact_id } = await req.json();

    if (!line_contact_id || !email_contact_id) {
      return NextResponse.json({ error: 'line_contact_id and email_contact_id required' }, { status: 400 });
    }

    // Fetch both contacts
    const [{ data: lineContact }, { data: emailContact }] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', line_contact_id).single(),
      supabase.from('contacts').select('*').eq('id', email_contact_id).single(),
    ]);

    if (!lineContact || !emailContact) {
      return NextResponse.json({ error: 'One or both contacts not found' }, { status: 404 });
    }

    if (!lineContact.line_id) {
      return NextResponse.json({ error: 'LINE contact has no line_id' }, { status: 400 });
    }

    // Merge: copy line_id and any missing fields to email contact
    const mergedTags = [...new Set([
      ...(emailContact.tags || []),
      ...(lineContact.tags || []),
    ])].filter(t => t !== 'pending-match' && t !== 'Pending Match');

    const patch: Record<string, any> = {
      line_id: lineContact.line_id,
      tags: mergedTags,
      updated_at: new Date().toISOString(),
    };

    // Fill in blanks from LINE contact
    if (!emailContact.name && lineContact.name) patch.name = lineContact.name;
    if (!emailContact.webinar_date && lineContact.webinar_date) patch.webinar_date = lineContact.webinar_date;
    if (!emailContact.webinar_link && lineContact.webinar_link) patch.webinar_link = lineContact.webinar_link;

    // Move history from LINE contact to email contact FIRST
    await supabase
      .from('contact_history')
      .update({ contact_id: email_contact_id })
      .eq('contact_id', line_contact_id);

    // Delete the LINE-only contact BEFORE updating (frees the unique line_id constraint)
    await supabase.from('contacts').delete().eq('id', line_contact_id);

    // Now update email contact with merged data (line_id is free)
    const { error: updateErr } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', email_contact_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log the merge
    await supabase.from('contact_history').insert({
      contact_id: email_contact_id,
      action: `Merged: LINE contact (${lineContact.name || lineContact.line_id}) → ${emailContact.email}`,
    });

    // Auto-enroll in webinar sequence if applicable
    const finalWebinarDate = emailContact.webinar_date || lineContact.webinar_date;
    if (finalWebinarDate) {
      const today = new Date().toISOString().substring(0, 10);
      if (finalWebinarDate.substring(0, 10) >= today) {
        const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
        enrollInWebinarSequence(email_contact_id, finalWebinarDate, emailContact.name || lineContact.name || '').catch(console.error);
      }
    }

    return NextResponse.json({ success: true, merged_into: email_contact_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
