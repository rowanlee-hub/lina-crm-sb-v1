import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET — list enrollments with scheduled message counts
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contact_id');

    let query = supabase
      .from('webinar_enrollments')
      .select(`
        id, status, webinar_date, enrolled_at, contact_id,
        contacts(id, name, email, line_id),
        webinar_scheduled_messages(id, status, scheduled_at, sent_at,
          webinar_sequence_steps(days_before, message)
        )
      `)
      .order('enrolled_at', { ascending: false });

    if (contactId) {
      query = query.eq('contact_id', contactId);
    } else {
      query = query.limit(100);
    }

    const { data } = await query;

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}

// POST — manually enroll a contact
export async function POST(req: Request) {
  try {
    const { contact_id, webinar_date } = await req.json();
    if (!contact_id || !webinar_date) {
      return NextResponse.json({ success: false, error: 'contact_id and webinar_date required' }, { status: 400 });
    }
    const { data: contact } = await supabase.from('contacts').select('name').eq('id', contact_id).single();
    const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
    await enrollInWebinarSequence(contact_id, webinar_date, contact?.name || '');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE — cancel an enrollment and skip all pending messages
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    await supabase.from('webinar_enrollments').update({ status: 'cancelled' }).eq('id', id);
    await supabase.from('webinar_scheduled_messages')
      .update({ status: 'skipped' })
      .eq('enrollment_id', id)
      .eq('status', 'pending');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
