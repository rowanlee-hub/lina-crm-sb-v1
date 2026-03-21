import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_TOKEN = process.env.GHL_API_TOKEN || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';

// GHL custom field IDs
const FIELD_WEBINAR_LINK = 'wvzW8J8U7fpqTvqBzupT';
const FIELD_WEBINAR_DATE = 'wp0HiAQ1jCxerLvGfdfK';
const FIELD_UID = 'THEWgotMwP7nmqR5hukt';

function getCustomField(fields: any[], fieldId: string): string {
  const f = fields?.find((cf: any) => cf.id === fieldId);
  return f?.value?.toString() || '';
}

// Parse "2026-03-25 08:00 PM" or ISO date → "2026-03-25"
function parseWebinarDate(raw: string): string | null {
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  return null;
}

// Determine webinar date from tags (webinar-MMDD → latest date)
function webinarDateFromTags(tags: string[]): string | null {
  const year = new Date().getFullYear();
  const dates = tags
    .filter(t => /^webinar-\d{4}$/.test(t))
    .map(t => {
      const mmdd = t.replace('webinar-', '');
      return `${year}-${mmdd.substring(0, 2)}-${mmdd.substring(2, 4)}`;
    })
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

async function fetchGHLContacts(updatedAfter?: string): Promise<any[]> {
  const all: any[] = [];
  let nextPageUrl: string | null = `${GHL_API}/contacts/?locationId=${GHL_LOCATION_ID}&limit=100&sortBy=date_updated&order=desc`;

  while (nextPageUrl) {
    const fetchUrl: string = nextPageUrl;
    nextPageUrl = null;

    console.log('GHL Sync: fetching', fetchUrl);
    const resp: Response = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${GHL_TOKEN}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('GHL API error:', resp.status, errText);
      break;
    }

    const data = await resp.json();
    const contacts = data.contacts || [];
    const meta = data.meta || {};
    console.log(`GHL Sync: page returned ${contacts.length} contacts (total: ${meta.total})`);

    // Filter by dateUpdated if we only want recent changes
    if (updatedAfter) {
      const cutoff = new Date(updatedAfter).getTime();
      let foundOlder = false;
      for (const c of contacts) {
        if (new Date(c.dateUpdated).getTime() >= cutoff) {
          all.push(c);
        } else {
          foundOlder = true;
        }
      }
      // GHL returns contacts sorted by dateUpdated desc
      // Once we find contacts older than cutoff, stop paginating
      if (foundOlder) break;
    } else {
      all.push(...contacts);
    }

    // Use GHL's nextPageUrl for pagination
    nextPageUrl = meta.nextPageUrl || null;
  }

  return all;
}

export async function GET(req: Request) {
  try {
    if (!GHL_TOKEN || !GHL_LOCATION_ID) {
      return NextResponse.json({ success: false, error: 'GHL credentials not configured' }, { status: 500 });
    }

    // ?hours=N sets the lookback window (default: 1 hour, max: 168 = 7 days)
    const { searchParams } = new URL(req.url);
    const hoursBack = Math.min(parseInt(searchParams.get('hours') || '1', 10) || 1, 168);
    const updatedAfter = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    console.log(`GHL Sync: fetching contacts updated in last ${hoursBack}h (since ${updatedAfter})`);

    const ghlContacts = await fetchGHLContacts(updatedAfter);
    console.log(`GHL Sync: found ${ghlContacts.length} recently updated contacts`);

    let synced = 0;
    let created = 0;
    let skipped = 0;

    for (const ghl of ghlContacts) {
      const ghlId = ghl.id;
      const email = ghl.email || '';
      const phone = ghl.phone || '';
      const name = ghl.contactName || `${ghl.firstName || ''} ${ghl.lastName || ''}`.trim() || '';
      const tags: string[] = ghl.tags || [];
      const customFields = ghl.customFields || [];

      const webinarLink = getCustomField(customFields, FIELD_WEBINAR_LINK);
      const webinarDateRaw = getCustomField(customFields, FIELD_WEBINAR_DATE);
      const uid = getCustomField(customFields, FIELD_UID);

      // Determine webinar date: from tags first, then from custom field
      const webinarDate = webinarDateFromTags(tags) || parseWebinarDate(webinarDateRaw);

      // Find existing contact in Lina
      let existing: any = null;

      if (ghlId) {
        const { data } = await supabase.from('contacts').select('*').eq('ghl_contact_id', ghlId).limit(1);
        existing = data?.[0] ?? null;
      }
      if (!existing && email) {
        const { data } = await supabase.from('contacts').select('*').eq('email', email).limit(1);
        existing = data?.[0] ?? null;
      }
      if (!existing && phone) {
        const cleanPhone = phone.replace(/[\s\-()]/g, '');
        const { data } = await supabase.from('contacts').select('*').eq('phone', cleanPhone).limit(1);
        existing = data?.[0] ?? null;
      }

      const now = new Date().toISOString();

      if (existing) {
        // Merge tags (never remove, only add)
        const mergedTags = [...new Set([...(existing.tags || []), ...tags])];
        const tagsChanged = mergedTags.length !== (existing.tags || []).length;

        const patch: Record<string, any> = { updated_at: now };

        // Update fields only if GHL has data and it differs
        if (name && name !== existing.name) patch.name = name;
        if (email && email !== existing.email) patch.email = email;
        if (phone && phone !== existing.phone) patch.phone = phone;
        if (ghlId && ghlId !== existing.ghl_contact_id) patch.ghl_contact_id = ghlId;
        if (uid && uid !== (existing.uid || '')) patch.uid = uid;
        if (webinarLink && webinarLink !== existing.webinar_link) patch.webinar_link = webinarLink;
        if (webinarDate && webinarDate !== existing.webinar_date?.substring(0, 10)) patch.webinar_date = webinarDate;
        if (tagsChanged) patch.tags = mergedTags;

        // Skip if nothing changed
        if (Object.keys(patch).length <= 1) {
          skipped++;
          continue;
        }
        console.log(`GHL Sync [${email}]: updating —`, JSON.stringify(Object.keys(patch).filter(k => k !== 'updated_at')));

        await supabase.from('contacts').update(patch).eq('id', existing.id);

        // Log what changed
        const changes: string[] = [];
        if (patch.name) changes.push('name');
        if (patch.email) changes.push('email');
        if (patch.phone) changes.push('phone');
        if (patch.webinar_link) changes.push('webinar link');
        if (patch.webinar_date) changes.push(`webinar date: ${webinarDate}`);
        if (patch.tags) {
          const newTags = tags.filter(t => !(existing.tags || []).includes(t));
          if (newTags.length) changes.push(`tags: +${newTags.join(', +')}`);
        }
        if (patch.uid) changes.push('uid');

        if (changes.length > 0) {
          supabase.from('contact_history').insert({
            contact_id: existing.id,
            action: `GHL Sync [Auto]: ${changes.join(', ')}`,
          }).then(() => {});
        }

        // Trigger automations for new tags
        if (tagsChanged) {
          const newTags = tags.filter(t => !(existing.tags || []).includes(t));
          if (newTags.length > 0) {
            const { processAutomations } = await import('@/lib/automation-engine');
            for (const tag of newTags) {
              processAutomations('TAG_ADDED', tag, existing.id, existing.line_id || '');
            }
          }
        }

        // Auto-enroll in webinar sequence if webinar date changed
        if (patch.webinar_date && webinarDate !== existing.webinar_date?.substring(0, 10)) {
          const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
          enrollInWebinarSequence(existing.id, webinarDate!, name || existing.name).catch(console.error);
        }

        synced++;
      } else {
        // Create new contact
        const { data: newContact, error } = await supabase.from('contacts').insert({
          name: name || '',
          email: email || '',
          phone: phone || '',
          ghl_contact_id: ghlId,
          uid: uid || '',
          webinar_link: webinarLink || '',
          webinar_date: webinarDate || null,
          tags: tags || [],
          status: 'Lead',
        }).select('id').single();

        if (error) {
          console.error(`GHL Sync: failed to create contact ${email}:`, error.message);
          skipped++;
          continue;
        }

        supabase.from('contact_history').insert({
          contact_id: newContact.id,
          action: `GHL Sync [Auto]: Created from GoHighLevel`,
        }).then(() => {});

        // Auto-enroll in webinar sequence
        if (webinarDate) {
          const { enrollInWebinarSequence } = await import('@/lib/webinar-sequence');
          enrollInWebinarSequence(newContact.id, webinarDate, name).catch(console.error);
        }

        created++;
      }
    }

    const result = { success: true, total: ghlContacts.length, synced, created, skipped };
    console.log('GHL Sync complete:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('GHL Sync Error:', error);
    const msg = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
