import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * CSV Import API — Bulk updates contacts or creates new ones.
 * Primarily used for "No-Show" lists or attendee tagging after webinars.
 */
export async function POST(req: Request) {
  try {
    const { contacts } = await req.json(); // Array of contact objects

    if (!Array.isArray(contacts)) {
      return NextResponse.json({ success: false, error: 'Expected an array of contacts' }, { status: 400 });
    }

    const results = {
      updated: 0,
      created: 0,
      errors: 0
    };

    for (const c of contacts) {
      const email = c.email?.toLowerCase().trim();
      const lineId = c.line_id?.trim();
      const name = c.name?.trim();
      const tags = Array.isArray(c.tags) ? c.tags : (c.tags ? c.tags.split(',').map((t: string) => t.trim()) : []);
      const attended = c.attended === true || String(c.attended).toLowerCase() === 'true';
      const purchased = c.purchased === true || String(c.purchased).toLowerCase() === 'true';

      if (!email && !lineId) {
        results.errors++;
        continue;
      }

      // 1. Try to find existing contact
      let query = supabase.from('contacts').select('*');
      if (email) {
        query = query.eq('email', email);
      } else if (lineId) {
        query = query.eq('line_id', lineId);
      }

      const { data: existing } = await query.single();

      if (existing) {
        // Update existing
        const mergedTags = [...new Set([...(existing.tags || []), ...tags])];
        const { error } = await supabase.from('contacts')
          .update({
            name: name || existing.name,
            tags: mergedTags,
            attended: attended !== undefined ? attended : existing.attended,
            purchased: purchased !== undefined ? purchased : existing.purchased,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) results.errors++;
        else {
          results.updated++;
          // Trigger Tag automations if new tags added
          const newTags = tags.filter((t: string) => !(existing.tags || []).includes(t));
          if (newTags.length > 0) {
            const { processAutomations } = await import('@/lib/automation-engine');
            for (const tag of newTags) {
              await processAutomations('TAG_ADDED', tag, existing.id, existing.line_id || '');
            }
          }
        }
      } else {
        // Create new (optional, but requested for list imports)
        const { data: created, error } = await supabase.from('contacts')
          .insert({
            name: name || `Imported User ${results.created + 1}`,
            email: email || null,
            line_id: lineId || null,
            tags: tags,
            attended: attended || false,
            purchased: purchased || false,
            status: 'Lead'
          })
          .select()
          .single();

        if (error) results.errors++;
        else {
          results.created++;
          // Trigger Tag automations
          if (tags.length > 0) {
            const { processAutomations } = await import('@/lib/automation-engine');
            for (const tag of tags) {
              await processAutomations('TAG_ADDED', tag, created.id, created.line_id || '');
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, results });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Import failed';
    console.error('Import API Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
