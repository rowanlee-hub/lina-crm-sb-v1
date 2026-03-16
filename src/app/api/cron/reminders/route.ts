import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// This route should be triggered by Vercel Cron or GitHub Actions.
// e.g. every 15 minutes.
export async function GET() {
  try {
    // 1. Authenticate the Cron request (optional but recommended for production)
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 });
    // }

    console.log("Running Scheduled Reminder Cron Job...");

    // 2. Fetch all contacts that have the 'Webinar-Reminder-Sequence' tag
    // Supabase array filtering: contains
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .contains('tags', ['Webinar-Reminder-Sequence']);

    if (error) {
       console.error("Error fetching contacts for cron:", error);
       throw error;
    }

    if (!contacts || contacts.length === 0) {
      console.log("No contacts found with the target sequence tag.");
      return NextResponse.json({ success: true, dispatched: 0 });
    }

    let dispatchedCount = 0;
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!lineToken) {
       return NextResponse.json({ success: false, error: 'Missing LINE token' }, { status: 500 });
    }

    // 3. Loop through users and send the reminder
    // In a real scenario, you'd check `webinar_date` against the current time.
    // For this example, we simply send a broadcast to all tagged users.
    for (const user of contacts) {
       if (!user.line_id) continue;

       // Construct your reminder message
       const reminderMessage = `Hi ${user.name || 'there'}! This is an automated reminder that your webinar is starting soon. \nLink: ${user.webinar_link || 'TBD'}`;

       try {
          const response = await fetch('https://api.line.me/v2/bot/message/push', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${lineToken}`
             },
             body: JSON.stringify({
               to: user.line_id,
               messages: [ { type: 'text', text: reminderMessage } ]
             })
          });

          if (response.ok) {
            console.log(`Successfully sent reminder to ${user.line_id}`);
            dispatchedCount++;

            // Log history
            await supabase.from('contact_history').insert({
               contact_id: user.id,
               action: `Cron Reminder Sent: ${reminderMessage}`
            });

            // If it's a one-time reminder, you might want to REMOVE the tag here
             const newTags = user.tags.filter((t: string) => t !== 'Webinar-Reminder-Sequence');
             await supabase.from('contacts').update({ tags: newTags }).eq('id', user.id);

          } else {
             console.error(`Failed to send to lineId ${user.line_id}:`, await response.text());
          }
       } catch (err) {
         console.error(`Error sending message to ${user.line_id}`, err);
       }
    }

    return NextResponse.json({ success: true, dispatched: dispatchedCount });

  } catch (error: unknown) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
