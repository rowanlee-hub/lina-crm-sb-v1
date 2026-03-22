import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enrollInWebinarSequence } from '@/lib/webinar-sequence';

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

async function processRow(row: ImportRow): Promise<RowResult> {
  const lineId = (row.line_id || '').trim();
  const email = (row.email || '').trim().toLowerCase();
  const displayName = (row.display_name || '').trim();
  const webinarDate = (row.webinar_date || '').trim();
  const webinarLink = (row.webinar_link || '').trim();
  const base = { line_id: lineId, email, display_name: displayName, webinar_date: webinarDate, webinar_link: webinarLink };

  if (!lineId) return { ...base, status: 'skipped' };

  const safeWebinarDate = /^\d{4}-\d{2}-\d{2}$/.test(webinarDate) ? webinarDate : '';

  try {
    // Find existing — parallel lookups when possible
    let existing: any = null;
    const { data: byLineId } = await supabase
      .from('contacts')
      .select('id, line_id, name, email, webinar_date, webinar_link, tags')
      .eq('line_id', lineId)
      .limit(1);
    existing = byLineId?.[0] ?? null;

    if (!existing && email) {
      const { data: byEmail } = await supabase
        .from('contacts')
        .select('id, line_id, name, email, webinar_date, webinar_link, tags')
        .eq('email', email)
        .limit(1);
      existing = byEmail?.[0] ?? null;
    }

    const now = new Date().toISOString();

    // Generate webinar tag from date: 2026-02-18 → webinar-0218
    const webinarTag = safeWebinarDate
      ? `webinar-${safeWebinarDate.substring(5, 7)}${safeWebinarDate.substring(8, 10)}`
      : '';

    if (existing) {
      const patch: Record<string, any> = { updated_at: now };
      if (!existing.line_id && lineId) patch.line_id = lineId;
      if (!existing.name && displayName) patch.name = displayName;
      if (!existing.email && email) patch.email = email;
      // Always update webinar date + link (they change between imports)
      if (safeWebinarDate && existing.webinar_date !== safeWebinarDate) patch.webinar_date = safeWebinarDate;
      if (webinarLink && existing.webinar_link !== webinarLink) patch.webinar_link = webinarLink;

      // Add webinar tag if not already present
      const existingTags: string[] = existing.tags || [];
      if (webinarTag && !existingTags.includes(webinarTag)) {
        patch.tags = [...existingTags, webinarTag];
      }

      if (Object.keys(patch).length <= 1) {
        return { ...base, status: 'already_had' };
      }

      await supabase.from('contacts').update(patch).eq('id', existing.id);

      // Auto-register tag definition
      if (webinarTag && !existingTags.includes(webinarTag)) {
        supabase.from('tag_definitions').upsert({ name: webinarTag }, { onConflict: 'name' }).then(() => {});
      }

      const actions: string[] = [];
      if (patch.line_id) actions.push(`LINE ID`);
      if (patch.name) actions.push(`name`);
      if (patch.email) actions.push(`email`);
      if (patch.webinar_date) actions.push(`webinar: ${safeWebinarDate}`);
      if (patch.webinar_link) actions.push(`webinar link`);
      if (patch.tags) actions.push(`tag: ${webinarTag}`);

      supabase.from('contact_history').insert({
        contact_id: existing.id,
        action: `CSV import: updated ${actions.join(', ')}`,
      }).then(() => {});

      // Auto-enroll in webinar sequence if webinar_date is upcoming
      const finalWebinarDate = safeWebinarDate || existing.webinar_date;
      if (finalWebinarDate && lineId) {
        tryAutoEnroll(existing.id, finalWebinarDate, existing.name || displayName || '');
      }

      return { ...base, status: existing.line_id ? 'updated' : 'linked' };
    }

    // Create new contact
    const newTags = webinarTag ? [webinarTag] : [];
    const { data: newContact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        line_id: lineId,
        name: displayName || '',
        email: email || '',
        phone: '',
        tags: newTags,
        status: 'Lead',
        uid: '',
        webinar_date: safeWebinarDate || null,
        webinar_link: webinarLink || null,
      })
      .select('id')
      .single();

    if (insertError) return { ...base, status: 'skipped' };

    // Auto-register tag definition
    if (webinarTag) {
      supabase.from('tag_definitions').upsert({ name: webinarTag }, { onConflict: 'name' }).then(() => {});
    }

    supabase.from('contact_history').insert({
      contact_id: newContact.id,
      action: `Contact created via LINE CSV import${webinarTag ? ` [${webinarTag}]` : ''}`,
    }).then(() => {});

    // Auto-enroll in webinar sequence if webinar_date is upcoming
    if (safeWebinarDate) {
      tryAutoEnroll(newContact.id, safeWebinarDate, displayName || '');
    }

    return { ...base, status: 'created' };
  } catch {
    return { ...base, status: 'skipped' };
  }
}

async function tryAutoEnroll(contactId: string, webinarDate: string, name: string) {
  try {
    // Get the active webinar date from settings
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'active_webinar_date').single();
    const activeDate = setting?.value || '';

    // Only enroll if webinar_date is today or in the future
    const today = new Date().toISOString().substring(0, 10);
    if (webinarDate.substring(0, 10) >= today) {
      enrollInWebinarSequence(contactId, webinarDate, name).catch(console.error);
    }
  } catch {
    // Silent fail — enrollment is best-effort
  }
}

// POST — process a batch of rows (frontend sends batches of 50)
export async function POST(req: Request) {
  try {
    const { rows } = await req.json() as { rows: ImportRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'rows array required' }, { status: 400 });
    }

    // Process rows in parallel groups of 10 for speed
    const CONCURRENCY = 10;
    const results: RowResult[] = [];

    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(chunk.map(processRow));
      results.push(...chunkResults);
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
