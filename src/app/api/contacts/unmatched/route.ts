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
  const emailQ = (searchParams.get('email_q') || '').trim();
  const lineQ = (searchParams.get('line_q') || '').trim();

  // LINE contacts without email — use two separate queries to avoid .or() conflicts
  let lineResults: any[] = [];
  if (lineQ) {
    // Search by name or line_id among LINE-only contacts
    const { data: byName } = await supabase
      .from('contacts')
      .select('id, name, line_id, tags, webinar_date')
      .not('line_id', 'is', null)
      .neq('line_id', '')
      .ilike('name', `%${lineQ}%`)
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: byLineId } = await supabase
      .from('contacts')
      .select('id, name, line_id, tags, webinar_date')
      .not('line_id', 'is', null)
      .neq('line_id', '')
      .ilike('line_id', `%${lineQ}%`)
      .order('created_at', { ascending: false })
      .limit(200);

    // Deduplicate
    const map = new Map<string, any>();
    for (const c of [...(byName || []), ...(byLineId || [])]) map.set(c.id, c);
    lineResults = Array.from(map.values());
  } else {
    // No search — get LINE contacts without email
    const { data: nullEmail } = await supabase
      .from('contacts')
      .select('id, name, line_id, tags, webinar_date')
      .not('line_id', 'is', null)
      .neq('line_id', '')
      .is('email', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: emptyEmail } = await supabase
      .from('contacts')
      .select('id, name, line_id, tags, webinar_date')
      .not('line_id', 'is', null)
      .neq('line_id', '')
      .eq('email', '')
      .order('created_at', { ascending: false })
      .limit(200);

    const map = new Map<string, any>();
    for (const c of [...(nullEmail || []), ...(emptyEmail || [])]) map.set(c.id, c);
    lineResults = Array.from(map.values());
  }

  // Email contacts — search or list all
  let emailResults: any[] = [];
  if (emailQ) {
    const { data: byName } = await supabase
      .from('contacts')
      .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
      .not('email', 'is', null)
      .neq('email', '')
      .ilike('name', `%${emailQ}%`)
      .order('name', { ascending: true })
      .limit(200);

    const { data: byEmail } = await supabase
      .from('contacts')
      .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
      .not('email', 'is', null)
      .neq('email', '')
      .ilike('email', `%${emailQ}%`)
      .order('name', { ascending: true })
      .limit(200);

    const map = new Map<string, any>();
    for (const c of [...(byName || []), ...(byEmail || [])]) map.set(c.id, c);
    emailResults = Array.from(map.values());
  } else {
    // No search — get unlinked email contacts only (no line_id)
    const { data: nullLine } = await supabase
      .from('contacts')
      .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
      .is('line_id', null)
      .not('email', 'is', null)
      .neq('email', '')
      .order('name', { ascending: true })
      .limit(200);

    const { data: emptyLine } = await supabase
      .from('contacts')
      .select('id, name, email, phone, line_id, tags, webinar_date, webinar_link')
      .eq('line_id', '')
      .not('email', 'is', null)
      .neq('email', '')
      .order('name', { ascending: true })
      .limit(200);

    const map = new Map<string, any>();
    for (const c of [...(nullLine || []), ...(emptyLine || [])]) map.set(c.id, c);
    emailResults = Array.from(map.values());
  }

  // Add linked flag
  const emailWithFlag = emailResults.map(c => ({
    ...c,
    linked: !!(c.line_id && c.line_id.trim()),
  }));

  return NextResponse.json({
    line_only: lineResults,
    email_only: emailWithFlag,
  });
}
