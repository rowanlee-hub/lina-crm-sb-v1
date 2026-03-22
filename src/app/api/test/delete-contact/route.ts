import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * DELETE /api/test/delete-contact?id=xxx
 * Test endpoint: fully deletes a contact and all related records.
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Delete in order (FK constraints)
  const tables = [
    { table: 'webinar_scheduled_messages', column: 'contact_id' },
    { table: 'webinar_enrollments', column: 'contact_id' },
    { table: 'workflow_waiting', column: 'contact_id' },
    { table: 'message_queue', column: 'contact_id' },
    { table: 'workflow_enrollments', column: 'contact_id' },
    { table: 'contact_history', column: 'contact_id' },
    { table: 'reminders', column: 'contact_id' },
  ];

  for (const { table, column } of tables) {
    await supabase.from(table).delete().eq(column, id);
  }

  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, deleted: id });
}
