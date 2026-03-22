import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts/unmatched
 * Returns two lists:
 * - line_only: contacts with line_id but no email (LINE followers not matched)
 * - email_only: contacts with email but no line_id (GHL contacts not matched)
 */
export async function GET() {
  const { data: lineOnly } = await supabase
    .from('contacts')
    .select('id, name, line_id, tags, webinar_date')
    .not('line_id', 'is', null)
    .or('email.is.null,email.eq.')
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: emailOnly } = await supabase
    .from('contacts')
    .select('id, name, email, phone, tags, webinar_date, webinar_link, ghl_contact_id')
    .or('line_id.is.null,line_id.eq.')
    .not('email', 'is', null)
    .neq('email', '')
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json({
    line_only: lineOnly || [],
    email_only: emailOnly || [],
  });
}
