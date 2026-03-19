import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Message Templates API
 * Allows saving reusable message templates with variable placeholders.
 */

// GET — list all templates
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching templates';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST — create a template
export async function POST(req: Request) {
  try {
    const { name, content } = await req.json();
    if (!name || !content) {
      return NextResponse.json({ success: false, error: 'name and content required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('message_templates')
      .insert({ name: name.trim(), content: content.trim() })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, template: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error creating template';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// PATCH — update a template
export async function PATCH(req: Request) {
  try {
    const { id, name, content } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const { error } = await supabase.from('message_templates').update({ name, content }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error updating template';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE — remove a template
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const { error } = await supabase.from('message_templates').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting template';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
