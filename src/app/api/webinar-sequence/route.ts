import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — active sequence with its steps
export async function GET() {
  try {
    const { data: sequence } = await supabase
      .from('webinar_sequences')
      .select('id, name, is_active, webinar_sequence_steps(id, days_before, send_hour, message, message_no_link)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sequence) {
      // Auto-create a default sequence if none exists
      const { data: newSeq } = await supabase
        .from('webinar_sequences')
        .insert({ name: 'Webinar Reminder Sequence' })
        .select()
        .single();
      return NextResponse.json({ ...(newSeq || {}), webinar_sequence_steps: [] });
    }

    // Sort steps: most days before first
    const sorted = {
      ...sequence,
      webinar_sequence_steps: ((sequence as any).webinar_sequence_steps || []).sort(
        (a: any, b: any) => b.days_before - a.days_before
      ),
    };

    return NextResponse.json(sorted);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch sequence' }, { status: 500 });
  }
}

// POST — add a step to the active sequence
export async function POST(req: Request) {
  try {
    const { sequence_id, days_before, send_hour, message, message_no_link } = await req.json();
    if (!sequence_id || days_before === undefined || !message) {
      return NextResponse.json({ success: false, error: 'sequence_id, days_before, message required' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('webinar_sequence_steps')
      .insert({ sequence_id, days_before: Number(days_before), send_hour: Number(send_hour ?? 9), message, message_no_link: message_no_link || null })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, step: data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH — update a step
export async function PATCH(req: Request) {
  try {
    const { id, days_before, send_hour, message, message_no_link } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const { error } = await supabase
      .from('webinar_sequence_steps')
      .update({ days_before: Number(days_before), send_hour: Number(send_hour), message, message_no_link: message_no_link || null })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE — remove a step (and its scheduled messages to avoid FK constraint)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    // Delete related scheduled messages first
    await supabase.from('webinar_scheduled_messages').delete().eq('step_id', id);
    const { error } = await supabase.from('webinar_sequence_steps').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
