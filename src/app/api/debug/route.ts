import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('DEBUG payload:', JSON.stringify(body, null, 2));
    return NextResponse.json({ received: body, timestamp: new Date().toISOString() });
  } catch {
    const text = await req.text().catch(() => 'could not read body');
    return NextResponse.json({ received_raw: text, timestamp: new Date().toISOString() });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Debug endpoint active.' });
}
