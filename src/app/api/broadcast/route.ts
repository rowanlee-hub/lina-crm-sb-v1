import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/broadcast
 * Sends a message (or template) to all contacts matching one or more tags.
 * Schedules messages in the message_queue for batch dispatch by cron.
 *
 * Body:
 * {
 *   "tag": "Webinar-Registered",          // filter contacts by this tag
 *   "message": "Hi {{name}}, ...",         // raw message or template string
 *   "scheduled_at": "2026-03-20T09:00+08" // ISO datetime to send
 * }
 */
export async function POST(req: Request) {
  try {
    const { tag, message, scheduled_at } = await req.json();

    if (!tag || !message || !scheduled_at) {
      return NextResponse.json({ success: false, error: 'tag, message, and scheduled_at are required' }, { status: 400 });
    }

    // Fetch matching contacts
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, name, line_id, webinar_link, webinar_date')
      .contains('tags', [tag]);

    if (error) throw error;
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, queued: 0, message: 'No contacts matched the tag filter.' });
    }

    // Render message template for each contact
    const queueItems = contacts
      .filter(c => c.line_id) // need a LINE ID to send
      .map(c => {
        const rendered = message
          .replace(/\{\{name\}\}/g, c.name || 'there')
          .replace(/\{\{webinar_link\}\}/g, c.webinar_link || '')
          .replace(/\{\{webinar_date\}\}/g, c.webinar_date ? new Date(c.webinar_date).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' }) : '');

        return {
          contact_id: c.id,
          message: rendered,
          scheduled_at: new Date(scheduled_at).toISOString(),
          status: 'queued',
        };
      });

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
