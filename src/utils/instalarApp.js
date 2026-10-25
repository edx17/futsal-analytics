/* EL JUEGO EN EL CELULAR: instalar la app y entrar directo al juego.
 *
 * Chrome (Android, escritorio) avisa con `beforeinstallprompt` que la app se
 * puede instalar: se guarda el aviso (llega una sola vez, apenas carga) para
 * mostrar el botón cuando haga falta. iPhone no lo tiene: se explica cómo
 * agregarla desde Compartir.
 */

let aviso = null;
const oyentes = new Set();

/** Se llama una vez, al arrancar la app (main.jsx). */
export function escucharInstalacion() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    aviso = e;
    oyentes.forEach((f) => f(true));
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    oyentes.forEach((f) => f(false));
  });
}

export const sePuedeInstalar = () => !!aviso;

/** Avisa cuando cambia si se puede instalar. Devuelve cómo dejar de escuchar. */
export function alCambiarInstalable(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/** Abre el cartel de instalación de Chrome. true si la instalaron. */
export async function instalar() {
  if (!aviso) return false;
  const e = aviso;
  aviso = null;
  e.prompt();
  const { outcome } = await e.userChoice;
  oyentes.forEach((f) => f(false));
  return outcome === 'accepted';
}

/** Ya está abierta como app (desde el ícono). */
export const esApp = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

export const esIphone = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') => /iphone|ipad|ipod/i.test(ua);
export const esCelular = (ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') => /android|iphone|ipad|ipod|mobile/i.test(ua);

/* ── entrar directo al juego ─────────────────────────────────────────── */

export const DESTINOS_JUEGO = ['sobres', 'vdraft', 'afa-stats'];

/** El link para el celular: el kiosco del club y, después del PIN, el juego. */
export function linkAlJuego(origen, clubId, destino = 'sobres') {
  const u = new URL('/kiosco', origen);
  if (clubId) u.searchParams.set('club', clubId);
  if (DESTINOS_JUEGO.includes(destino)) u.searchParams.set('ir', destino);
  return u.toString();
}

const CLAVE_IR = 'kiosco_ir';

/** Guarda adónde ir después de entrar (si el link lo pide). */
export function recordarDestino(ir) {
  if (!DESTINOS_JUEGO.includes(ir)) return;
  try { sessionStorage.setItem(CLAVE_IR, ir); } catch { /* sin storage */ }
}

/** Adónde ir ahora (una sola vez), o null. */
export function tomarDestino() {
  try {
    const ir = sessionStorage.getItem(CLAVE_IR);
    sessionStorage.removeItem(CLAVE_IR);
    return DESTINOS_JUEGO.includes(ir) ? `/kiosco/${ir}` : null;
  } catch {
    return null;
  }
}
