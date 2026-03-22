import { supabase } from './supabase';

/**
 * Enroll a contact into the active webinar sequence.
 * - Calculates which steps are still in the future based on webinar date.
 * - Past steps are marked "skipped" so they are never sent.
 * - Safe to call multiple times — upserts enrollment and re-schedules pending.
 */
export async function enrollInWebinarSequence(
  contactId: string,
  webinarDate: string,
  contactName: string
) {
  const webinarAt = new Date(webinarDate);
  const now = new Date();

  if (webinarAt <= now) {
    console.log(`[WebinarSeq] Webinar already passed — skipping enrollment for ${contactId}`);
    return;
  }

  // Get the active sequence with all steps
  const { data: sequence, error: seqErr } = await supabase
    .from('webinar_sequences')
    .select('id, name, webinar_sequence_steps(id, days_before, send_hour, message)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (seqErr || !sequence) {
    console.log(`[WebinarSeq] No active sequence found`);
    return;
  }

  const steps: Array<{ id: string; days_before: number; send_hour: number; message: string }> =
    (sequence as any).webinar_sequence_steps || [];

  if (steps.length === 0) {
    console.log(`[WebinarSeq] Sequence has no steps`);
    return;
  }

  // Upsert enrollment (idempotent)
  const { data: enrollment, error: enrollErr } = await supabase
    .from('webinar_enrollments')
    .upsert(
      { contact_id: contactId, sequence_id: sequence.id, webinar_date: webinarDate, status: 'active' },
      { onConflict: 'contact_id,webinar_date' }
    )
    .select()
    .single();

  if (enrollErr || !enrollment) {
    console.error(`[WebinarSeq] Enrollment upsert error:`, enrollErr?.message);
    return;
  }

  // Clear any existing unsent messages (pending + skipped) on re-enrollment
  await supabase
    .from('webinar_scheduled_messages')
    .delete()
    .eq('enrollment_id', enrollment.id)
    .in('status', ['pending', 'skipped']);

  let scheduled = 0;
  let skipped = 0;

  for (const step of steps) {
    const sendAt = new Date(webinarAt);
    sendAt.setUTCDate(sendAt.getUTCDate() - step.days_before);
    const hour = Math.floor(step.send_hour ?? 9);
    const minute = Math.round(((step.send_hour ?? 9) % 1) * 100);
    sendAt.setUTCHours(hour, minute, 0, 0);

    const status = sendAt > now ? 'pending' : 'skipped';

    await supabase.from('webinar_scheduled_messages').insert({
      enrollment_id: enrollment.id,
      contact_id: contactId,
      step_id: step.id,
      scheduled_at: sendAt.toISOString(),
      status,
    });

    status === 'pending' ? scheduled++ : skipped++;
  }

  await supabase.from('contact_history').insert({
    contact_id: contactId,
    action: `Webinar Sequence: Enrolled — ${scheduled} messages scheduled, ${skipped} past (skipped)`,
  });

  console.log(`[WebinarSeq] Enrolled ${contactName} (${contactId}): ${scheduled} scheduled, ${skipped} skipped`);
}
