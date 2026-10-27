import { supabase } from '../supabase';

/* JUEGOS CON GMAIL (migración 20261106120000_juegos_cuentas.sql)
 *
 *  - JUGADOR: desde el kiosco (ya con su PIN) toca "ENTRÁ CON TU GMAIL"; su
 *    Gmail queda vinculado a él y con ese Gmail ve sólo los juegos.
 *  - HINCHA: entra por el link de invitación del club (/unirse/<código>).
 *
 * Google sale de la app y vuelve: lo que había que hacer al volver (vincular
 * o unirse) queda anotado acá y lo hace AuthContext apenas hay sesión
 * (tomarPendiente → resolverPendiente). Si falla, el motivo queda para la
 * pantalla de entrada (/unirse). */

const LS_PENDIENTE = 'juegos_pendiente';
const LS_ERROR = 'juegos_error';
const CLAVES_KIOSCO = ['kiosco_mode', 'kiosco_jugador_id', 'kiosco_club_id', 'kiosco_nombre', 'kiosco_token'];

export const MENSAJE_SIN_CUENTAS =
  'Falta la migración 20261106120000_juegos_cuentas.sql en Supabase (cuentas de juego con Gmail).';

const faltaLaFuncion = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || error?.code === 'PGRST205'
  || /could not find the function/i.test(error?.message || '');

async function llamar(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    if (faltaLaFuncion(error)) throw new Error(MENSAJE_SIN_CUENTAS);
    throw new Error((error.message || '').replace(/^juegos: /, '') || 'No se pudo completar.');
  }
  return data;
}

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin storage */ }
};

/** La cuenta de juego del que está logueado ({ tipo, club_id, club_nombre, escudo_url, nombre, jugador_id }) o null. */
export async function miCuentaJuego() {
  try { return (await llamar('juegos_mi_cuenta')) || null; } catch { return null; }
}

export const infoInvitacion = (codigo) => llamar('juegos_invitacion_info', { p_codigo: codigo });
export const unirseConInvitacion = (codigo, nombre = null) => llamar('juegos_unirse', { p_codigo: codigo, p_nombre: nombre || null });
export const vincularGmail = (token) => llamar('juegos_vincular', { p_token: token });

/* ── ir a Google y volver ─────────────────────────────────────────────────── */

/**
 * Anota qué hacer al volver y sale a Google.
 *   { accion: 'vincular', token }          el jugador con la sesión del PIN
 *   { accion: 'unirse', codigo, nombre }   el hincha con el link
 * El celular deja de ser kiosco: la sesión pasa a ser la de su Gmail.
 */
export async function entrarConGoogle(pendiente) {
  escribir(LS_PENDIENTE, JSON.stringify(pendiente));
  escribir(LS_ERROR, null);
  CLAVES_KIOSCO.forEach((k) => escribir(k, null));
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // La raíz es la dirección que Supabase ya acepta para volver de Google.
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new Error('No se pudo abrir Google.');
}

/** Lo anotado antes de ir a Google (y lo borra: se hace una sola vez). */
export function tomarPendiente() {
  const crudo = leer(LS_PENDIENTE);
  escribir(LS_PENDIENTE, null);
  try { return crudo ? JSON.parse(crudo) : null; } catch { return null; }
}

/** Hace lo anotado. Si falla, guarda el motivo para la pantalla de entrada. */
export async function resolverPendiente(p) {
  if (!p) return;
  try {
    if (p.accion === 'vincular') await vincularGmail(p.token);
    else if (p.accion === 'unirse') await unirseConInvitacion(p.codigo, p.nombre);
  } catch (err) {
    escribir(LS_ERROR, JSON.stringify({ texto: err.message, accion: p.accion, codigo: p.codigo || null }));
  }
}

/** El motivo por el que no se pudo entrar al volver de Google (o null). */
export function errorDeEntrada() {
  try { return JSON.parse(leer(LS_ERROR) || 'null'); } catch { return null; }
}
export const borrarErrorDeEntrada = () => escribir(LS_ERROR, null);

/* ── el club: links de hinchas y cuentas con Gmail ───────────────────────── */

export const crearInvitacion = (clubId, { nombre = null, vence = null, maxUsos = null } = {}) =>
  llamar('juegos_invitacion_crear', { p_club: clubId, p_nombre: nombre || null, p_vence: vence || null, p_max: maxUsos ? Number(maxUsos) : null });
export const invitacionesDelClub = async (clubId) => (await llamar('juegos_invitaciones_club', { p_club: clubId })) || [];
export const activarInvitacion = (codigo, activa) => llamar('juegos_invitacion_activar', { p_codigo: codigo, p_activa: activa });
export const cuentasDelClub = async (clubId) => (await llamar('juegos_cuentas_club', { p_club: clubId })) || [];
export const quitarCuenta = (userId) => llamar('juegos_cuenta_quitar', { p_user: userId });

/** El link que se comparte con los hinchas. */
export const linkInvitacion = (origen, codigo) => `${origen}/unirse/${codigo}`;

/** Cómo se lee el estado de un link en el panel. */
export function estadoInvitacion(inv) {
  if (!inv) return '';
  if (inv.motivo) return inv.motivo.replace(/^Esta invitación /, '').replace(/\.$/, '').toUpperCase();
  const usos = inv.max_usos ? `${inv.usos}/${inv.max_usos} USOS` : `${inv.usos} ${inv.usos === 1 ? 'USO' : 'USOS'}`;
  return inv.vence ? `${usos} · HASTA ${inv.vence.split('-').reverse().join('/')}` : usos;
}
