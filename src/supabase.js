import { createClient } from '@supabase/supabase-js';

// Usamos import.meta.env para acceder a las variables de entorno en Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicialización del cliente
export const supabase = createClient(supabaseUrl, supabaseKey);