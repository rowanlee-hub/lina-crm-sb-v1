/**
 * GHL (GoHighLevel) Two-Way Sync Helper
 * Pushes Lina contact changes back to GoHighLevel via GHL API v2.
 *
 * Required env vars:
 *   GHL_API_KEY — your GoHighLevel private API key (Location API key)
 *   GHL_LOCATION_ID — your GHL Location (sub-account) ID
 */

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';

interface GHLContact {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${GHL_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
}

/**
 * Push a complete contact update to GHL.
 * Uses contact's ghl_contact_id to find the right GHL record.
 */
export async function pushContactToGHL(contact: {
  ghl_contact_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}): Promise<boolean> {
  if (!GHL_KEY || !contact.ghl_contact_id) return false;

  try {
    const nameParts = (contact.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const payload: GHLContact = {
      firstName,
      lastName,
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags,
    };

    const res = await fetch(`${GHL_BASE}/contacts/${contact.ghl_contact_id}`, {
      method: 'PUT',
      headers: ghlHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[GHL Sync] Failed to push contact ${contact.ghl_contact_id}:`, err);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[GHL Sync] pushContactToGHL error:', e);
    return false;
  }
}

/**
 * Add a tag to a GHL contact.
 */
export async function addTagToGHL(ghlContactId: string, tag: string): Promise<boolean> {
  if (!GHL_KEY || !ghlContactId) return false;

  try {
    const res = await fetch(`${GHL_BASE}/contacts/${ghlContactId}/tags`, {
      method: 'POST',
      headers: ghlHeaders(),
      body: JSON.stringify({ tags: [tag] }),
    });
    return res.ok;
  } catch (e) {
    console.error('[GHL Sync] addTagToGHL error:', e);
    return false;
  }
}

/**
 * Remove a tag from a GHL contact.
 */
export async function removeTagFromGHL(ghlContactId: string, tag: string): Promise<boolean> {
  if (!GHL_KEY || !ghlContactId) return false;

  try {
    const res = await fetch(`${GHL_BASE}/contacts/${ghlContactId}/tags`, {
      method: 'DELETE',
      headers: ghlHeaders(),
      body: JSON.stringify({ tags: [tag] }),
    });
    return res.ok;
  } catch (e) {
    console.error('[GHL Sync] removeTagFromGHL error:', e);
    return false;
  }
}

/**
 * Bulk sync — push all Lina contacts with a ghl_contact_id to GHL.
 * Useful for the "Sync All Now" button.
 */
export async function bulkSyncToGHL(contacts: Array<{
  ghl_contact_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}>): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;

  for (const c of contacts) {
    if (!c.ghl_contact_id) continue;
    const ok = await pushContactToGHL(c);
    if (ok) pushed++;
    else failed++;
    // Rate limit: don't hammer GHL API
    await new Promise(r => setTimeout(r, 100));
  }

  return { pushed, failed };
}
