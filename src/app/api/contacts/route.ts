import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Format to match the previous frontend structure
    const formattedContacts = contacts.map(c => ({
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      lineId: c.line_id || '',
      tags: c.tags || [],
      status: c.status || 'Lead',
      webinar: { link: c.webinar_link || '', dateTime: c.webinar_date || '' }
    }));

    return NextResponse.json(formattedContacts);
  } catch (error) {
    console.error("API GET Contacts Error:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
   try {
      const contact = await req.json();

      let dbResult;
      
      const payload = {
         name: contact.name,
         email: contact.email,
         phone: contact.phone,
         line_id: contact.lineId,
         tags: contact.tags,
         status: contact.status,
         webinar_link: contact.webinar?.link,
         updated_at: new Date().toISOString()
      };

      if (contact.id) {
         // Update existing
         const { data, error } = await supabase
            .from('contacts')
            .update(payload)
            .eq('id', contact.id)
            .select()
            .single();
         
         if (error) throw error;
         dbResult = data;
         
         // If a new history item was added locally, save it
         if (contact.history && contact.history.length > 0) {
             const latestLog = contact.history[0];
             // Simple duplicate check could be done here, but assuming it's fresh
             if (latestLog.action) {
                 await supabase.from('contact_history').insert({
                     contact_id: contact.id,
                     action: latestLog.action
                 });
             }
         }

      } else {
         // Insert new
         const { data, error } = await supabase
            .from('contacts')
            .insert(payload)
            .select()
            .single();
            
         if (error) throw error;
         dbResult = data;
      }

      return NextResponse.json({ 
         success: true, 
         message: "Saved to Supabase successfully",
         id: dbResult.id
      });
      
   } catch (error: any) {
      console.error("API POST Contacts Error:", error);
      return NextResponse.json({ success: false, error: error.message || 'Error saving contact' }, { status: 500 });
   }
}
