import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET — list workflow enrollments for a contact (or all)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get('contact_id');

    let query = supabase
      .from('workflow_enrollments')
      .select('*, workflows(id, name)')
      .order('id', { ascending: false });

    if (contactId) {
      query = query.eq('contact_id', contactId);
    } else {
      query = query.limit(200);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (err: unknown) {
    return NextResponse.json([], { status: 500 });
  }
}

// POST — manually enroll a contact into a workflow
export async function POST(req: Request) {
  try {
    const { contact_id, workflow_id } = await req.json();
    if (!contact_id || !workflow_id) {
      return NextResponse.json({ success: false, error: 'contact_id and workflow_id required' }, { status: 400 });
    }

    const { enrollContactInWorkflow } = await import('@/lib/workflow-engine');
    await enrollContactInWorkflow(workflow_id, contact_id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Enrollment failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE — cancel a workflow enrollment
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });

    // Get enrollment info for history logging
    const { data: enrollment } = await supabase
      .from('workflow_enrollments')
      .select('contact_id, workflows(name)')
      .eq('id', id)
      .single();

    // Mark enrollment as completed
    await supabase.from('workflow_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id);

    // Clean up any pending waits
    await supabase.from('workflow_waiting').delete().eq('enrollment_id', id);

    // Clean up queued messages
    await supabase.from('message_queue')
      .update({ status: 'cancelled' })
      .eq('enrollment_id', id)
      .eq('status', 'queued');

    // Log history
    if (enrollment) {
      const wfName = (enrollment as any).workflows?.name || 'Unknown';
      await supabase.from('contact_history').insert({
        contact_id: enrollment.contact_id,
        action: `Workflow Removed [Manual]: ${wfName}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to remove enrollment';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
