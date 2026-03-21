import { supabase } from './supabase';

// ============================================================
// WORKFLOW ENGINE — Multi-step automation sequences
// ============================================================

/**
 * Get the ISO week string for a date, e.g. "2026-W12"
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Replace template variables in a message
 * Supports: {{name}}, {{webinar_link}}, {{webinar_date}}, {{email}},
 *           {{phone}}, {{status}}, {{tags}}, {{notes}}, {{follow_up_note}}
 */
function renderTemplate(template: string, contact: Record<string, unknown>): string {
  const tagsArray = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
  const webinarDate = contact.webinar_date as string | undefined;
  const formattedDate = webinarDate
    ? new Date(webinarDate).toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return template
    .replace(/\{\{name\}\}/g, (contact.name as string) || 'there')
    .replace(/\{\{email\}\}/g, (contact.email as string) || '')
    .replace(/\{\{phone\}\}/g, (contact.phone as string) || '')
    .replace(/\{\{status\}\}/g, (contact.status as string) || '')
    .replace(/\{\{notes\}\}/g, (contact.notes as string) || '')
    .replace(/\{\{follow_up_note\}\}/g, (contact.follow_up_note as string) || '')
    .replace(/\{\{tags\}\}/g, tagsArray.join(', '))
    .replace(/\{\{webinar_link\}\}/g, (contact.webinar_link as string) || '')
    .replace(/\{\{webinar_date\}\}/g, formattedDate);
}

/**
 * Calculate the next occurrence of a given day_of_week + time
 * relative to the enrollment date, within the SAME webinar week.
 */
function calculateScheduledTime(
  enrolledAt: Date,
  stepDayOfWeek: number,  // 0=Sun ... 6=Sat
  sendTime: string,        // "HH:MM" format
  timezone: string = 'Asia/Kuala_Lumpur'
): Date | null {
  const signupDay = enrolledAt.getDay(); // 0=Sun ... 6=Sat
  
  // Calculate how many days ahead this step is from the enrollment
  let daysAhead = stepDayOfWeek - signupDay;
  if (daysAhead < 0) daysAhead += 7; // Next week occurrence
  
  const [hours, minutes] = sendTime.split(':').map(Number);
  
  const scheduledDate = new Date(enrolledAt);
  scheduledDate.setDate(scheduledDate.getDate() + daysAhead);
  scheduledDate.setHours(hours, minutes, 0, 0);
  
  if (scheduledDate.getTime() <= enrolledAt.getTime()) {
    return null;
  }
  
  return scheduledDate;
}

/**
 * Evaluate a condition node against a contact
 */
async function evaluateCondition(step: any, contact: any): Promise<boolean> {
  const config = step.condition_config;
  if (!config || !config.field) return false;

  const field = config.field;
  const val = contact[field];
  const target = config.value;

  console.log(`[WorkflowEngine] Evaluating condition: ${field} (${val}) ${config.operator} ${target}`);

  if (config.operator === '==') {
    // Handle boolean strings from UI
    if (target === 'true') return val === true;
    if (target === 'false') return val === false;
    return String(val) === String(target);
  }
  
  // Tag check
  if (field === 'tags') {
    const tags = contact.tags || [];
    return tags.includes(target);
  }

  return false;
}

/**
 * Executes a single workflow node for a contact enrollment
 */
export async function executeWorkflowNode(
  enrollmentId: string,
  nodeId: string
): Promise<void> {
  // 1. Get current state
  const { data: enrollment } = await supabase.from('workflow_enrollments').select('*, contacts(*)').eq('id', enrollmentId).single();
  const { data: step } = await supabase.from('workflow_steps').select('*').eq('id', nodeId).single();
  
  if (!enrollment || !step || enrollment.status !== 'active') return;
  const contact = enrollment.contacts;

  console.log(`[WorkflowEngine] Executing Node ${nodeId} (${step.node_type}) for contact ${contact.id}`);

  // 2. Handle Node Logic
  let nextNodeId: string | null = null;
  let delayTime: Date | null = null;

  if (step.node_type === 'CONDITION') {
    const result = await evaluateCondition(step, contact);
    const branch = result ? 'YES' : 'NO';
    const { data: nextStep } = await supabase
      .from('workflow_steps')
      .select('id')
      .eq('parent_id', step.id)
      .eq('branch_type', branch)
      .single();
    
    if (nextStep) await executeWorkflowNode(enrollmentId, nextStep.id);
    return; // Exit current execution branch
  }

  if (step.node_type === 'WAIT') {
    const amount = step.wait_config?.amount || 1;
    const unit = step.wait_config?.unit || 'days';
    const waitDate = new Date();
    if (unit === 'seconds') waitDate.setSeconds(waitDate.getSeconds() + amount);
    else if (unit === 'minutes') waitDate.setMinutes(waitDate.getMinutes() + amount);
    else if (unit === 'hours') waitDate.setHours(waitDate.getHours() + amount);
    else waitDate.setDate(waitDate.getDate() + amount);

    await supabase.from('workflow_waiting').insert({
      enrollment_id: enrollmentId,
      contact_id: contact.id,
      step_id: step.id,
      wait_until: waitDate.toISOString()
    });
    return; // Wait for cron
  }

  // Handle ACTION (Send Message / Tag)
  if (step.node_type === 'ACTION' || !step.node_type) {
    // Determine scheduling
    let sendAt = new Date();
    
    // Support legacy Day-of-Week scheduling
    if (step.day_of_week !== null && step.send_time) {
      const scheduled = calculateScheduledTime(new Date(), step.day_of_week, step.send_time);
      if (scheduled) sendAt = scheduled;
    }

    // Queue the action
    const actionPayload: any = {
      contact_id: contact.id,
      enrollment_id: enrollmentId,
      step_id: step.id,
      scheduled_at: sendAt.toISOString(),
      status: 'queued'
    };

    if (step.action_type === 'SEND_MESSAGE') {
      actionPayload.message = renderTemplate(step.message_template, contact);
    } else if (step.action_type === 'SCHEDULE_MESSAGE') {
      actionPayload.message = renderTemplate(step.message_template, contact);
      if (step.schedule_config?.scheduled_at) {
        actionPayload.scheduled_at = new Date(step.schedule_config.scheduled_at).toISOString();
      }
    } else if (step.action_type === 'ENROLL_WORKFLOW') {
      actionPayload.message = `__ACTION__:ENROLL_WORKFLOW:${step.action_value}`;
    } else if (step.action_type === 'REMOVE_FROM_WORKFLOW') {
      actionPayload.message = `__ACTION__:REMOVE_FROM_WORKFLOW:${step.action_value}`;
    } else {
      actionPayload.message = `__ACTION__:${step.action_type}:${step.action_value}`;
    }

    await supabase.from('message_queue').insert(actionPayload);
  }

  // Move to next step (DEFAULT path)
  const { data: nextStep } = await supabase
    .from('workflow_steps')
    .select('id')
    .eq('parent_id', step.id)
    .eq('branch_type', 'DEFAULT')
    .single();

  if (nextStep) {
    // If it was an immediate transition (no scheduling), recurse. 
    // Otherwise, the cron will handle the completion of the current step and trigger the next one.
    // Actually, we'll let the cron dispatch trigger the next node once the current one is "Sent"
    await supabase.from('workflow_enrollments').update({ current_step_id: step.id }).eq('id', enrollmentId);
  } else {
    // No more steps
    await supabase.from('workflow_enrollments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', enrollmentId);
  }
}

/**
 * ENROLL a contact into a workflow.
 */
export async function enrollContactInWorkflow(
  workflowId: string,
  contactId: string
): Promise<void> {
  console.log(`[WorkflowEngine] Enrolling contact ${contactId} in workflow ${workflowId}`);

  const { data: workflow } = await supabase.from('workflows').select('*').eq('id', workflowId).single();
  const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();

  if (!workflow || !workflow.is_active || !contact || !contact.line_id) return;

  const now = new Date();
  const currentWeek = getISOWeek(now);

  // Check existing active enrollment
  const { data: existing } = await supabase
    .from('workflow_enrollments')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .single();

  if (existing) return;

  // Create enrollment
  const { data: enrollment, error: enErr } = await supabase
    .from('workflow_enrollments')
    .insert({
      workflow_id: workflowId,
      contact_id: contactId,
      webinar_week: currentWeek,
      status: 'active'
    })
    .select()
    .single();

  if (enErr || !enrollment) return;

  // Find START/First node
  const { data: firstStep } = await supabase
    .from('workflow_steps')
    .select('id')
    .eq('workflow_id', workflowId)
    .is('parent_id', null)
    .order('step_order', { ascending: true })
    .limit(1)
    .single();

  if (firstStep) {
    await executeWorkflowNode(enrollment.id, firstStep.id);
  }

  // Update contact metadata
  await supabase.from('contacts').update({ signup_day: now.getDay(), webinar_week: currentWeek }).eq('id', contactId);

  // Log history
  await supabase.from('contact_history').insert({
    contact_id: contactId,
    action: `Workflow Enrolled [Auto]: ${workflow.name}`
  });
}

/**
 * Process workflow triggers
 */
export async function processWorkflowTriggers(
  triggerType: string,
  triggerValue: string,
  contactId: string
): Promise<void> {
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id')
    .eq('trigger_type', triggerType)
    .eq('trigger_value', triggerValue)
    .eq('is_active', true);

  if (!workflows || workflows.length === 0) return;

  for (const wf of workflows) {
    await enrollContactInWorkflow(wf.id, contactId);
  }
}

/**
 * Process active waits (Called by cron)
 */
export async function processWaitQueues(): Promise<void> {
  const now = new Date().toISOString();
  const { data: waiting } = await supabase
    .from('workflow_waiting')
    .select('*')
    .lte('wait_until', now);

  if (!waiting || waiting.length === 0) return;

  for (const w of waiting) {
    // Delete the wait record
    await supabase.from('workflow_waiting').delete().eq('id', w.id);
    
    // Find the NEXT nodes following this wait node
    const { data: nextSteps } = await supabase
      .from('workflow_steps')
      .select('id')
      .eq('parent_id', w.step_id);
    
    if (nextSteps) {
      for (const next of nextSteps) {
        await executeWorkflowNode(w.enrollment_id, next.id);
      }
    }
  }
}
