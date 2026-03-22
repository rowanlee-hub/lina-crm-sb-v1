import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/line/link-email
 * Called by LIFF page to link a LINE userId to a contact by email.
 *
 * Body: { email: string, line_id: string, display_name?: string }
 *
 * Scenarios:
 * 1. GHL contact with email exists → update with line_id, trigger auto-push + enrollment
 * 2. LINE-only contact exists + GHL contact exists → merge them
 * 3. No GHL contact yet → create/update contact with email + line_id (GHL webhook will match later)
 */
export async function POST(req: Request) {
  try {
    const { email, line_id, display_name } = await req.json();

    if (!email || !line_id) {
      return NextResponse.json({ success: false, error: 'email and line_id required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    console.log(`[LinkEmail] Linking email=${emailLower} to line_id=${line_id}`);

    // Find existing contact by email (GHL contact)
    const { data: ghlContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('email', emailLower)
      .single();

    // Find existing contact by line_id (LINE-only contact from follow event)
    const { data: lineContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('line_id', line_id)
      .single();

    if (ghlContact && lineContact && ghlContact.id !== lineContact.id) {
      // SCENARIO: Both exist as separate contacts → merge
      // Keep GHL contact, add line_id, merge tags, delete LINE-only contact
      const mergedTags = [...new Set([...(ghlContact.tags || []), ...(lineContact.tags || [])])];

      await supabase.from('contacts').update({
        line_id,
        tags: mergedTags,
        name: ghlContact.name || lineContact.name || display_name || '',
        updated_at: new Date().toISOString(),
      }).eq('id', ghlContact.id);

      // Move history from LINE contact to GHL contact
      await supabase.from('contact_history').update({ contact_id: ghlContact.id })
        .eq('contact_id', lineContact.id);

      // Delete the LINE-only contact
      await supabase.from('contacts').delete().eq('id', lineContact.id);

      await supabase.from('contact_history').insert({
        contact_id: ghlContact.id,
        action: `LIFF Link: Merged LINE account (${display_name || line_id}) via email ${emailLower}`,
      });

      console.log(`[LinkEmail] Merged LINE contact into GHL contact ${ghlContact.id}`);

      // Auto-push webinar link if available
      if (ghlContact.webinar_link) {
        const { autoPushWebinarLink } = await import('@/lib/webinar-utils');
        autoPushWebinarLink({ ...ghlContact, line_id, tags: mergedTags }).catch(console.error);
      }

      // Auto-enroll in webinar sequence if has date but no active enrollment
      if (ghlContact.webinar_date) {
        const { data: activeEnrollment } = await supabase
          .from('webinar_enrollments')
          .select('id')
          .eq('contact_id', ghlContact.id)
          .eq('status', 'active')
          .limit(1)
          .single();

        if (!activeEnrollment) {
          const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
          enrollInWebinarSequence(ghlContact.id, ghlContact.webinar_date, ghlContact.name).catch(console.error);
        }
      }

      return NextResponse.json({
        success: true,
        action: 'merged',
        contact_id: ghlContact.id,
        name: ghlContact.name,
        has_webinar_link: !!ghlContact.webinar_link,
      });

    } else if (ghlContact) {
      // SCENARIO: GHL contact exists, either no LINE contact or same record
      // Just update with line_id
      if (ghlContact.line_id === line_id) {
        // Already linked — still send webinar link (user coming from landing page expects it)
        if (ghlContact.webinar_link) {
          const { autoPushWebinarLink } = await import('@/lib/webinar-utils');
          autoPushWebinarLink({ ...ghlContact, line_id }).catch(console.error);
        }
        return NextResponse.json({
          success: true,
          action: 'already_linked',
          contact_id: ghlContact.id,
          name: ghlContact.name,
          has_webinar_link: !!ghlContact.webinar_link,
        });
      }

      await supabase.from('contacts').update({
        line_id,
        updated_at: new Date().toISOString(),
      }).eq('id', ghlContact.id);

      await supabase.from('contact_history').insert({
        contact_id: ghlContact.id,
        action: `LIFF Link: LINE account linked via email ${emailLower}`,
      });

      // Auto-push webinar link
      if (ghlContact.webinar_link) {
        const { autoPushWebinarLink } = await import('@/lib/webinar-utils');
        autoPushWebinarLink({ ...ghlContact, line_id }).catch(console.error);
      }

      return NextResponse.json({
        success: true,
        action: 'linked',
        contact_id: ghlContact.id,
        name: ghlContact.name,
        has_webinar_link: !!ghlContact.webinar_link,
      });

    } else if (lineContact) {
      // SCENARIO: LINE contact exists but no GHL contact with this email
      // Update LINE contact with email (so GHL webhook can match later)
      await supabase.from('contacts').update({
        email: emailLower,
        updated_at: new Date().toISOString(),
      }).eq('id', lineContact.id);

      await supabase.from('contact_history').insert({
        contact_id: lineContact.id,
        action: `LIFF Link: Email ${emailLower} saved (awaiting GHL sync)`,
      });

      return NextResponse.json({
        success: true,
        action: 'email_saved',
        contact_id: lineContact.id,
        name: lineContact.name || display_name,
        message: 'Email saved. Will auto-link when GHL data arrives.',
      });

    } else {
      // SCENARIO: No contact exists at all — create one with both email + line_id
      const { getNextWebinarDate } = await import('@/lib/webinar-utils');
      const webinarDate = getNextWebinarDate();

      const { data: newContact, error } = await supabase.from('contacts').insert({
        name: display_name || '',
        email: emailLower,
        line_id,
        webinar_date: webinarDate,
        tags: ['followed'],
        status: 'Lead',
      }).select().single();

      if (error) throw error;

      await supabase.from('contact_history').insert({
        contact_id: newContact.id,
        action: `LIFF Link: Created contact with email ${emailLower} + LINE (${display_name || line_id})`,
      });

      // Auto-enroll in webinar sequence
      const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
      enrollInWebinarSequence(newContact.id, webinarDate, display_name || '').catch(console.error);

      return NextResponse.json({
        success: true,
        action: 'created',
        contact_id: newContact.id,
        name: display_name,
      });
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Link email error';
    console.error('[LinkEmail] Error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
