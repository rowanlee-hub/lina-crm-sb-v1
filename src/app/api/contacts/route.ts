import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { pushContactToGHL } from '@/lib/ghl-sync';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pendingFollowup = searchParams.get('pending_followup') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (pendingFollowup) {
      query = query.not('follow_up_at', 'is', null).lte('follow_up_at', new Date().toISOString());
    }

    const { data: contacts, error: contactError, count } = await query;

    if (contactError) {
      return NextResponse.json({ success: false, error: contactError.message }, { status: 500 });
    }

    const contactIds = contacts.map(c => c.id);
    const { data: history, error: historyError } = await supabase
      .from('contact_history')
      .select('*')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false });

    if (historyError) {
      return NextResponse.json({ success: false, error: historyError.message }, { status: 500 });
    }

    const formattedContacts = contacts.map(c => {
      const contactHistory = history
        .filter(h => h.contact_id === c.id)
        .map(h => ({ id: h.id, date: h.created_at, action: h.action }));

      return {
        id: c.id,
        name: c.name || '',
        email: c.email || '',
        phone: c.phone || '',
        lineId: c.line_id || '',
        tags: c.tags || [],
        status: c.status || 'Lead',
        webinar: { link: c.webinar_link || '', dateTime: c.webinar_date || '' },
        notes: c.notes || '',
        ghl_contact_id: c.ghl_contact_id || '',
        uid: c.uid || '',
        attended: c.attended || false,
        purchased: c.purchased || false,
        follow_up_note: c.follow_up_note || '',
        ghl_tags: c.ghl_tags || [],
        history: contactHistory,
      };
    });

    // If paginated request, wrap with metadata; otherwise return bare array for backwards compat
    if (searchParams.get('page') || searchParams.get('limit')) {
      return NextResponse.json({ data: formattedContacts, total: count ?? 0, page, limit });
    }
    return NextResponse.json(formattedContacts);
  } catch (error) {
    console.error('API GET Contacts Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const contact = await req.json();

    const payload: Record<string, unknown> = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      line_id: contact.lineId,
      tags: contact.tags,
      status: contact.status,
      webinar_link: contact.webinar?.link,
      webinar_date: contact.webinar?.dateTime || null,
      notes: contact.notes,
      ghl_contact_id: contact.ghl_contact_id,
      uid: contact.uid || '',
      attended: contact.attended,
      purchased: contact.purchased,
      follow_up_note: contact.follow_up_note || '',
      ghl_tags: contact.ghl_tags || [],
      updated_at: new Date().toISOString(),
    };

    let dbResult;

    if (contact.id) {
      // Fetch existing to compare tags
      const { data: existing } = await supabase
        .from('contacts')
        .select('tags, line_id, ghl_contact_id')
        .eq('id', contact.id)
        .single();

      const oldTags: string[] = existing?.tags || [];
      const newTags: string[] = contact.tags || [];

      const { data, error } = await supabase
        .from('contacts')
        .update(payload)
        .eq('id', contact.id)
        .select()
        .single();

      if (error) throw error;
      dbResult = data;

      // Auto-register new tags in tag_definitions + sync to LINE audience
      const addedTags = newTags.filter(t => !oldTags.includes(t));
      const lineId = existing?.line_id || contact.lineId;
      for (const tag of addedTags) {
        await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' });
        // Sync to LINE Audience Group (fire-and-forget)
        if (lineId) {
          const { syncTagToLineAudience } = await import('@/lib/line-audience');
          syncTagToLineAudience(lineId, tag).catch(console.error);
        }
        // Trigger automations
        const { processAutomations } = await import('@/lib/automation-engine');
        processAutomations('TAG_ADDED', tag, contact.id, contact.lineId);
      }

      // Push changes to GHL (fire-and-forget)
      const ghlId = existing?.ghl_contact_id || contact.ghl_contact_id;
      if (ghlId) {
        pushContactToGHL({ ...contact, ghl_contact_id: ghlId }).catch(console.error);
      }

      // Save latest history item if provided
      if (contact.history && contact.history.length > 0) {
        const latestLog = contact.history[0];
        if (latestLog.action) {
          await supabase.from('contact_history').insert({
            contact_id: contact.id,
            action: latestLog.action,
          });
        }
      }
    } else {
      const { data, error } = await supabase
        .from('contacts')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      dbResult = data;

      // Auto-register tags
      for (const tag of (contact.tags || [])) {
        await supabase.from('tag_definitions').upsert({ name: tag }, { onConflict: 'name' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Saved to Supabase successfully',
      id: dbResult.id,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error saving contact';
    console.error('API POST Contacts Error:', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting contact';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

