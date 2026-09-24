/* Todo lo que el kiosco necesita saber de "quién entró", en un solo lugar.

   El kiosco es una sesión compartida del club: lo que identifica al jugador
   es el token que devuelve kiosco_abrir_sesion() al validar el PIN (ver la
   migración 20260924120000). El token es lo único que queda guardado; el PIN
   no se guarda nunca. */
import { supabase } from '../supabase';

const LS_TOKEN = 'kiosco_token';

export const RUTA_KIOSCO = '/kiosco';

export const esModoKiosco = () => {
  try { return localStorage.getItem('kiosco_mode') === 'true'; } catch { return false; }
};

export const tokenKiosco = () => {
  try { return localStorage.getItem(LS_TOKEN); } catch { return null; }
};

export const guardarTokenKiosco = (token) => {
  try {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  } catch { /* sin storage no hay sesión persistente, y está bien */ }
};

/* Volver: en el kiosco siempre al menú del jugador. Un navigate(-1) desde un
   link directo o una recarga saca al jugador de la app o lo deja en una
   pantalla del staff. */
export const volverDesde = (navigate) => {
  if (esModoKiosco()) navigate(RUTA_KIOSCO);
  else navigate(-1);
};

/* Abre la sesión del jugador. Devuelve el token, o null si el PIN no es
   válido o si la migración todavía no se corrió (en ese caso el kiosco
   sigue funcionando como antes, sin la ficha). */
export async function abrirSesionKiosco(jugadorId, clubId, pin) {
  const { data, error } = await supabase.rpc('kiosco_abrir_sesion', {
    p_jugador_id: String(jugadorId), p_club_id: String(clubId), p_pin: String(pin),
  });
  if (error) {
    console.error('kiosco_abrir_sesion:', error.message);
    return null;
  }
  return data || null;
}

export async function cerrarSesionKiosco() {
  const token = tokenKiosco();
  guardarTokenKiosco(null);
  if (!token) return;
  const { error } = await supabase.rpc('kiosco_cerrar_sesion', { p_token: token });
  if (error) console.error('kiosco_cerrar_sesion:', error.message);
}

/* PostgREST contesta PGRST202 cuando la función no existe (la migración no
   se corrió todavía). Ahí el kiosco sigue andando como antes, sin ficha, en
   vez de pedirle el PIN al jugador una y otra vez. */
const funcionInexistente = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message || '');

/* La ficha completa del jugador.
     { ficha }              salió bien
     { vencida: true }      no hay token o ya no sirve: hay que pedir el PIN
     { noDisponible: true } la base todavía no tiene la función
     { error }              cualquier otra cosa */
export async function cargarFichaKiosco() {
  const token = tokenKiosco();
  /* Sin token se pregunta igual, con uno que no existe: así se distingue
     "falta el PIN" de "la función no está". */
  const { data, error } = await supabase.rpc('kiosco_ficha', {
    p_token: token || '00000000-0000-0000-0000-000000000000',
  });
  if (error) {
    if (error.code === '28000') return { vencida: true };
    if (funcionInexistente(error)) return { noDisponible: true };
    return { error };
  }
  return { ficha: data };
}
