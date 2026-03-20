import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

/**
 * Get or create a contact for a LINE userId — race-condition safe.
 * Uses upsert so concurrent webhook calls never create two contacts
 * for the same line_id.
 */
async function getOrCreateLineContact(userId: string, extraTags: string[] = []): Promise<{ contact: any; isNew: boolean } | null> {
  // First try a fast read
  const { data: existing } = await supabase
    .from('contacts')
    .select('*')
    .eq('line_id', userId)
    .single();

  if (existing) {
    // Merge any extra tags
    if (extraTags.length > 0) {
      const merged = [...new Set([...(existing.tags || []), ...extraTags])];
      if (merged.length !== (existing.tags || []).length) {
        await supabase.from('contacts').update({ tags: merged }).eq('id', existing.id);
        return { contact: { ...existing, tags: merged }, isNew: false };
      }
    }
    return { contact: existing, isNew: false };
  }

  // Not found — fetch display name then upsert (handles race between two concurrent requests)
  const displayName = await fetchLineProfile(userId);
  const { data: upserted, error } = await supabase
    .from('contacts')
    .upsert(
      { line_id: userId, name: displayName || `LINE User ${userId.substring(0, 8)}`, tags: extraTags },
      { onConflict: 'line_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    console.warn('[getOrCreateLineContact] upsert error, falling back to read:', error.message);
    const { data: fallback } = await supabase.from('contacts').select('*').eq('line_id', userId).single();
    return fallback ? { contact: fallback, isNew: false } : null;
  }
  return { contact: upserted, isNew: true };
}

// Fetch LINE user profile to get display name
async function fetchLineProfile(userId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.displayName || null;
  } catch {
    return null;
  }
}

// Try to merge a LINE userId into an existing contact by email, phone, or uid
// Returns the merged contact or null if no match found
async function tryMergeByField(
  field: 'email' | 'phone' | 'uid',
  value: string,
  lineUserId: string,
  lineContact: { id: string; tags: string[] } | null
) {
  // Fetch all contacts with this field value, then find one with no line_id
  const { data: candidates, error: fetchErr } = await supabase
    .from('contacts')
    .select('*')
    .eq(field, value);

  console.log(`[Merge] field=${field} value=${value} candidates=${candidates?.length ?? 0} fetchErr=${fetchErr?.message ?? 'none'}`);
  candidates?.forEach(c => console.log(`[Merge] candidate id=${c.id} line_id="${c.line_id}" name="${c.name}"`));

  // line_id is "unlinked" if it's null, undefined, or empty string
  const existing = candidates?.find(c => !c.line_id && c.id !== lineContact?.id) ?? null;

  if (!existing) {
    console.log(`[Merge] No unlinked candidate found — skipping merge`);
    return null;
  }
  console.log(`[Merge] Merging into contact id=${existing.id} name="${existing.name}"`);

  const mergedTags = [...new Set([...(existing.tags || []), ...(lineContact?.tags || [])])];

  // Delete LINE-only contact FIRST to free up the unique line_id before updating GHL contact
  if (lineContact) {
    await supabase.from('contact_history').update({ contact_id: existing.id }).eq('contact_id', lineContact.id);
    await supabase.from('contacts').delete().eq('id', lineContact.id);
    console.log(`[Merge] Deleted LINE-only contact ${lineContact.id}`);
  }

  // Now safe to write line_id onto the GHL contact (unique constraint cleared)
  const { error: updateErr } = await supabase.from('contacts').update({
    line_id: lineUserId,
    tags: mergedTags,
    updated_at: new Date().toISOString()
  }).eq('id', existing.id);

  if (updateErr) {
    console.error(`[Merge] Failed to update GHL contact with line_id:`, updateErr.message);
    return null;
  }

  await supabase.from('contact_history').insert({
    contact_id: existing.id,
    action: `Merged [Auto]: LINE ${lineUserId} linked via ${field}=${value}`
  });

  console.log(`[Webhook] Merged LINE user ${lineUserId} into contact ${existing.id} via ${field}`);
  return { ...existing, line_id: lineUserId, tags: mergedTags };
}

export async function POST(req: Request) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    
    if (!channelSecret) {
      console.error("Missing LINE_CHANNEL_SECRET environment variable.");
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get the signature from the headers
    const signature = req.headers.get('x-line-signature');
    if (!signature) {
      return NextResponse.json({ success: false, error: 'Bad Request: Missing signature' }, { status: 400 });
    }

    // Read the raw body as text for signature verification
    const bodyText = await req.text();

    // Verify signature
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(bodyText)
      .digest('base64');
      
    if (hash !== signature) {
      console.warn("Invalid LINE webhook signature");
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(bodyText);
    const events = body.events;

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({ success: true, message: 'No events found' });
    }

    // Process each event
    for (const event of events) {
      // Skip LINE redeliveries — they cause duplicate processing
      if (event.deliveryContext?.isRedelivery) {
        console.log(`[Webhook] Skipping redelivery event ${event.webhookEventId}`);
        continue;
      }

      console.log("Received LINE event:", JSON.stringify(event));
      const userId = event.source?.userId;

      if (!userId) continue;

      // Ensure user exists in Supabase
      if (event.type === 'follow') {
        console.log(`User ${userId} followed the account.`);
        const result = await getOrCreateLineContact(userId, ['Followed']);
        if (!result) continue;
        const { contact, isNew } = result;

        await supabase.from('contact_history').insert({ contact_id: contact.id, action: 'Event: Follow' });

        // Only trigger USER_FOLLOW automation for brand new contacts.
        // Block/unblock returners already exist in Supabase — skip to avoid re-enrolling.
        if (isNew) {
          console.log(`[Webhook] New follower ${userId} — triggering USER_FOLLOW automation`);
          const { processAutomations } = await import('@/lib/automation-engine');
          processAutomations('USER_FOLLOW', 'FOLLOW', contact.id, userId);
        } else {
          console.log(`[Webhook] Returning follower ${userId} (block/unblock) — skipping automation`);
        }
      }

      // ─── POSTBACK event: from rich menu buttons / flex message buttons ───
      else if (event.type === 'postback') {
        const data = event.postback?.data || '';
        console.log(`[Webhook] Postback from ${userId}: ${data}`);

        const result = await getOrCreateLineContact(userId);
        if (!result) continue;
        const { contact } = result;

        const contactId = contact.id;
        await supabase.from('contact_history').insert({ contact_id: contactId, action: `Postback: ${data}` });

        // Parse postback data — supports formats:
        //   action=tag&value=Interested
        //   tag=Interested
        const params = new URLSearchParams(data);
        const action = params.get('action');
        const tagValue = params.get('value') || params.get('tag');

        if ((action === 'tag' || action === null) && tagValue) {
          const currentTags: string[] = contact.tags || [];
          if (!currentTags.includes(tagValue)) {
            const newTags = [...currentTags, tagValue];
            await supabase.from('contacts').update({ tags: newTags }).eq('id', contactId);
            await supabase.from('contact_history').insert({
              contact_id: contactId,
              action: `Tag Added [Postback]: ${tagValue}`
            });
            const { processAutomations } = await import('@/lib/automation-engine');
            processAutomations('TAG_ADDED', tagValue, contactId, userId);
            console.log(`[Webhook] Postback tag added: ${tagValue} for ${userId}`);
          }
        }
      }

      // ─── TEXT message event ───────────────────────────────────────────────
      else if (event.type === 'message' && event.message.type === 'text') {
        const rawText = event.message.text;
        const messageText = rawText.toLowerCase().trim();

        const lineResult = await getOrCreateLineContact(userId);
        if (!lineResult) continue;
        let contact = lineResult.contact;

        let contactId = contact.id;

        // 1. Log the incoming message
        await supabase.from('contact_history').insert({ contact_id: contactId, action: `Received: ${rawText}` });

        // 2. MERGE DETECTION — email, phone, or uid sent in message
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const phoneRegex = /(\+?\d[\d\s\-()]{7,}\d)/;

        const emailMatch = rawText.match(emailRegex);
        const phoneMatch = rawText.match(phoneRegex);

        if (emailMatch) {
          const email = emailMatch[0].toLowerCase();
          console.log(`[Webhook] Email detected: ${email}`);
          const merged = await tryMergeByField('email', email, userId, contact);
          if (merged) {
            contact = merged as typeof contact;
            contactId = merged.id;
          } else {
            await supabase.from('contacts').update({ email, updated_at: new Date().toISOString() }).eq('id', contactId);
          }
        } else if (phoneMatch) {
          const phone = phoneMatch[1].replace(/[\s\-()]/g, '');
          console.log(`[Webhook] Phone detected: ${phone}`);
          const merged = await tryMergeByField('phone', phone, userId, contact);
          if (merged) {
            contact = merged as typeof contact;
            contactId = merged.id;
          } else {
            await supabase.from('contacts').update({ phone, updated_at: new Date().toISOString() }).eq('id', contactId);
          }
        } else {
          // UID match: check if the raw text exactly matches any contact's uid field
          const trimmedText = rawText.trim();
          if (trimmedText.length >= 4) {
            const { data: uidContact } = await supabase
              .from('contacts')
              .select('*')
              .eq('uid', trimmedText)
              .is('line_id', null)
              .single();
            if (uidContact) {
              const merged = await tryMergeByField('uid', trimmedText, userId, contact);
              if (merged) {
                contact = merged as typeof contact;
                contactId = merged.id;
              }
            }
          }
        }

        // 3. KEYWORD AUTO-TAGGING
        const keywordRules: Array<{ keywords: string[]; tag: string }> = [
          { keywords: ['interested', 'สนใจ', 'want to join', 'i want', 'sign me up'], tag: 'Interested' },
          { keywords: ['webinar', 'register', 'zoom', 'seminar'], tag: 'Webinar' },
          { keywords: ['cancel', 'not interested', 'no thanks', 'ยกเลิก'], tag: 'Canceled' },
          { keywords: ['price', 'cost', 'how much', 'ราคา', 'เท่าไร'], tag: 'Price Query' },
          { keywords: ['buy', 'purchase', 'i want to buy', 'ซื้อ'], tag: 'Ready to Buy' },
          { keywords: ['attended', 'watched', 'join webinar', 'i was there'], tag: 'Attended' },
        ];

        const currentTags: string[] = contact.tags || [];
        const tagsToAdd: string[] = [];

        for (const rule of keywordRules) {
          if (!currentTags.includes(rule.tag) && rule.keywords.some(kw => messageText.includes(kw))) {
            tagsToAdd.push(rule.tag);
          }
        }

        if (tagsToAdd.length > 0) {
          const newTags = [...currentTags, ...tagsToAdd];
          await supabase.from('contacts').update({ tags: newTags }).eq('id', contactId);
          console.log(`[Webhook] Auto-tagged ${userId} with: ${tagsToAdd.join(', ')}`);

          const { processAutomations } = await import('@/lib/automation-engine');
          for (const tag of tagsToAdd) {
            await supabase.from('contact_history').insert({
              contact_id: contactId,
              action: `Tag Added [Keyword]: ${tag}`
            });
            processAutomations('TAG_ADDED', tag, contactId, userId);
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: 'OK' });

  } catch (error) {
    console.error("LINE Webhook Error:", error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
