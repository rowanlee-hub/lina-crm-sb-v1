import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contacts/unmatched
 * Returns:
 * - line_only: contacts with line_id but no email
 * - email_all: ALL contacts with email, with a `linked` flag
 */
export async function GET() {
  // LINE contacts without email
  const { data: lineOnly } = await supabase
    .from('contacts')
    .select('id, name, line_id, tags, webinar_date')
    .not('line_id', 'is', null)
    .neq('line_id', '')
    .or('email.is.null,email.eq.')
    .order('created_at', { ascending: false })
    .limit(1000);

  // All contacts with email
  const { data: emailAll } = await supabase
    .from('contacts')
    .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
    .not('email', 'is', null)
    .neq('email', '')
    .order('name', { ascending: true })
    .limit(1000);

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
