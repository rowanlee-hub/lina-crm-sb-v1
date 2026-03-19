import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch all reminders for a contact
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contactId');

  try {
    let query = supabase.from('reminders').select('*').order('scheduled_time', { ascending: true });

    if (contactId) {
      query = query.eq('contact_id', contactId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching reminders';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST: Create a new reminder
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contactId, message, scheduledTime } = body;

    if (!contactId || !message || !scheduledTime) {
      return NextResponse.json({ success: false, error: 'contactId, message, and scheduledTime are required' }, { status: 400 });
    }

    const { data, error } = await supabase.from('reminders').insert({
      contact_id: contactId,
      message,
      scheduled_time: scheduledTime,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    return NextResponse.json({ success: true, reminder: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error creating reminder';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE: Cancel/delete a reminder
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

    const { error } = await supabase.from('reminders').delete().eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting reminder';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
