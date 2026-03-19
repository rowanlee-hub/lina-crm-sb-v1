import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/contacts/deduplicate
 * Finds and merges duplicate contacts.
 * Deduplication strategy (in order):
 *   1. Same line_id (non-empty) → merge
 *   2. Same email (non-empty) → merge
 *
 * For each duplicate group: keep the contact with the most filled fields,
 * merge tags from all duplicates, migrate history, delete the rest.
 */
export async function POST() {
  try {
    const { data: allContacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!allContacts || allContacts.length === 0) {
      return NextResponse.json({ merged: 0, message: 'No contacts found' });
    }

    const toDelete = new Set<string>();
    let mergedCount = 0;

    // ── PASS 1: Deduplicate by line_id ──────────────────────────────────────
    const byLineId: Record<string, typeof allContacts> = {};
    for (const c of allContacts) {
      if (!c.line_id || c.line_id.trim() === '') continue;
      if (!byLineId[c.line_id]) byLineId[c.line_id] = [];
      byLineId[c.line_id].push(c);
    }

    for (const [lineId, dupes] of Object.entries(byLineId)) {
      if (dupes.length < 2) continue;

      // Score each contact — more fields filled = higher score (keep this one)
      const scored = dupes.map(c => ({
        c,
        score: [c.name, c.email, c.phone, c.ghl_contact_id, c.uid, c.webinar_link].filter(Boolean).length,
      })).sort((a, b) => b.score - a.score);

      const keeper = scored[0].c;
      const losers = scored.slice(1).map(s => s.c);

      // Merge all tags together
      const allTags = [...new Set([...(keeper.tags || []), ...losers.flatMap(l => l.tags || [])])];

      // Build merged fields (fill in any blanks from losers)
      const merged: Record<string, unknown> = { tags: allTags };
      for (const field of ['email', 'phone', 'ghl_contact_id', 'uid', 'webinar_link', 'webinar_date', 'name'] as const) {
        if (!keeper[field]) {
          const donor = losers.find(l => l[field]);
          if (donor) merged[field] = donor[field];
        }
      }

      if (Object.keys(merged).length > 1 || allTags.length !== (keeper.tags || []).length) {
        await supabase.from('contacts').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', keeper.id);
      }

      for (const loser of losers) {
        if (toDelete.has(loser.id)) continue;
        // Reassign history to keeper
        await supabase.from('contact_history').update({ contact_id: keeper.id }).eq('contact_id', loser.id);
        // Reassign reminders
        await supabase.from('reminders').update({ contact_id: keeper.id }).eq('contact_id', loser.id);
        // Log merge
        await supabase.from('contact_history').insert({
          contact_id: keeper.id,
          action: `Merged duplicate: line_id=${lineId} (removed contact ${loser.id})`,
        });
        toDelete.add(loser.id);
        mergedCount++;
      }
    }

    // ── PASS 2: Deduplicate by email (skip already-deleted) ─────────────────
    const byEmail: Record<string, typeof allContacts> = {};
    for (const c of allContacts) {
      if (!c.email || c.email.trim() === '') continue;
      if (toDelete.has(c.id)) continue;
      const key = c.email.toLowerCase().trim();
      if (!byEmail[key]) byEmail[key] = [];
      byEmail[key].push(c);
    }

    for (const [email, dupes] of Object.entries(byEmail)) {
      if (dupes.length < 2) continue;

      const scored = dupes.map(c => ({
        c,
        score: [c.name, c.line_id, c.phone, c.ghl_contact_id, c.uid, c.webinar_link].filter(Boolean).length,
      })).sort((a, b) => b.score - a.score);

      const keeper = scored[0].c;
      const losers = scored.slice(1).map(s => s.c);

      const allTags = [...new Set([...(keeper.tags || []), ...losers.flatMap(l => l.tags || [])])];

      const merged: Record<string, unknown> = { tags: allTags };
      for (const field of ['line_id', 'phone', 'ghl_contact_id', 'uid', 'webinar_link', 'webinar_date', 'name'] as const) {
        if (!keeper[field]) {
          const donor = losers.find(l => l[field] && !toDelete.has(l.id));
          if (donor) merged[field] = donor[field];
        }
      }

      if (Object.keys(merged).length > 1 || allTags.length !== (keeper.tags || []).length) {
        await supabase.from('contacts').update({ ...merged, updated_at: new Date().toISOString() }).eq('id', keeper.id);
      }

      for (const loser of losers) {
        if (toDelete.has(loser.id)) continue;
        await supabase.from('contact_history').update({ contact_id: keeper.id }).eq('contact_id', loser.id);
        await supabase.from('reminders').update({ contact_id: keeper.id }).eq('contact_id', loser.id);
        await supabase.from('contact_history').insert({
          contact_id: keeper.id,
          action: `Merged duplicate: email=${email} (removed contact ${loser.id})`,
        });
        toDelete.add(loser.id);
        mergedCount++;
      }
    }

    // ── Delete all losers ────────────────────────────────────────────────────
    if (toDelete.size > 0) {
      const ids = Array.from(toDelete);
      await supabase.from('contacts').delete().in('id', ids);
    }

    return NextResponse.json({
      success: true,
      merged: mergedCount,
      deleted: toDelete.size,
      message: mergedCount === 0
        ? 'No duplicates found.'
        : `Merged ${mergedCount} duplicate contact(s) into ${toDelete.size} unique record(s).`,
    });
  } catch (err: any) {
    console.error('Deduplicate error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
