import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';

function ghlHeaders() {
  return {
    'Authorization': `Bearer ${GHL_KEY}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
}

/**
 * Fetch one page of contacts from GHL.
 * Uses cursor-based pagination (startAfterId).
 */
async function fetchGHLPage(startAfterId?: string): Promise<{ contacts: any[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ locationId: GHL_LOCATION_ID, limit: '100' });
  if (startAfterId) params.set('startAfterId', startAfterId);

  const res = await fetch(`${GHL_BASE}/contacts/?${params}`, { headers: ghlHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GHL API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const contacts = data.contacts ?? [];
  const nextCursor = data.meta?.startAfterId && data.meta?.nextPage ? data.meta.startAfterId : null;
  return { contacts, nextCursor };
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
  const tags = rawTags.flatMap((t: string) => t.split(',').map((s: string) => s.trim())).filter(Boolean);

  // Determine webinar date from webinar-MMDD tags (pick latest)
  const year = new Date().getFullYear();
  const webinarDateTags = tags
    .filter((t: string) => /^webinar-\d{4}$/.test(t))
    .map((t: string) => {
      const mmdd = t.replace('webinar-', '');
      return `${year}-${mmdd.substring(0, 2)}-${mmdd.substring(2, 4)}`;
    })
    .sort();

  let webinar_date: string | null = null;
  if (webinarDateTags.length > 0) {
    webinar_date = webinarDateTags[webinarDateTags.length - 1];
  } else {
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

  if (existing) {
    const mergedTags = [...new Set([...(existing.tags || []), ...tags])];
    const { error } = await supabase.from('contacts').update({
      name: name || existing.name,
      email: email || existing.email,
      phone: phone || existing.phone,
      ghl_contact_id: ghlId || existing.ghl_contact_id,
      uid: uid || existing.uid || '',
      webinar_date: webinar_date || existing.webinar_date,
      tags: mergedTags,
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
  let cursor: string | undefined;
  let pages = 0;

  try {
    do {
      const { contacts, nextCursor } = await fetchGHLPage(cursor);
      pages++;

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

      cursor = nextCursor ?? undefined;
      // Safety: stop after 20 pages (2000 contacts) to avoid timeout
      if (pages >= 20) break;
    } while (cursor);

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
