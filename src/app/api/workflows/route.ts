import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all workflows (with step count and enrollment count)
export async function GET() {
  try {
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with step count and enrollment count
    const enriched = [];
    for (const wf of workflows || []) {
      const { count: stepCount } = await supabase
        .from('workflow_steps')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', wf.id);

      const { count: enrollmentCount } = await supabase
        .from('workflow_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_id', wf.id)
        .eq('status', 'active');

      enriched.push({
        ...wf,
        step_count: stepCount || 0,
        active_enrollments: enrollmentCount || 0,
      });
    }

    return NextResponse.json(enriched);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching workflows';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// CREATE a new workflow
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { data, error } = await supabase.from('workflows').insert({
      name: body.name,
      description: body.description || '',
      trigger_type: body.trigger_type || 'TAG_ADDED',
      trigger_value: body.trigger_value || '',
      triggers: body.triggers || [],
      is_active: body.is_active ?? true,
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, workflow: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error creating workflow';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// UPDATE a workflow
export async function PATCH(req: Request) {
  try {
    const { id, ...updates } = await req.json();
    const { error } = await supabase.from('workflows').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error updating workflow';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE a workflow
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID is required');
    const { error } = await supabase.from('workflows').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting workflow';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
