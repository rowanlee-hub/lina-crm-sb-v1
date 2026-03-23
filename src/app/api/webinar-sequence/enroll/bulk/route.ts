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
    // Use substring to avoid timezone shift (new Date() can shift date back by 1 day)
    const tag = `webinar-${webinarDate.substring(5, 7)}${webinarDate.substring(8, 10)}`;

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

    // Get the expected step count so we can detect incomplete enrollments
    const { data: activeSeq } = await supabase
      .from('webinar_sequences')
      .select('id, webinar_sequence_steps(id)')
      .eq('is_active', true)
      .limit(1)
      .single();
    const expectedStepCount = activeSeq?.webinar_sequence_steps?.length || 0;

    // Get already-enrolled contact IDs for this webinar date
    const { data: existingEnrollments } = await supabase
      .from('webinar_enrollments')
      .select('contact_id, id')
      .eq('webinar_date', webinarDate)
      .eq('status', 'active');

    const enrollmentMap = new Map((existingEnrollments || []).map(e => [e.contact_id, e.id]));

    // Check for incomplete enrollments (timed-out previous runs)
    const incompleteIds = new Set<string>();
    if (body.fix_incomplete !== false && expectedStepCount > 0) {
      for (const [contactId, enrollmentId] of enrollmentMap) {
        const { count } = await supabase
          .from('webinar_scheduled_messages')
          .select('id', { count: 'exact', head: true })
          .eq('enrollment_id', enrollmentId);
        if ((count || 0) < expectedStepCount) {
          incompleteIds.add(contactId);
        }
      }
    }

    // Filter to unenrolled OR incomplete contacts, limit batch size
    const batchSize = body.limit || 30;
    const needsEnroll = contacts.filter(c => !enrollmentMap.has(c.id) || incompleteIds.has(c.id));
    const toEnroll = needsEnroll.slice(0, batchSize);
    const remaining = needsEnroll.length - toEnroll.length;

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
      remaining,
      alreadyEnrolled: enrollmentMap.size - incompleteIds.size,
      fixed: incompleteIds.size,
      totalWithTag: contacts.length,
      tag,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk enroll error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
