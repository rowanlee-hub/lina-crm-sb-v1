import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncWebinarTagAndDate } from '@/lib/webinar-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/contacts/sync-webinar-tags
 * One-time backfill: ensures every contact's webinar_date and webinar-MMDD tag are in sync.
 * - If contact has webinar-MMDD tag → sets webinar_date to nearest Wednesday
 * - If contact has webinar_date but no tag → adds the tag
 */
export async function GET() {
  try {
    // Fetch all contacts with tags or webinar_date
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, tags, webinar_date');

    if (error) throw error;

    let updated = 0;
    let skipped = 0;

    for (const c of contacts || []) {
      const tags: string[] = c.tags || [];
      const webinarDate: string | null = c.webinar_date?.substring(0, 10) || null;

      const synced = syncWebinarTagAndDate(tags, webinarDate);

      // Check if anything changed
      const tagsChanged = synced.tags.length !== tags.length || synced.tags.some(t => !tags.includes(t));
      const dateChanged = (synced.webinar_date || null) !== (webinarDate || null);

      if (!tagsChanged && !dateChanged) {
        skipped++;
        continue;
      }

      const patch: Record<string, any> = {};
      if (tagsChanged) patch.tags = synced.tags;
      if (dateChanged) patch.webinar_date = synced.webinar_date;

      await supabase.from('contacts').update(patch).eq('id', c.id);
      updated++;
    }

    return NextResponse.json({ success: true, total: (contacts || []).length, updated, skipped });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
