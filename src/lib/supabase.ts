import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// We use the service role key for backend operations to bypass RLS
// If service role is not available, we fall back to anon key (assuming open RLS for now)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials are missing. Check your .env.local file.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
