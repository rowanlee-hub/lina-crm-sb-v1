import { supabase } from './supabase';

/**
 * Renders a message template by substituting:
 * 1. Global custom values (e.g. {{webinar_link}} → stored global value)
 * 2. Per-contact variables (e.g. {{name}}, {{webinar_date}}, etc.)
 *
 * Custom values take the lowest priority — contact-specific data overrides them.
 */
export async function renderMessage(
  template: string,
  contact: Record<string, unknown> = {}
): Promise<string> {
  // 1. Load all global custom values
  const { data: customValues } = await supabase
    .from('custom_values')
    .select('key, value');

  let result = template;

  // 2. Apply global custom values first
  for (const cv of customValues || []) {
    result = result.replace(new RegExp(`\\{\\{${cv.key}\\}\\}`, 'g'), cv.value);
  }

  // 3. Apply per-contact variables (these override custom values if same key)
  const webinarDate = contact.webinar_date
    ? new Date(contact.webinar_date as string).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur'
      })
    : '';

  const tagsArr = Array.isArray(contact.tags) ? contact.tags : [];

  result = result
    .replace(/\{\{name\}\}/g, (contact.name as string) || 'there')
    .replace(/\{\{email\}\}/g, (contact.email as string) || '')
    .replace(/\{\{phone\}\}/g, (contact.phone as string) || '')
    .replace(/\{\{status\}\}/g, (contact.status as string) || '')
    .replace(/\{\{notes\}\}/g, (contact.notes as string) || '')
    .replace(/\{\{uid\}\}/g, (contact.uid as string) || '')
    .replace(/\{\{tags\}\}/g, tagsArr.join(', '))
    .replace(/\{\{webinar_link\}\}/g, (contact.webinar_link as string) || '')
    .replace(/\{\{webinar_date\}\}/g, webinarDate)
    .replace(/\{\{follow_up_note\}\}/g, (contact.follow_up_note as string) || '');

  return result;
}

/**
 * Sync version — uses pre-loaded custom values map.
 * Use this when you already have custom values loaded to avoid repeated DB calls.
 */
export function renderMessageSync(
  template: string,
  contact: Record<string, unknown> = {},
  customValues: Array<{ key: string; value: string }> = []
): string {
  let result = template;

  for (const cv of customValues) {
    result = result.replace(new RegExp(`\\{\\{${cv.key}\\}\\}`, 'g'), cv.value);
  }

  const webinarDate = contact.webinar_date
    ? new Date(contact.webinar_date as string).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur'
      })
    : '';

  const tagsArr = Array.isArray(contact.tags) ? contact.tags : [];

  return result
    .replace(/\{\{name\}\}/g, (contact.name as string) || 'there')
    .replace(/\{\{email\}\}/g, (contact.email as string) || '')
    .replace(/\{\{phone\}\}/g, (contact.phone as string) || '')
    .replace(/\{\{status\}\}/g, (contact.status as string) || '')
    .replace(/\{\{notes\}\}/g, (contact.notes as string) || '')
    .replace(/\{\{uid\}\}/g, (contact.uid as string) || '')
    .replace(/\{\{tags\}\}/g, tagsArr.join(', '))
    .replace(/\{\{webinar_link\}\}/g, (contact.webinar_link as string) || '')
    .replace(/\{\{webinar_date\}\}/g, webinarDate)
    .replace(/\{\{follow_up_note\}\}/g, (contact.follow_up_note as string) || '');
}
