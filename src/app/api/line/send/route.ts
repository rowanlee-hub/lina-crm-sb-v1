import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { renderMessage } from '@/lib/render-message';

export async function POST(req: Request) {
  try {
    const { lineId, message, contactId } = await req.json();

    if (!lineId || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing lineId or message in request body' },
        { status: 400 }
      );
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Server is missing LINE Channel Access Token configuration.' },
        { status: 500 }
      );
    }

    // Look up the contact to render {{variables}}
    let contact: Record<string, unknown> = {};
    if (contactId) {
      const { data } = await supabase.from('contacts').select('*').eq('id', contactId).single();
      if (data) contact = data;
    } else {
      const { data } = await supabase.from('contacts').select('*').eq('line_id', lineId).single();
      if (data) contact = data;
    }

    // Render {{variables}} (webinar_link, name, webinar_date, etc.)
    const rendered = await renderMessage(message, contact);

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ to: lineId, messages: [{ type: 'text', text: rendered }] }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LINE API Error:', errorData);
      return NextResponse.json(
        { success: false, error: 'Failed to send message via LINE API', details: errorData },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, message: 'Pushed successfully', rendered });

  } catch (error: unknown) {
    console.error('LINE Messaging API Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
