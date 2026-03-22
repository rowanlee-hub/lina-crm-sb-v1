import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts/unmatched?email_q=&line_q=
 * Returns:
 * - line_only: contacts with line_id but no email
 * - email_all: ALL contacts with email, with a `linked` flag
 * Supports server-side search via query params
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const emailQ = (searchParams.get('email_q') || '').trim().toLowerCase();
  const lineQ = (searchParams.get('line_q') || '').trim().toLowerCase();

  // LINE contacts without email
  let lineQuery = supabase
    .from('contacts')
    .select('id, name, line_id, tags, webinar_date')
    .not('line_id', 'is', null)
    .neq('line_id', '')
    .or('email.is.null,email.eq.');

  if (lineQ) {
    lineQuery = lineQuery.or(`name.ilike.%${lineQ}%,line_id.ilike.%${lineQ}%`);
  }

  const { data: lineOnly } = await lineQuery
    .order('created_at', { ascending: false })
    .limit(200);

  // All contacts with email — server-side search
  let emailQuery = supabase
    .from('contacts')
    .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
    .not('email', 'is', null)
    .neq('email', '');

  if (emailQ) {
    emailQuery = emailQuery.or(`name.ilike.%${emailQ}%,email.ilike.%${emailQ}%`);
  }

  const { data: emailAll } = await emailQuery
    .order('name', { ascending: true })
    .limit(200);

  // Add linked flag
  const emailWithFlag = (emailAll || []).map(c => ({
    ...c,
    linked: !!(c.line_id && c.line_id.trim()),
  }));

  return NextResponse.json({
    line_only: lineOnly || [],
    email_only: emailWithFlag,
  });
}
