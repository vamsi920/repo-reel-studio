import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://quzofxjdivcitpkrylov.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0cOQDQUsEbUjGfJa90CiZQ_xQDrxHxG';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'gitflick-auth',
  },
});

export type { User, Session } from '@supabase/supabase-js';
