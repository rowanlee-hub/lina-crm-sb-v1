import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { executeWorkflowNode, processWaitQueues } from '@/lib/workflow-engine';

/**
 * Cron Dispatch Handler — Called every 15 minutes by cron-job.org
 * Processes legacy reminders, new node transitions, and wait queues.
 */
export async function GET() {
  try {
    const now = new Date().toISOString();
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!lineToken) {
      return NextResponse.json({ success: false, error: 'Missing LINE_CHANNEL_ACCESS_TOKEN' }, { status: 500 });
    }

    let totalSent = 0;
    let totalFailed = 0;

    // ─── PART 1: Process Phase 8 Wait Queues ──────────────────
    await processWaitQueues();

    // ─── PART 2: Legacy Reminders ──────────────────────────────
    const { data: dueReminders } = await supabase
      .from('reminders')
      .select('*, contacts(line_id, name, email, phone, tags, status, notes, uid, webinar_link, webinar_date, follow_up_note)')
      .eq('status', 'pending')
      .lte('scheduled_time', now);

    if (dueReminders && dueReminders.length > 0) {
      const { renderMessageSync } = await import('@/lib/render-message');
      for (const reminder of dueReminders) {
        const contact = (reminder as any).contacts ?? {};
        const lineId = contact?.line_id;
        if (!lineId) {
          await supabase.from('reminders').update({ status: 'failed', sent_at: now }).eq('id', reminder.id);
          totalFailed++;
          continue;
        }
        const rendered = renderMessageSync(reminder.message, contact);
        const ok = await sendLineMessage(lineToken, lineId, rendered);
        if (ok) {
          await supabase.from('reminders').update({ status: 'sent', sent_at: now }).eq('id', reminder.id);
          await supabase.from('contact_history').insert({
            contact_id: reminder.contact_id,
            action: `Chat: [Scheduled] ${rendered}`,
          });
          totalSent++;
        } else {
          await supabase.from('reminders').update({ status: 'failed', sent_at: now }).eq('id', reminder.id);
          totalFailed++;
        }
      }
    }

    // ─── PART 3: Workflow Message Queue (Action processing) ────
    const { data: queuedMessages } = await supabase
      .from('message_queue')
      .select('*, contacts(line_id, name, email, phone, tags, webinar_link, webinar_date, status, notes, uid, follow_up_note)')
      .eq('status', 'queued')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (queuedMessages && queuedMessages.length > 0) {
      for (const msg of queuedMessages) {
        const lineId = (msg as any).contacts?.line_id;

        let actionSuccess = false;

        // Handle non-LINE actions first (these don't need line_id)
        if (msg.message.startsWith('__ACTION__:')) {
          const parts = msg.message.split(':');
          const actionType = parts[1]; 
          const actionValue = parts.slice(2).join(':'); 
          const currentTags = (msg as any).contacts?.tags || [];

          if (actionType === 'ADD_TAG' && !currentTags.includes(actionValue)) {
            await supabase.from('contacts').update({ tags: [...currentTags, actionValue] }).eq('id', msg.contact_id);
            await supabase.from('contact_history').insert({ contact_id: msg.contact_id, action: `Tag Added [Workflow]: ${actionValue}` });
          } else if (actionType === 'REMOVE_TAG') {
            const newTags = currentTags.filter((t: string) => t !== actionValue);
            await supabase.from('contacts').update({ tags: newTags }).eq('id', msg.contact_id);
            await supabase.from('contact_history').insert({ contact_id: msg.contact_id, action: `Tag Removed [Workflow]: ${actionValue}` });
          } else if (actionType === 'ENROLL_WORKFLOW') {
            const { enrollContactInWorkflow } = await import('@/lib/workflow-engine');
            await enrollContactInWorkflow(actionValue, msg.contact_id);
            await supabase.from('contact_history').insert({ contact_id: msg.contact_id, action: `Workflow Enrolled [Auto]: ${actionValue}` });
          } else if (actionType === 'REMOVE_FROM_WORKFLOW') {
            const { data: enrollments } = await supabase.from('workflow_enrollments').select('id').eq('workflow_id', actionValue).eq('contact_id', msg.contact_id).eq('status', 'active');
            for (const e of enrollments || []) {
              await supabase.from('workflow_enrollments').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', e.id);
              await supabase.from('workflow_waiting').delete().eq('enrollment_id', e.id);
              await supabase.from('message_queue').update({ status: 'cancelled' }).eq('enrollment_id', e.id).eq('status', 'queued');
            }
            await supabase.from('contact_history').insert({ contact_id: msg.contact_id, action: `Workflow Removed [Auto]: ${actionValue}` });
          }
          actionSuccess = true;
        } else {
          // LINE message — requires line_id
          if (!lineId) {
            await supabase.from('message_queue').update({ status: 'failed', sent_at: now }).eq('id', msg.id);
            totalFailed++;
            continue;
          }
          // Render {{variables}} then send
          const { renderMessageSync } = await import('@/lib/render-message');
          const contact = (msg as any).contacts ?? {};
          const rendered = renderMessageSync(msg.message, contact);
          actionSuccess = await sendLineMessage(lineToken, lineId, rendered);
          if (actionSuccess) {
            await supabase.from('contact_history').insert({ contact_id: msg.contact_id, action: `Chat: [Auto] ${rendered}` });
          }
        }

        if (actionSuccess) {
          await supabase.from('message_queue').update({ status: 'sent', sent_at: now }).eq('id', msg.id);
          totalSent++;

          // ─── TRIGGER NEXT NODE ──────────────────────────────
          // After a step is finished, we find the next node and execute it
          if (msg.enrollment_id && msg.step_id) {
             const { data: nextSteps } = await supabase
               .from('workflow_steps')
               .select('id')
               .eq('parent_id', msg.step_id)
               .eq('branch_type', 'DEFAULT');
             
             if (nextSteps && nextSteps.length > 0) {
               for (const next of nextSteps) {
                 await executeWorkflowNode(msg.enrollment_id, next.id);
               }
             } else {
               // If no next steps, check if this branch is done
               // (Optional: can be handled by a final check)
             }
          }
        } else {
          await supabase.from('message_queue').update({ status: 'failed', sent_at: now }).eq('id', msg.id);
          totalFailed++;
        }
      }
    }

    // ─── PART 4: Contact Follow-Up Scheduler ───────────────────
    const { data: dueFollowUps } = await supabase
      .from('contacts')
      .select('id, line_id, name, follow_up_note')
      .not('follow_up_at', 'is', null)
      .lte('follow_up_at', now)
      .not('line_id', 'is', null);

    if (dueFollowUps && dueFollowUps.length > 0) {
      for (const contact of dueFollowUps) {
        const message = contact.follow_up_note?.trim()
          ? contact.follow_up_note
          : `Follow-up reminder for ${contact.name || 'this contact'}.`;

        const ok = await sendLineMessage(lineToken, contact.line_id, message);
        if (ok) {
          // Clear follow_up_at so it doesn't fire again
          await supabase
            .from('contacts')
            .update({ follow_up_at: null, follow_up_note: null })
            .eq('id', contact.id);
          await supabase.from('contact_history').insert({
            contact_id: contact.id,
            action: `Chat: [Follow-Up] ${message}`,
          });
          totalSent++;
        } else {
          totalFailed++;
        }
      }
    }

    // ─── PART 5: Webinar Sequence Messages ─────────────────────
    const { data: dueWebinar } = await supabase
      .from('webinar_scheduled_messages')
      .select(`
        id, contact_id,
        webinar_sequence_steps(message),
        contacts(line_id, name, webinar_link, webinar_date)
      `)
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    for (const msg of dueWebinar || []) {
      const contact = (msg as any).contacts;
      const step = (msg as any).webinar_sequence_steps;
      if (!contact?.line_id || !step?.message) {
        await supabase.from('webinar_scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
        totalFailed++;
        continue;
      }

      const { renderMessage } = await import('@/lib/render-message');
      const message = await renderMessage(step.message, contact);

      const ok = await sendLineMessage(lineToken, contact.line_id, message);
      if (ok) {
        await supabase.from('webinar_scheduled_messages')
          .update({ status: 'sent', sent_at: now })
          .eq('id', msg.id);
        await supabase.from('contact_history').insert({
          contact_id: msg.contact_id,
          action: `Chat: [Webinar Reminder] ${message.substring(0, 100)}`,
        });
        totalSent++;
      } else {
        await supabase.from('webinar_scheduled_messages').update({ status: 'failed' }).eq('id', msg.id);
        totalFailed++;
      }
    }

    return NextResponse.json({
      success: true,
      sent: totalSent,
      failed: totalFailed,
      timestamp: now,
    });

  } catch (error) {
    console.error('Cron Dispatch Error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

async function sendLineMessage(token: string, lineId: string, message: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ to: lineId, messages: [{ type: 'text', text: message }] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
