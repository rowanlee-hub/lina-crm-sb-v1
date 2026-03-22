import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { enrollInWebinarSequence } from '@/lib/webinar-sequence';

/**
 * POST /api/webinar-sequence/enroll
 * Manually enroll a contact in the webinar sequence.
 * Body: { contact_id: string }
 */
export async function POST(req: Request) {
  try {
    const { contact_id } = await req.json();
    if (!contact_id) {
      return NextResponse.json({ success: false, error: 'contact_id required' }, { status: 400 });
    }

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('id, name, webinar_date')
      .eq('id', contact_id)
      .single();

    if (error || !contact) {
      return NextResponse.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    if (!contact.webinar_date) {
      return NextResponse.json({ success: false, error: 'Contact has no webinar_date set' }, { status: 400 });
    }

    await enrollInWebinarSequence(contact.id, contact.webinar_date, contact.name || '');

    return NextResponse.json({ success: true, contact_id: contact.id, webinar_date: contact.webinar_date });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Enroll error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
