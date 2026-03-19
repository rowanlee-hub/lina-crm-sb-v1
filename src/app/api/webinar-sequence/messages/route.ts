import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contact_id');
    if (!contactId) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const { data, error } = await supabase
      .from('webinar_scheduled_messages')
      .select(`
        id, scheduled_at, status, sent_at, contact_id,
        webinar_sequence_steps(message)
      `)
      .eq('contact_id', contactId)
      .order('scheduled_at', { ascending: true });

    if (error) throw error;

    const formatted = (data || []).map((m: any) => ({
      id: m.id,
      scheduled_at: m.scheduled_at,
      status: m.status,
      sent_at: m.sent_at,
      step_message: m.webinar_sequence_steps?.message || '',
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
