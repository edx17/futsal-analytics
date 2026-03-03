import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true, // Mantenlo en true para producción
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'futsal-stats-auth-v1'
  }
});