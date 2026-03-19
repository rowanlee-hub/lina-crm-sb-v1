import { supabase } from './supabase';

const LINE_API = 'https://api.line.me/v2/bot';

function authHeader() {
  return { 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
}

/**
 * Find or create a LINE Audience Group for a given tag name.
 * Stores the audienceGroupId in tag_definitions.line_audience_id.
 */
async function getOrCreateAudienceGroup(tagName: string): Promise<number | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  // Check if we already have an audience group ID stored
  const { data: tagDef } = await supabase
    .from('tag_definitions')
    .select('line_audience_id')
    .eq('name', tagName)
    .single();

  if (tagDef?.line_audience_id) {
    return Number(tagDef.line_audience_id);
  }

  // Create a new audience group
  const res = await fetch(`${LINE_API}/audienceGroup/upload`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({
      description: `Lina Tag: ${tagName}`,
      isIfaAudience: false,
      audiences: [],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[LineAudience] Failed to create audience group for "${tagName}":`, err);
    return null;
  }

  const data = await res.json();
  const audienceGroupId: number = data.audienceGroupId;

  // Persist the audience group ID in tag_definitions
  await supabase
    .from('tag_definitions')
    .upsert({ name: tagName, line_audience_id: String(audienceGroupId) }, { onConflict: 'name' });

  console.log(`[LineAudience] Created audience group ${audienceGroupId} for tag "${tagName}"`);
  return audienceGroupId;
}

/**
 * Add a LINE user to the audience group for the given tag.
 * Call this whenever a tag is added to a contact that has a line_id.
 */
export async function syncTagToLineAudience(lineUserId: string, tagName: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineUserId) return;

  try {
    const audienceGroupId = await getOrCreateAudienceGroup(tagName);
    if (!audienceGroupId) return;

    const res = await fetch(`${LINE_API}/audienceGroup/upload`, {
      method: 'PUT',
      headers: authHeader(),
      body: JSON.stringify({
        audienceGroupId,
        audiences: [{ id: lineUserId }],
      }),
    });

    if (res.ok) {
      console.log(`[LineAudience] Added ${lineUserId} to audience "${tagName}" (${audienceGroupId})`);
    } else {
      const err = await res.json().catch(() => ({}));
      console.error(`[LineAudience] Failed to add user to audience "${tagName}":`, err);
    }
  } catch (err) {
    console.error(`[LineAudience] syncTagToLineAudience error:`, err);
  }
}
