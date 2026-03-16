import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { lineId, message } = await req.json();

    if (!lineId || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing lineId or message in request body' },
        { status: 400 }
      );
    }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
       console.error("Missing LINE_CHANNEL_ACCESS_TOKEN environment variable");
       return NextResponse.json(
         { success: false, error: 'Server is missing LINE Channel Access Token configuration. Please add it to .env.local' },
         { status: 500 }
       );
    }

    // LINE Messaging API - Push Message Endpoint
    const url = 'https://api.line.me/v2/bot/message/push';
    
    const payload = {
      to: lineId,
      messages: [
        {
          type: 'text',
          text: message
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("LINE API Error:", errorData);
      return NextResponse.json(
        { success: false, error: 'Failed to send message via LINE API', details: errorData },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, message: "Pushed successfully" });

   } catch (error: unknown) {
      console.error("LINE Messaging API Error:", error);
      return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
   }
}
