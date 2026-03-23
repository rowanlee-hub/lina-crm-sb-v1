import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { syncWebinarTagAndDate } from '@/lib/webinar-utils';

// Supports both GHL API v1 (rest.gohighlevel.com) and v2 (services.leadconnectorhq.com)
// v1 uses a simple location-level API key; v2 uses PITs with location token exchange.
const GHL_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';

/**
 * Fetch one page of contacts from GHL.
 * Tries v1 API first (simpler, location-scoped key), falls back to v2.
 */
async function fetchGHLPage(skip: number): Promise<{ contacts: any[]; hasMore: boolean }> {
  // Try v1 API (works with location-level API key)
  const v1Url = `https://rest.gohighlevel.com/v1/contacts/?limit=100&skip=${skip}`;
  const v1Res = await fetch(v1Url, {
    headers: {
      'Authorization': `Bearer ${GHL_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (v1Res.ok) {
    const data = await v1Res.json();
    const contacts = data.contacts ?? [];
    const total = data.meta?.total ?? contacts.length;
    return { contacts, hasMore: skip + contacts.length < total };
  }

  // Fall back to v2 API
  const v2Url = `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOCATION_ID}&limit=100&skip=${skip}`;
  const v2Res = await fetch(v2Url, {
    headers: {
      'Authorization': `Bearer ${GHL_KEY}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
    },
  });

  if (!v2Res.ok) {
    const err = await v2Res.text();
    throw new Error(`GHL API error ${v2Res.status}: ${err}`);
  }
  const data = await v2Res.json();
  const contacts = data.contacts ?? [];
  const total = data.meta?.total ?? contacts.length;
  return { contacts, hasMore: skip + contacts.length < total };
}


/**
 * Upsert a single GHL contact into Supabase using the same logic as the webhook.
 */
async function upsertContact(c: any): Promise<'created' | 'updated' | 'skipped'> {
  const ghlId = c.id;
  const name = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || '';
  const email = (c.email || '').toLowerCase();
  const phone = (c.phone || '').replace(/[\s\-()]/g, '');
  const uid = c.customFields?.find((f: any) => f.key === 'uid' || f.id === 'uid')?.value || '';
  const rawTags: string[] = Array.isArray(c.tags) ? c.tags : [];
  let tags = rawTags.flatMap((t: string) => t.split(',').map((s: string) => s.trim())).filter(Boolean);
  // Normalise webinar tags: webinar0325 → webinar-0325
  tags = tags.map(t => t.replace(/^webinar(\d{4})$/, 'webinar-$1'));

  // Sync webinar tag ↔ date (always resolves to nearest Wednesday)
  const synced = syncWebinarTagAndDate(tags, null);
  tags = synced.tags;
  let webinar_date: string | null = synced.webinar_date;

  if (!webinar_date) {
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'active_webinar_date').single();
    webinar_date = setting?.value || null;
  }

  // Find existing by ghl_contact_id → email → phone
  let existing: any = null;
  if (ghlId) {
    const { data } = await supabase.from('contacts').select('*').eq('ghl_contact_id', ghlId).single();
    existing = data;
  }
  if (!existing && email) {
    const { data } = await supabase.from('contacts').select('*').eq('email', email).single();
    existing = data;
  }
  if (!existing && phone) {
    const { data } = await supabase.from('contacts').select('*').eq('phone', phone).single();
    existing = data;
  }

  const now = new Date().toISOString();
  const dayOfWeek = new Date().getDay();

  // Auto-register all tags in tag_definitions
  if (tags.length > 0) {
    for (const tag of tags) {
      await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' });
    }
  }

  if (existing) {
    const mergedTags = [...new Set([...(existing.tags || []), ...tags])];
    const merged = syncWebinarTagAndDate(mergedTags, webinar_date || existing.webinar_date);
    const { error } = await supabase.from('contacts').update({
      name: name || existing.name,
      email: email || existing.email,
      phone: phone || existing.phone,
      ghl_contact_id: ghlId || existing.ghl_contact_id,
      uid: uid || existing.uid || '',
      webinar_date: merged.webinar_date || existing.webinar_date,
      tags: merged.tags,
      signup_day: existing.signup_day ?? dayOfWeek,
      updated_at: now,
    }).eq('id', existing.id);

    if (error) throw error;
    return 'updated';
  } else {
    if (!ghlId && !email) return 'skipped';
    const { error } = await supabase.from('contacts').insert({
      name,
      email,
      phone,
      ghl_contact_id: ghlId,
      uid: uid || '',
      webinar_date: webinar_date || null,
      tags,
      signup_day: dayOfWeek,
      status: 'Lead',
    });
    if (error) throw error;
    return 'created';
  }
}

export async function POST() {
  if (!GHL_KEY || !GHL_LOCATION_ID) {
    return NextResponse.json({ success: false, error: 'GHL_API_KEY or GHL_LOCATION_ID not configured' }, { status: 500 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let skip = 0;
  let pages = 0;

  try {
    let hasMore = true;
    while (hasMore && pages < 20) {
      const { contacts, hasMore: more } = await fetchGHLPage(skip);
      pages++;
      hasMore = more;
      skip += contacts.length;

      for (const c of contacts) {
        try {
          const result = await upsertContact(c);
          if (result === 'created') created++;
          else if (result === 'updated') updated++;
          else skipped++;
        } catch (err) {
          console.error('[GHL Pull] Failed to upsert contact:', c.id, err);
          errors++;
        }
      }

      if (contacts.length === 0) break;
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
      total: created + updated + skipped + errors,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Pull failed';
    console.error('[GHL Pull All] Error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
