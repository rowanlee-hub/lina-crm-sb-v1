import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

type ImportRow = {
  line_id: string;
  email: string;
  display_name: string;
  webinar_date: string;
  webinar_link: string;
};

type RowResult = ImportRow & {
  status: 'created' | 'linked' | 'updated' | 'skipped' | 'already_had';
};

// POST — upsert LINE contacts from CSV import
// Match order: line_id → email → create new
// Never overwrites existing data — only fills in blank fields
export async function POST(req: Request) {
  try {
    const { rows } = await req.json() as { rows: ImportRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'rows array required' }, { status: 400 });
    }

    const results: RowResult[] = [];

    for (const row of rows) {
      const lineId = (row.line_id || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const displayName = (row.display_name || '').trim();
      const webinarDate = (row.webinar_date || '').trim();
      const webinarLink = (row.webinar_link || '').trim();

      // line_id is required
      if (!lineId) {
        results.push({ ...row, status: 'skipped' });
        continue;
      }

      // Validate webinar date format (YYYY-MM-DD)
      const safeWebinarDate = /^\d{4}-\d{2}-\d{2}$/.test(webinarDate) ? webinarDate : '';

      // 1. Try find by line_id
      let existing: any = null;
      {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('line_id', lineId)
          .maybeSingle();
        existing = data;
      }

      // 2. Try find by email if no line_id match
      if (!existing && email) {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        existing = data;
      }

      const now = new Date().toISOString();

      if (existing) {
        // Build update payload — only fill in blank fields
        const patch: Record<string, string> = { updated_at: now };
        if (!existing.line_id && lineId) patch.line_id = lineId;
        if (!existing.name && displayName) patch.name = displayName;
        if (!existing.email && email) patch.email = email;
        if (!existing.webinar_date && safeWebinarDate) patch.webinar_date = safeWebinarDate;
        if (!existing.webinar_link && webinarLink) patch.webinar_link = webinarLink;

        const hasChanges = Object.keys(patch).length > 1; // more than just updated_at
        const alreadyFullyLinked =
          existing.line_id === lineId &&
          !(!existing.name && displayName) &&
          !(!existing.email && email) &&
          !(!existing.webinar_date && safeWebinarDate) &&
          !(!existing.webinar_link && webinarLink);

        if (alreadyFullyLinked) {
          results.push({ line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink, status: 'already_had' });
          continue;
        }

        if (hasChanges) {
          await supabase.from('contacts').update(patch).eq('id', existing.id);
          const actions: string[] = [];
          if (patch.line_id) actions.push(`LINE ID: ${lineId}`);
          if (patch.name) actions.push(`display name: ${displayName}`);
          if (patch.email) actions.push(`email: ${email}`);
          if (patch.webinar_date) actions.push(`webinar date: ${safeWebinarDate}`);
          if (patch.webinar_link) actions.push(`webinar link`);
          await supabase.from('contact_history').insert({
            contact_id: existing.id,
            action: `Updated via LINE CSV import: ${actions.join(', ')}`,
          });
          results.push({ line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink, status: existing.line_id ? 'updated' : 'linked' });
        } else {
          results.push({ line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink, status: 'already_had' });
        }
      } else {
        // Create new contact
        const { data: newContact, error: insertError } = await supabase
          .from('contacts')
          .insert({
            line_id: lineId,
            name: displayName || '',
            email: email || '',
            phone: '',
            tags: [],
            status: 'Lead',
            uid: '',
            webinar_date: safeWebinarDate || null,
            webinar_link: webinarLink || null,
          })
          .select('id')
          .single();

        if (insertError) {
          results.push({ line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink, status: 'skipped' });
          continue;
        }

        await supabase.from('contact_history').insert({
          contact_id: newContact.id,
          action: `Contact created via LINE CSV import`,
        });

        results.push({ line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink, status: 'created' });
      }
    }

    return NextResponse.json({
      success: true,
      created: results.filter(r => r.status === 'created').length,
      linked: results.filter(r => r.status === 'linked').length,
      updated: results.filter(r => r.status === 'updated').length,
      already_had: results.filter(r => r.status === 'already_had').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
