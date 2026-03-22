import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/webinar-sequence/enroll/bulk/stats?webinar_date=2026-03-25
 * Returns the count of contacts that have the webinar tag + LINE ID but aren't enrolled.
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

  // Get contacts with tag + LINE ID
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .contains('tags', [tag])
    .not('line_id', 'is', null)
    .neq('line_id', '');

  // Get enrolled contact IDs
  const { data: enrollments } = await supabase
    .from('webinar_enrollments')
    .select('contact_id')
    .eq('webinar_date', webinarDate)
    .eq('status', 'active');

  const enrolledIds = new Set((enrollments || []).map(e => e.contact_id));
  const missing = (contacts || []).filter(c => !enrolledIds.has(c.id)).length;

  return NextResponse.json({
    missing,
    totalWithTagAndLine: contacts?.length || 0,
    enrolled: enrolledIds.size,
    tag,
  });
}
