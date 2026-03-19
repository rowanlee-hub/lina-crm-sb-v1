import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GET steps for a workflow
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId');
    if (!workflowId) throw new Error('workflowId is required');

    const { data, error } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('step_order', { ascending: true });

    if (error) throw error;

    // Enrich with day names
    const enriched = (data || []).map(s => ({
      ...s,
      day_name: DAY_NAMES[s.day_of_week] || 'Unknown',
    }));

    return NextResponse.json(enriched);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching steps';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// CREATE a new step
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { data, error } = await supabase.from('workflow_steps').insert({
      workflow_id: body.workflow_id,
      parent_id: body.parent_id,
      branch_type: body.branch_type || 'DEFAULT',
      node_type: body.node_type || 'ACTION',
      step_order: body.step_order || 1,
      day_of_week: body.day_of_week,
      send_time: body.send_time,
      action_type: body.action_type || 'SEND_MESSAGE',
      message_template: body.message_template || '',
      action_value: body.action_value || '',
      wait_config: body.wait_config,
      condition_config: body.condition_config,
      position: body.position
    }).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, step: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error creating step';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// UPDATE a step
export async function PATCH(req: Request) {
  try {
    const { id, ...updates } = await req.json();
    const { error } = await supabase.from('workflow_steps').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error updating step';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE a step
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) throw new Error('ID is required');
    const { error } = await supabase.from('workflow_steps').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error deleting step';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
