import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enrollInWebinarSequence } from '@/lib/webinar-sequence';

/**
 * POST /api/webinar-sequence/enroll/bulk
 * Enroll all contacts that have the webinar tag + LINE ID but aren't enrolled yet.
 * Body: { webinar_date?: string } — defaults to active_webinar_date from settings
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let webinarDate = body.webinar_date;

    if (!webinarDate) {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'active_webinar_date')
        .single();
      webinarDate = setting?.value;
    }

    if (!webinarDate) {
      return NextResponse.json({ success: false, error: 'No webinar_date provided and no active_webinar_date in settings' }, { status: 400 });
    }

    // Build tag from date: "2026-03-25" → "webinar-0325"
    const d = new Date(webinarDate);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const tag = `webinar-${mm}${dd}`;

    // Get contacts with tag + LINE ID
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, webinar_date')
      .contains('tags', [tag])
      .not('line_id', 'is', null)
      .neq('line_id', '');

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, enrolled: 0, message: `No contacts found with tag ${tag} and LINE ID` });
    }

    // Get already-enrolled contact IDs for this webinar date
    const { data: existingEnrollments } = await supabase
      .from('webinar_enrollments')
      .select('contact_id')
      .eq('webinar_date', webinarDate)
      .eq('status', 'active');

    const enrolledIds = new Set((existingEnrollments || []).map(e => e.contact_id));

    // Filter to only unenrolled contacts
    const toEnroll = contacts.filter(c => !enrolledIds.has(c.id));

    let enrolled = 0;
    let failed = 0;

    for (const contact of toEnroll) {
      try {
        await enrollInWebinarSequence(contact.id, webinarDate, contact.name || '');
        enrolled++;
      } catch (err) {
        console.error(`[BulkEnroll] Failed for ${contact.id}:`, err);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      enrolled,
      failed,
      alreadyEnrolled: enrolledIds.size,
      totalWithTag: contacts.length,
      tag,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk enroll error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
