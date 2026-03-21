import { supabase } from './supabase';

/**
 * Rules Engine for LINE Marketing Automations
 */
export async function processAutomations(
  triggerType: 'TAG_ADDED' | 'TAG_REMOVED' | 'USER_FOLLOW' | 'KEYWORD_RECEIVED',
  triggerValue: string, 
  contactId: string,
  lineId: string
) {
  console.log(`[AutomationEngine] Processing ${triggerType} for "${triggerValue}" (Contact: ${contactId})`);

  // ─── PART 1: Simple IFTTT Automations ───────────────────────
  let automations: any[] | null = null;
  let error: any = null;

  if (triggerType === 'KEYWORD_RECEIVED') {
    // For keywords, fetch all keyword rules and match exact (case-insensitive)
    const result = await supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', 'KEYWORD_RECEIVED')
      .eq('is_active', true);
    error = result.error;
    const inputLower = triggerValue.toLowerCase().trim();
    automations = (result.data || []).filter(
      (a: any) => a.trigger_value && inputLower === a.trigger_value.toLowerCase().trim()
    );
  } else {
    const result = await supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', triggerType)
      .eq('trigger_value', triggerValue)
      .eq('is_active', true);
    error = result.error;
    automations = result.data;
  }

  if (error) {
    console.error(`[AutomationEngine] Error fetching automations:`, error);
  }

  if (automations && automations.length > 0) {
    for (const auto of automations) {
      console.log(`[AutomationEngine] Executing rule: ${auto.name}`);
      try {
        if (auto.action_type === 'SEND_MESSAGE') {
          await executeSendMessage(contactId, lineId, auto.action_value);
        } else if (auto.action_type === 'ADD_TAG') {
          await executeAddTag(contactId, auto.action_value, lineId);
        } else if (auto.action_type === 'REMOVE_TAG') {
          await executeRemoveTag(contactId, auto.action_value, lineId);
        } else if (auto.action_type === 'ENROLL_WEBINAR') {
          await executeEnrollWebinar(contactId);
        }
      } catch (err) {
        console.error(`[AutomationEngine] Failed to execute action ${auto.action_type}:`, err);
      }
    }
  }

  // ─── PART 2: Workflow Enrollments ───────────────────────────
  try {
    const { processWorkflowTriggers } = await import('./workflow-engine');
    await processWorkflowTriggers(triggerType, triggerValue, contactId);
  } catch (err) {
    console.error(`[AutomationEngine] Workflow trigger error:`, err);
  }
}

async function executeSendMessage(contactId: string, lineId: string, message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineId) return;

  // Render {{variables}} before sending
  const { data: contact } = await supabase.from('contacts').select('*').eq('id', contactId).single();
  const { renderMessageSync } = await import('./render-message');
  const rendered = renderMessageSync(message, contact ?? {});

  const { buildLineMessages } = await import('./line-messages');
  const lineMessages = buildLineMessages(rendered);
  if (lineMessages.length === 0) return;

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ to: lineId, messages: lineMessages })
  });

  if (response.ok) {
    // Log history with [Auto] prefix
    await supabase.from('contact_history').insert({
      contact_id: contactId,
      action: `Chat: [Auto] ${rendered}`
    });
    console.log(`[AutomationEngine] Auto-message sent to ${lineId}`);
  } else {
    const err = await response.json();
    console.error(`[AutomationEngine] LINE API Error:`, err);
  }
}

async function executeAddTag(contactId: string, tag: string, lineId: string) {
  // Fetch current tags
  const { data: contact } = await supabase.from('contacts').select('tags').eq('id', contactId).single();
  const currentTags = contact?.tags || [];
  
  if (currentTags.includes(tag)) return;

  const newTags = [...currentTags, tag];
  
  await supabase.from('contacts').update({ tags: newTags }).eq('id', contactId);
  
  // Log history
  await supabase.from('contact_history').insert({
    contact_id: contactId,
    action: `Tag Added [Auto]: ${tag}`
  });

  console.log(`[AutomationEngine] Auto-tag added: ${tag}`);

  // Recursively trigger nested automations
  await processAutomations('TAG_ADDED', tag, contactId, lineId);
}

async function executeEnrollWebinar(contactId: string) {
  const { data: contact } = await supabase.from('contacts').select('webinar_date, name').eq('id', contactId).single();

  let webinarDate = contact?.webinar_date;

  // If contact has no webinar_date, fall back to active_webinar_date from settings
  if (!webinarDate) {
    const { data: setting } = await supabase.from('settings').select('value').eq('key', 'active_webinar_date').single();
    webinarDate = setting?.value || null;
    if (webinarDate) {
      // Stamp the contact with the active webinar date so sequence + UI are in sync
      await supabase.from('contacts').update({ webinar_date: webinarDate }).eq('id', contactId);
      console.log(`[AutomationEngine] Assigned active_webinar_date ${webinarDate} to contact ${contactId}`);
    }
  }

  if (!webinarDate) {
    console.log(`[AutomationEngine] No webinar_date available for contact ${contactId}, skipping enroll`);
    await supabase.from('contact_history').insert({
      contact_id: contactId,
      action: '[Auto] Webinar enrollment skipped — no webinar date set and no active webinar date found'
    });
    return;
  }

  const { enrollInWebinarSequence } = await import('./webinar-sequence');
  await enrollInWebinarSequence(contactId, webinarDate, contact?.name || '');
  console.log(`[AutomationEngine] Enrolled contact ${contactId} in webinar sequence`);
}

async function executeRemoveTag(contactId: string, tag: string, lineId: string) {
  const { data: contact } = await supabase.from('contacts').select('tags').eq('id', contactId).single();
  const currentTags = contact?.tags || [];
  
  if (!currentTags.includes(tag)) return;

  const newTags = currentTags.filter((t: string) => t !== tag);
  
  await supabase.from('contacts').update({ tags: newTags }).eq('id', contactId);
  
  // Log history
  await supabase.from('contact_history').insert({
    contact_id: contactId,
    action: `Tag Removed [Auto]: ${tag}`
  });
  
  console.log(`[AutomationEngine] Auto-tag removed: ${tag}`);

  // Trigger TAG_REMOVED automations
  await processAutomations('TAG_REMOVED', tag, contactId, lineId);
}
