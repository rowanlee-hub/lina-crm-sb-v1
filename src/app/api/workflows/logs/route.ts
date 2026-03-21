import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET — Workflow execution log
 * Combines enrollments + message_queue entries to show a full history.
 * Query params: workflowId (optional), limit (default 100)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get('workflowId');
    const limit = parseInt(searchParams.get('limit') || '100');

    // 1. Fetch enrollments
    let enrollQuery = supabase
      .from('workflow_enrollments')
      .select('id, workflow_id, contact_id, status, current_step_id, started_at, completed_at, contacts(name, line_id), workflows(name)')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (workflowId) {
      enrollQuery = enrollQuery.eq('workflow_id', workflowId);
    }

    const { data: enrollments, error: enErr } = await enrollQuery;
    if (enErr) throw enErr;

    // 2. Fetch message queue entries for these enrollments
    const enrollmentIds = (enrollments || []).map((e: any) => e.id);

    let logs: any[] = [];

    if (enrollmentIds.length > 0) {
      const { data: messages, error: msgErr } = await supabase
        .from('message_queue')
        .select('id, contact_id, enrollment_id, step_id, message, status, scheduled_at, sent_at, contacts(name)')
        .in('enrollment_id', enrollmentIds)
        .order('scheduled_at', { ascending: false })
        .limit(500);

      if (msgErr) throw msgErr;

      // 3. Also fetch step info for each unique step_id
      const stepIds = [...new Set((messages || []).map((m: any) => m.step_id).filter(Boolean))];
      let stepsMap: Record<string, any> = {};
      if (stepIds.length > 0) {
        const { data: stepsData } = await supabase
          .from('workflow_steps')
          .select('id, node_type, action_type, message_template, action_value, wait_config, condition_config')
          .in('id', stepIds);
        for (const s of stepsData || []) {
          stepsMap[s.id] = s;
        }
      }

      // Build log entries from messages
      logs = (messages || []).map((m: any) => {
        const step = m.step_id ? stepsMap[m.step_id] : null;
        let description = m.message || '';

        // Make __ACTION__ messages human-readable
        if (description.startsWith('__ACTION__:')) {
          const parts = description.split(':');
          const actionType = parts[1];
          const actionValue = parts.slice(2).join(':');
          if (actionType === 'ADD_TAG') description = `Add tag: ${actionValue}`;
          else if (actionType === 'REMOVE_TAG') description = `Remove tag: ${actionValue}`;
          else if (actionType === 'ENROLL_WORKFLOW') description = `Enroll in workflow: ${actionValue}`;
          else if (actionType === 'REMOVE_FROM_WORKFLOW') description = `Remove from workflow: ${actionValue}`;
          else description = `${actionType}: ${actionValue}`;
        } else if (description.length > 80) {
          description = description.substring(0, 80) + '...';
        }

        return {
          id: m.id,
          type: 'step',
          contact_id: m.contact_id,
          contact_name: m.contacts?.name || 'Unknown',
          enrollment_id: m.enrollment_id,
          step_id: m.step_id,
          step_type: step?.node_type || 'ACTION',
          action_type: step?.action_type || '',
          description,
          status: m.status,
          scheduled_at: m.scheduled_at,
          executed_at: m.sent_at,
        };
      });
    }

    // 4. Build enrollment-level summaries
    const enrollmentLogs = (enrollments || []).map((e: any) => ({
      id: e.id,
      type: 'enrollment',
      workflow_id: e.workflow_id,
      workflow_name: e.workflows?.name || 'Unknown',
      contact_id: e.contact_id,
      contact_name: e.contacts?.name || 'Unknown',
      contact_line_id: e.contacts?.line_id || null,
      status: e.status,
      started_at: e.started_at,
      completed_at: e.completed_at,
      steps: logs.filter((l: any) => l.enrollment_id === e.id),
    }));

    return NextResponse.json(enrollmentLogs);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error fetching logs';
    console.error('GET /api/workflows/logs error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
