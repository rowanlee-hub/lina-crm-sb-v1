import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ key, value: data.value });
}

export async function POST(req: Request) {
  try {
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

    const { error } = await supabase.from('settings').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, key, value });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Settings error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
