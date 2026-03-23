import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — all tags (from tag_definitions + any unregistered tags on contacts)
export async function GET() {
  try {
    // Fetch registered tag definitions
    const { data: tagDefs } = await supabase
      .from('tag_definitions')
      .select('*')
      .order('name', { ascending: true });

    // Collect all unique tags from contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('tags');

    const tagMap = new Map<string, { name: string; colour: string }>();

    // Start with registered tags
    for (const t of tagDefs || []) {
      tagMap.set(t.name, { name: t.name, colour: t.colour || '#3B82F6' });
    }

    // Add any tags from contacts that aren't registered yet
    const unregistered: string[] = [];
    for (const c of contacts || []) {
      for (const tag of (c.tags as string[]) || []) {
        if (tag && !tagMap.has(tag)) {
          tagMap.set(tag, { name: tag, colour: '#3B82F6' });
          unregistered.push(tag);
        }
      }
    }

    // Best-effort auto-register missing tags (don't fail if this errors)
    for (const tag of unregistered) {
      try { await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' }); } catch {}
    }

    // Return sorted list
    const result = Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching tags';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST — create or upsert a tag definition
export async function POST(req: Request) {
  try {
    const { name, colour } = await req.json();
    if (!name) return NextResponse.json({ success: false, error: 'name required' }, { status: 400 });

    const { data, error } = await supabase
      .from('tag_definitions')
      .upsert({ name: name.trim(), colour: colour || '#3B82F6' }, { onConflict: 'name' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, tag: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error creating tag';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE — remove a tag definition and cascade-remove it from all contacts
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    if (!name) return NextResponse.json({ success: false, error: 'name required' }, { status: 400 });

    // Remove tag from all contacts that have it
    const { data: affected } = await supabase
      .from('contacts')
      .select('id, tags, line_id')
      .contains('tags', [name]);

    if (affected && affected.length > 0) {
      for (const contact of affected) {
        const updatedTags = (contact.tags as string[]).filter((t: string) => t !== name);
        await supabase.from('contacts').update({ tags: updatedTags }).eq('id', contact.id);
        // Trigger TAG_REMOVED automations
        const { processAutomations } = await import('@/lib/automation-engine');
        processAutomations('TAG_REMOVED', name, contact.id, contact.line_id || '');
      }
    }

    const { error } = await supabase.from('tag_definitions').delete().eq('name', name);
    if (error) throw error;
    return NextResponse.json({ success: true, cascaded: affected?.length ?? 0 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting tag';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
