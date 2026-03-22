import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildLineMessages } from '@/lib/line-messages';
import { renderMessage } from '@/lib/render-message';

/**
 * GET /api/test/send-reminders?contact_id=xxx&interval=5
 * Test endpoint: sends all pending webinar reminder messages for a contact
 * with a configurable interval (default 5 seconds) between each message.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contact_id');
  const interval = parseInt(searchParams.get('interval') || '5', 10) * 1000;

  if (!contactId) {
    return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
  }

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineToken) {
    return NextResponse.json({ error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' }, { status: 500 });
  }

  // Fetch all pending webinar messages for this contact, ordered by scheduled_at
  const { data: messages, error } = await supabase
    .from('webinar_scheduled_messages')
    .select(`
      id, contact_id, scheduled_at,
      webinar_sequence_steps(message, days_before),
      contacts(line_id, name, webinar_link, webinar_date)
    `)
    .eq('contact_id', contactId)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: 'No pending messages found' }, { status: 404 });
  }

  const results: Array<{ step: string; status: string; message: string }> = [];
  const now = new Date().toISOString();

  // Email prompt for contacts without webinar_link (Message B)
  const { data: emailPromptSetting } = await supabase.from('settings').select('value').eq('key', 'webinar_email_prompt').single();
  const EMAIL_PROMPT = '\n\n---\n' + (emailPromptSetting?.value || '請發送你的電郵給我們，讓我們發送你的專屬直播連結 🔗\nPlease send us your email so we can send you your unique webinar link.');

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const contact = (msg as any).contacts;
    const step = (msg as any).webinar_sequence_steps;

    if (!contact?.line_id || !step?.message) {
      await supabase.from('webinar_scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
      results.push({ step: `days_before=${step?.days_before}`, status: 'failed', message: 'No line_id or message' });
      continue;
    }

    // Render message with variables
    let rendered = await renderMessage(step.message, contact);

    // Message B: append email prompt if no webinar_link
    if (!contact.webinar_link) {
      rendered += EMAIL_PROMPT;
    }

    // Send via LINE
    const lineMessages = buildLineMessages(rendered);
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` },
      body: JSON.stringify({ to: contact.line_id, messages: lineMessages }),
    });

    const ok = response.ok;

    if (ok) {
      await supabase.from('webinar_scheduled_messages').update({ status: 'sent', sent_at: now }).eq('id', msg.id);
      await supabase.from('contact_history').insert({
        contact_id: msg.contact_id,
        action: `Chat: [Webinar Reminder Test] ${rendered.substring(0, 100)}`,
      });
    } else {
      await supabase.from('webinar_scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
    }

    results.push({
      step: `days_before=${step.days_before}`,
      status: ok ? 'sent' : 'failed',
      message: rendered,
    });

    // Wait interval before next message (skip delay after last message)
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return NextResponse.json({ success: true, total: results.length, results });
}
