import { supabase } from './supabase';
import { buildLineMessages } from './line-messages';

/**
 * Calculate the next upcoming Wednesday date for webinar assignment.
 * - If today is before Wednesday 9pm MYT → this Wednesday
 * - If today is Wednesday after 9pm MYT or later in the week → next Wednesday
 * Returns YYYY-MM-DD string.
 */
export function getNextWebinarDate(): string {
  // Malaysia is UTC+8
  const now = new Date();
  const myt = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const utcDay = myt.getUTCDay(); // 0=Sun, 3=Wed
  const utcHour = myt.getUTCHours();

  // Days until next Wednesday
  let daysUntilWed = (3 - utcDay + 7) % 7;

  // If it's Wednesday but past 9pm MYT (21:00), advance to next week
  if (daysUntilWed === 0 && utcHour >= 21) {
    daysUntilWed = 7;
  }

  // If it's after Wednesday (Thu-Sat), daysUntilWed already points to next Wed
  // If it's Sun-Tue, daysUntilWed points to this Wed

  const target = new Date(now.getTime() + daysUntilWed * 24 * 60 * 60 * 1000);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Send a LINE push message to a user. Returns true if successful.
 */
export async function sendLinePushMessage(lineId: string, message: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineId || !message) return false;

  try {
    const lineMessages = buildLineMessages(message);
    if (lineMessages.length === 0) return false;

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineId, messages: lineMessages }),
    });
    return response.ok;
  } catch (err) {
    console.error('[sendLinePushMessage] Error:', err);
    return false;
  }
}

/**
 * Fetch a setting value from the settings table.
 */
export async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabase.from('settings').select('value').eq('key', key).single();
  return data?.value || null;
}

/**
 * Auto-push webinar link to a contact via LINE.
 * Uses configurable template from settings, falls back to default.
 */
export async function autoPushWebinarLink(contact: {
  id: string;
  line_id: string;
  webinar_link: string;
  name?: string;
  email?: string;
  phone?: string;
  webinar_date?: string;
  tags?: string[];
  status?: string;
  notes?: string;
  uid?: string;
  follow_up_note?: string;
}): Promise<boolean> {
  if (!contact.line_id || !contact.webinar_link) return false;

  const { renderMessageSync } = await import('./render-message');
  const template = await getSetting('webinar_link_message_template')
    || 'Here is your webinar link: {{webinar_link}}';

  const rendered = renderMessageSync(template, contact);
  const ok = await sendLinePushMessage(contact.line_id, rendered);

  if (ok) {
    await supabase.from('contact_history').insert({
      contact_id: contact.id,
      action: `Chat: [Auto] ${rendered}`,
    });
    console.log(`[WebinarUtils] Auto-pushed webinar link to ${contact.line_id}`);
  } else {
    console.error(`[WebinarUtils] Failed to push webinar link to ${contact.line_id}`);
  }

  return ok;
}
