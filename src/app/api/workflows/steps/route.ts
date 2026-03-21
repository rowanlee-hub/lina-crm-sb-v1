import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Extract a human-readable error message from any error shape (including Supabase) */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return fallback;
}

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
    console.error('GET /api/workflows/steps error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Error fetching steps') }, { status: 500 });
  }
}

// CREATE a new step
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Only include fields that exist in the DB — skip undefined values
    const insertPayload: Record<string, unknown> = {
      workflow_id: body.workflow_id,
      parent_id: body.parent_id || null,
      branch_type: body.branch_type || 'DEFAULT',
      node_type: body.node_type || 'ACTION',
      step_order: body.step_order || 1,
      action_type: body.action_type || 'SEND_MESSAGE',
      message_template: body.message_template || '',
      action_value: body.action_value || '',
      position_x: body.position_x || 0,
      position_y: body.position_y || 0,
    };

    // Only include nullable legacy fields if they have actual values
    if (body.day_of_week !== undefined && body.day_of_week !== null) {
      insertPayload.day_of_week = body.day_of_week;
    }
    if (body.send_time) {
      insertPayload.send_time = body.send_time;
    }

    // Only include JSONB fields if they have values
    if (body.wait_config) insertPayload.wait_config = body.wait_config;
    if (body.condition_config) insertPayload.condition_config = body.condition_config;
    if (body.schedule_config) insertPayload.schedule_config = body.schedule_config;
    if (body.router_config) insertPayload.router_config = body.router_config;
    if (body.filter_config) insertPayload.filter_config = body.filter_config;

    console.log('POST /api/workflows/steps payload:', JSON.stringify(insertPayload));

    const { data, error } = await supabase.from('workflow_steps').insert(insertPayload).select().single();

    if (error) throw error;
    return NextResponse.json({ success: true, step: data });
  } catch (error: unknown) {
    console.error('POST /api/workflows/steps error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Error creating step') }, { status: 500 });
  }
}

// UPDATE a step — only allow known fields to prevent DB errors
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) throw new Error('id is required');

    // Whitelist only columns that exist in the DB
    const allowedFields = [
      'parent_id', 'branch_type', 'node_type', 'step_order',
      'day_of_week', 'send_time', 'action_type', 'message_template',
      'action_value', 'wait_config', 'condition_config', 'schedule_config',
      'router_config', 'filter_config', 'position_x', 'position_y',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase.from('workflow_steps').update(updates).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('PATCH /api/workflows/steps error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Error updating step') }, { status: 500 });
  }
}

// BULK UPDATE positions
export async function PUT(req: Request) {
  try {
    const { positions } = await req.json();
    if (!Array.isArray(positions)) throw new Error('positions array is required');
    for (const p of positions) {
      await supabase.from('workflow_steps').update({
        position_x: p.position_x,
        position_y: p.position_y,
      }).eq('id', p.id);
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('PUT /api/workflows/steps error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Error saving positions') }, { status: 500 });
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
    console.error('DELETE /api/workflows/steps error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error, 'Error deleting step') }, { status: 500 });
  }
}
