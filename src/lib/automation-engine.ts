import { supabase } from './supabase';

/**
 * Rules Engine for LINE Marketing Automations
 */
export async function processAutomations(
  triggerType: 'TAG_ADDED' | 'TAG_REMOVED' | 'USER_FOLLOW',
  triggerValue: string, 
  contactId: string,
  lineId: string
) {
  console.log(`[AutomationEngine] Processing ${triggerType} for "${triggerValue}" (Contact: ${contactId})`);

  // ─── PART 1: Simple IFTTT Automations ───────────────────────
  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .eq('trigger_type', triggerType)
    .eq('trigger_value', triggerValue)
    .eq('is_active', true);

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
          await executeRemoveTag(contactId, auto.action_value);
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

  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: lineId,
    messages: [{ type: 'text', text: rendered }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
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

  // Recursively trigger nested automations!
  // We use a small delay or setImmediate to avoid deep recursion issues if any
  processAutomations('TAG_ADDED', tag, contactId, lineId);
}

async function executeRemoveTag(contactId: string, tag: string) {
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
  
  // Triggers processAutomations('TAG_REMOVED', ...) if we had nested logic
}
