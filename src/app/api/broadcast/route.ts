import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { renderMessageSync } from '@/lib/render-message';

export async function POST(req: Request) {
  try {
    const { tag, message, scheduled_at } = await req.json();

    if (!tag || !message || !scheduled_at) {
      return NextResponse.json({ success: false, error: 'tag, message, and scheduled_at are required' }, { status: 400 });
    }

    // Fetch all contact fields needed for variable rendering
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone, line_id, tags, status, notes, uid, webinar_link, webinar_date, follow_up_note')
      .contains('tags', [tag]);

    if (error) throw error;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, queued: 0, message: 'No contacts matched the tag filter.' });
    }

    const queueItems = contacts
      .filter(c => c.line_id)
      .map(c => ({
        contact_id: c.id,
        message: renderMessageSync(message, c),
        scheduled_at: new Date(scheduled_at).toISOString(),
        status: 'queued',
      }));

    if (queueItems.length === 0) {
      return NextResponse.json({ success: true, queued: 0, message: 'No contacts with LINE IDs found.' });
    }

    const { error: insertError } = await supabase.from('message_queue').insert(queueItems);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, queued: queueItems.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Broadcast error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
