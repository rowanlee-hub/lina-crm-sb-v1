import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — all tag definitions
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('tag_definitions')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return NextResponse.json(data || []);
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
      .select('id, tags')
      .contains('tags', [name]);

    if (affected && affected.length > 0) {
      for (const contact of affected) {
        const updatedTags = (contact.tags as string[]).filter((t: string) => t !== name);
        await supabase.from('contacts').update({ tags: updatedTags }).eq('id', contact.id);
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
