import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* En el kiosco, cada pedido lleva el token de la sesión del jugador que
   entró con su PIN. La base (kiosco_club(), migración 20260927120000) sólo
   le muestra al kiosco las filas del club de ese token. Se lee de
   localStorage directo porque utils/kiosco.js importa este archivo. */
const fetchConKiosco = (input, init = {}) => {
  let token = null;
  try {
    if (localStorage.getItem('kiosco_mode') === 'true') token = localStorage.getItem('kiosco_token');
  } catch { /* sin storage no hay kiosco */ }
  if (!token) return fetch(input, init);
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('x-kiosco-token', token);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchConKiosco },
  auth: {
    persistSession: true, // Mantenlo en true para producción
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'futsal-stats-auth-v1'
  }
});