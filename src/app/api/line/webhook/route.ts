import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';

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
      console.log("Received LINE event:", JSON.stringify(event));
      const userId = event.source?.userId;
      
      if (!userId) continue;

      // Ensure user exists in Supabase
      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('line_id', userId)
        .single();

      if (event.type === 'follow') {
         // User added the bot. Automatically Tag them
         console.log(`User ${userId} followed the account.`);
         const defaultTag = 'Webinar-Reminder-Sequence';
         
         if (contact) {
            // Add tag if not exists
            const currentTags = contact.tags || [];
            if (!currentTags.includes(defaultTag)) {
               await supabase.from('contacts').update({ tags: [...currentTags, defaultTag] }).eq('line_id', userId);
            }
         } else {
            // Create new contact with tag
            await supabase.from('contacts').insert({
               line_id: userId,
               name: `Line User ${userId.substring(0, 5)}`,
               tags: [defaultTag],
            });
         }
      } 
      else if (event.type === 'message' && event.message.type === 'text') {
        const messageText = event.message.text.toLowerCase();
        console.log(`User ${userId} sent message: ${messageText}`);

        // 1. Log the message history in Supabase
        if (contact) {
            await supabase.from('contact_history').insert({
                contact_id: contact.id,
                action: `Message received: ${event.message.text}`
            });
        }

        // 2. Auto-tagging logic based on Keywords
        const tagsToAdd: string[] = [];
        
        if (messageText.includes('webinar') || messageText.includes('register')) {
            tagsToAdd.push('Webinar-Registered');
        }
        if (messageText.includes('cancel')) {
            tagsToAdd.push('Canceled');
        }

        if (tagsToAdd.length > 0) {
            const currentTags = contact?.tags || [];
            // Merge unique tags
            const newTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
            
            if (contact) {
                await supabase.from('contacts').update({ tags: newTags }).eq('line_id', userId);
            } else {
                await supabase.from('contacts').insert({
                    line_id: userId,
                    name: `Line User ${userId.substring(0, 5)}`,
                    tags: newTags,
                });
            }
            console.log(`Auto-tagged ${userId} with: ${tagsToAdd.join(', ')}`);
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
