import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/webinar-sequence/seed
 * Seeds 7 test webinar sequence steps (Friday → Thursday, 8pm MYT = 12:00 UTC).
 * Clears existing steps first. Hit this once to set up for testing.
 */
export async function GET() {
  try {
    // Get or create active sequence
    let { data: sequence } = await supabase
      .from('webinar_sequences')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sequence) {
      const { data: newSeq } = await supabase
        .from('webinar_sequences')
        .insert({ name: 'Webinar Reminder Sequence', is_active: true })
        .select()
        .single();
      sequence = newSeq;
    }

    if (!sequence) {
      return NextResponse.json({ error: 'Failed to get/create sequence' }, { status: 500 });
    }

    // Delete existing scheduled messages for these steps (FK constraint)
    const { data: existingSteps } = await supabase
      .from('webinar_sequence_steps')
      .select('id')
      .eq('sequence_id', sequence.id);

    if (existingSteps && existingSteps.length > 0) {
      const stepIds = existingSteps.map(s => s.id);
      await supabase.from('webinar_scheduled_messages').delete().in('step_id', stepIds);
      await supabase.from('webinar_sequence_steps').delete().eq('sequence_id', sequence.id);
    }

    // 7 test steps: Friday (5 days before) → Thursday (1 day after)
    // send_hour = 12 UTC = 8pm MYT
    const steps = [
      { days_before: 5, label: 'Countdown 5 days' },   // Friday
      { days_before: 4, label: 'Countdown 4 days' },   // Saturday
      { days_before: 3, label: 'Countdown 3 days' },   // Sunday
      { days_before: 2, label: 'Countdown 2 days' },   // Monday
      { days_before: 1, label: 'Countdown 1 day' },    // Tuesday
      { days_before: 0, label: 'Webinar day!' },        // Wednesday
      { days_before: -1, label: 'Day after webinar' },  // Thursday
    ];

    const inserted = [];
    for (const step of steps) {
      const { data, error } = await supabase
        .from('webinar_sequence_steps')
        .insert({
          sequence_id: sequence.id,
          days_before: step.days_before,
          send_hour: 12, // 12:00 UTC = 8:00pm MYT
          message: `Hi {{name}}, today is ${step.label}`,
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: `Failed to create step: ${error.message}` }, { status: 500 });
      }
      inserted.push(data);
    }

    return NextResponse.json({
      success: true,
      sequence_id: sequence.id,
      steps_created: inserted.length,
      steps: inserted.map(s => ({
        id: s.id,
        days_before: s.days_before,
        send_hour: s.send_hour,
        message: s.message,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
