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
 * Parse a webinar-MMDD tag into a YYYY-MM-DD date string.
 * Always resolves to the nearest Wednesday matching that MMDD.
 * Checks current year first, then next year (for Dec tags seen in Jan).
 */
export function webinarTagToDate(tag: string): string | null {
  const match = tag.match(/^webinar-(\d{2})(\d{2})$/);
  if (!match) return null;
  const mm = parseInt(match[1], 10);
  const dd = parseInt(match[2], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const now = new Date();
  const year = now.getFullYear();

  // Try current year, then next year
  for (const y of [year, year + 1]) {
    const d = new Date(Date.UTC(y, mm - 1, dd));
    // Validate the date is real (e.g. Feb 30 would roll over)
    if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) continue;
    // Find nearest Wednesday (day 3)
    const day = d.getUTCDay();
    const diff = (3 - day + 7) % 7;
    // If already Wednesday, diff=0; otherwise snap forward to next Wed
    // But if the tag date IS the intended webinar day, trust it even if not Wed
    // (handles edge cases). Prefer snapping to nearest Wed within ±3 days.
    const nearestDiff = diff <= 3 ? diff : diff - 7;
    const wed = new Date(d.getTime() + nearestDiff * 24 * 60 * 60 * 1000);
    const wy = wed.getUTCFullYear();
    const wm = String(wed.getUTCMonth() + 1).padStart(2, '0');
    const wd = String(wed.getUTCDate()).padStart(2, '0');
    return `${wy}-${wm}-${wd}`;
  }
  return null;
}

/**
 * Given an array of tags, find the latest webinar-MMDD tag and return its date.
 */
export function latestWebinarDateFromTags(tags: string[]): string | null {
  const dates = tags
    .map(t => webinarTagToDate(t))
    .filter((d): d is string => d !== null)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * Build webinar tag from a YYYY-MM-DD date string.
 * e.g. "2026-03-25" → "webinar-0325"
 */
export function dateToWebinarTag(date: string): string {
  return `webinar-${date.substring(5, 7)}${date.substring(8, 10)}`;
}

/**
 * Sync a contact's webinar_date and webinar tag to be consistent.
 * Call this after tags or webinar_date change.
 * - If contact has webinar-MMDD tag(s), sets webinar_date to the latest one (nearest Wednesday).
 * - If contact has webinar_date but no matching tag, adds the tag.
 * Returns the updated { tags, webinar_date } to use in the DB update.
 */
export function syncWebinarTagAndDate(
  tags: string[],
  webinarDate: string | null
): { tags: string[]; webinar_date: string | null } {
  const dateFromTag = latestWebinarDateFromTags(tags);

  if (dateFromTag) {
    // Tag is source of truth — set webinar_date to match
    const expectedTag = dateToWebinarTag(dateFromTag);
    const updatedTags = [...tags];
    if (!updatedTags.includes(expectedTag)) updatedTags.push(expectedTag);
    return { tags: updatedTags, webinar_date: dateFromTag };
  }

  if (webinarDate) {
    // Has date but no tag — add the tag
    const tag = dateToWebinarTag(webinarDate);
    const updatedTags = [...tags];
    if (!updatedTags.includes(tag)) updatedTags.push(tag);
    // Snap to nearest Wednesday
    const snapped = webinarTagToDate(tag);
    return { tags: updatedTags, webinar_date: snapped || webinarDate };
  }

  return { tags, webinar_date: null };
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
 * Send multiple messages in a single LINE push API call (max 5 message objects).
 * Each string becomes one or more LINE message objects. All are sent in one request.
 */
export async function sendLineMultiPush(lineId: string, messages: string[]): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineId || messages.length === 0) return false;

  try {
    const allLineMessages = messages.flatMap(msg => buildLineMessages(msg));
    if (allLineMessages.length === 0) return false;

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineId, messages: allLineMessages.slice(0, 5) }),
    });
    return response.ok;
  } catch (err) {
    console.error('[sendLineMultiPush] Error:', err);
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
 * Sends 2 messages in one API call:
 *   1. Confirmation + webinar link
 *   2. Workbook link + instructions
 * Uses configurable templates from settings, falls back to defaults.
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

  const template1 = await getSetting('webinar_link_message_template')
    || `恭喜 {{name}}～ 已確認你註冊成功！\n\n這是你的這兩天的直播連結：\n{{webinar_link}}`;

  const template2 = await getSetting('webinar_workbook_message_template')
    || `👆👆點擊連結領取你的 Workbook：https://onegoodurl.com/ai-workbook\n\n這是團隊為你精心製作的workbook~ 包含了 Day 1 & 2 所分享到 "普通小白如何賺美金" 的秘密，空的部分就交給你上課時自行填充\n\n1. 你可以選擇印出來 OR\n2. 直接在pdf上做筆記~\n\n期待 晚上8:00pm 見到你 💪🔥`;

  const rendered1 = renderMessageSync(template1, contact);
  const rendered2 = renderMessageSync(template2, contact);

  const ok = await sendLineMultiPush(contact.line_id, [rendered1, rendered2]);

  if (ok) {
    await supabase.from('contact_history').insert({
      contact_id: contact.id,
      action: `Chat: [Auto] Webinar link + workbook sent`,
    });
    console.log(`[WebinarUtils] Auto-pushed webinar link + workbook to ${contact.line_id}`);
  } else {
    console.error(`[WebinarUtils] Failed to push webinar link to ${contact.line_id}`);
  }

  return ok;
}
