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
  // LINE contacts without email
  const { data: lineOnly } = await supabase
    .from('contacts')
    .select('id, name, line_id, tags, webinar_date')
    .not('line_id', 'is', null)
    .neq('line_id', '')
    .or('email.is.null,email.eq.')
    .order('created_at', { ascending: false })
    .limit(1000);

  // Email contacts without line_id
  // Two queries to handle both null and empty string for line_id
  const { data: emailNullLine } = await supabase
    .from('contacts')
    .select('id, name, email, phone, tags, webinar_date, webinar_link, ghl_contact_id')
    .is('line_id', null)
    .not('email', 'is', null)
    .neq('email', '')
    .order('created_at', { ascending: false })
    .limit(1000);

  const { data: emailEmptyLine } = await supabase
    .from('contacts')
    .select('id, name, email, phone, tags, webinar_date, webinar_link, ghl_contact_id')
    .eq('line_id', '')
    .not('email', 'is', null)
    .neq('email', '')
    .order('created_at', { ascending: false })
    .limit(1000);

  // Merge and deduplicate
  const emailMap = new Map<string, any>();
  for (const c of [...(emailNullLine || []), ...(emailEmptyLine || [])]) {
    emailMap.set(c.id, c);
  }

  return NextResponse.json({
    line_only: lineOnly || [],
    email_only: Array.from(emailMap.values()),
  });
}
