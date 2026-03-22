import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/webinar-sequence/enroll/bulk/stats?webinar_date=2026-03-25
 * Returns the count of contacts that have the webinar tag + LINE ID but aren't properly enrolled.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const webinarDate = searchParams.get('webinar_date');
  if (!webinarDate) {
    return NextResponse.json({ missing: 0 });
  }

  const d = new Date(webinarDate);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const tag = `webinar-${mm}${dd}`;

  // Get expected step count
  const { data: activeSeq } = await supabase
    .from('webinar_sequences')
    .select('id, webinar_sequence_steps(id)')
    .eq('is_active', true)
    .limit(1)
    .single();
  const expectedStepCount = activeSeq?.webinar_sequence_steps?.length || 0;

  // Get contacts with tag + LINE ID
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .contains('tags', [tag])
    .not('line_id', 'is', null)
    .neq('line_id', '');

  // Get enrolled contact IDs with enrollment IDs
  const { data: enrollments } = await supabase
    .from('webinar_enrollments')
    .select('contact_id, id')
    .eq('webinar_date', webinarDate)
    .eq('status', 'active');

  const enrollmentMap = new Map((enrollments || []).map(e => [e.contact_id, e.id]));
  const notEnrolled = (contacts || []).filter(c => !enrollmentMap.has(c.id)).length;

  // Count incomplete enrollments (fewer messages than expected steps)
  let incomplete = 0;
  if (expectedStepCount > 0) {
    for (const [, enrollmentId] of enrollmentMap) {
      const { count } = await supabase
        .from('webinar_scheduled_messages')
        .select('id', { count: 'exact', head: true })
        .eq('enrollment_id', enrollmentId);
      if ((count || 0) < expectedStepCount) {
        incomplete++;
      }
    }
  }

  return NextResponse.json({
    missing: notEnrolled + incomplete,
    notEnrolled,
    incomplete,
    totalWithTagAndLine: contacts?.length || 0,
    enrolled: enrollmentMap.size,
    expectedStepCount,
    tag,
  });
}
