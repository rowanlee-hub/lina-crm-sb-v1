import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// POST — match LINE user IDs to contacts by email, update only (never replace other data)
export async function POST(req: Request) {
  try {
    const { rows } = await req.json() as { rows: Array<{ email: string; line_id: string }> };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'rows array required' }, { status: 400 });
    }

    const results: Array<{ email: string; line_id: string; status: 'linked' | 'skipped' | 'not_found' | 'already_had' }> = [];

    for (const row of rows) {
      const email = (row.email || '').trim().toLowerCase();
      const lineId = (row.line_id || '').trim();

      if (!email || !lineId) {
        results.push({ email, line_id: lineId, status: 'skipped' });
        continue;
      }

      const { data: contact, error } = await supabase
        .from('contacts')
        .select('id, line_id')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        results.push({ email, line_id: lineId, status: 'not_found' });
        continue;
      }

      if (!contact) {
        results.push({ email, line_id: lineId, status: 'not_found' });
        continue;
      }

      if (contact.line_id) {
        results.push({ email, line_id: lineId, status: 'already_had' });
        continue;
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ line_id: lineId, updated_at: new Date().toISOString() })
        .eq('id', contact.id);

      if (updateError) {
        results.push({ email, line_id: lineId, status: 'skipped' });
        continue;
      }

      await supabase.from('contact_history').insert({
        contact_id: contact.id,
        action: `LINE ID linked via CSV import: ${lineId}`,
      });

      results.push({ email, line_id: lineId, status: 'linked' });
    }

    const linked = results.filter(r => r.status === 'linked').length;
    const alreadyHad = results.filter(r => r.status === 'already_had').length;
    const notFound = results.filter(r => r.status === 'not_found').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({ success: true, linked, already_had: alreadyHad, not_found: notFound, skipped, results });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Link failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
