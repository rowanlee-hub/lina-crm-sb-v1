import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Cron — Called every Wednesday at 9pm Malaysia time (UTC+8 = 13:00 UTC)
 * Advances active_webinar_date to the following Wednesday.
 *
 * Set up at cron-job.org:
 *   URL: https://your-app.vercel.app/api/cron/rotate-webinar-date
 *   Schedule: Every Wednesday at 13:00 UTC (9pm Malaysia)
 */
export async function GET() {
  try {
    // Get current active webinar date
    const { data: setting, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'active_webinar_date')
      .single();

    if (error || !setting) {
      return NextResponse.json({ success: false, error: 'active_webinar_date setting not found' }, { status: 500 });
    }

    const current = new Date(setting.value);
    // Advance exactly 7 days to next Wednesday
    const next = new Date(current);
    next.setDate(current.getDate() + 7);

    const nextStr = next.toISOString().substring(0, 10); // YYYY-MM-DD

    await supabase
      .from('settings')
      .update({ value: nextStr, updated_at: new Date().toISOString() })
      .eq('key', 'active_webinar_date');

    console.log(`[RotateWebinar] Advanced from ${setting.value} → ${nextStr}`);

    return NextResponse.json({
      success: true,
      previous: setting.value,
      active_webinar_date: nextStr,
    });

  } catch (err) {
    console.error('[RotateWebinar] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
