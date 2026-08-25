import { supabase } from '../supabase';

// Clave pública VAPID — va en tu .env como VITE_VAPID_PUBLIC_KEY (no es secreta,
// viaja al navegador). La privada NUNCA va acá, esa vive solo en el Edge Function.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// El navegador pide la applicationServerKey como Uint8Array, no como string.
// Esta conversión es el snippet estándar para eso (base64url -> bytes).
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSoportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/* Cada motivo con su explicación en castellano y qué hacer. Antes todos los
   errores terminaban en el mismo cartel genérico y no había forma de saber
   cuál de las cinco causas posibles era. */
export const MOTIVOS_PUSH = {
  'no-soportado':      'Este navegador no soporta notificaciones.',
  'ios-sin-instalar':  'En iPhone hay que agregar la app a la pantalla de inicio (Compartir → Agregar a inicio) y activarlas desde ahí.',
  'falta-vapid-key':   'Falta la clave VITE_VAPID_PUBLIC_KEY en el entorno. Si funciona en tu máquina pero no en producción, hay que cargarla también en Vercel.',
  'permiso-bloqueado': 'El navegador tiene las notificaciones bloqueadas para este sitio. Se desbloquea desde el candado de la barra de direcciones.',
  'permiso-denegado':  'No se dio permiso. Volvé a intentar y aceptá el cartel del navegador.',
  'sin-service-worker':'El service worker no se registró. Recargá la página; si sigue, revisá que /sw.js se sirva bien.',
  'sin-perfil':        'No se pudo identificar tu usuario. Cerrá sesión y volvé a entrar.',
  'falta-indice':      'Falta un índice único en push_subscriptions.endpoint. Hay que crearlo en Supabase.',
  'sin-permiso-tabla': 'La base rechazó guardar la suscripción por permisos (RLS) en push_subscriptions.',
  'error':             'Error inesperado al activar.',
};

/* `serviceWorker.ready` no rechaza nunca: si no hay service worker registrado
   se queda esperando para siempre y el botón gira sin fin. */
function serviceWorkerListo(msEspera = 8000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), msEspera)),
  ]);
}

const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Llamar SIEMPRE desde un click/tap del usuario (no en un useEffect al cargar),
// si no el navegador ignora el pedido de permiso o lo deniega directo.
export async function activarNotificaciones(clubId, perfilId) {
  const fallo = (motivo, detalle = null) =>
    ({ ok: false, motivo, mensaje: MOTIVOS_PUSH[motivo] || MOTIVOS_PUSH.error, detalle });

  if (!pushSoportado()) {
    /* En iPhone el push existe recién con la app instalada en la pantalla de
       inicio: en Safari suelto ni siquiera aparece PushManager. */
    if (esIOS() && !window.navigator.standalone) return fallo('ios-sin-instalar');
    return fallo('no-soportado');
  }
  if (!VAPID_PUBLIC_KEY) return fallo('falta-vapid-key');
  if (!perfilId) return fallo('sin-perfil');

  /* Si ya está bloqueado, requestPermission devuelve 'denied' al instante y
     sin mostrar nada: parece que el botón no hace nada. */
  if (Notification.permission === 'denied') return fallo('permiso-bloqueado');

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return fallo('permiso-denegado');

  try {
    const registro = await serviceWorkerListo();
    if (!registro) return fallo('sin-service-worker');

    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = suscripcion.toJSON();
    const fila = {
      club_id: clubId,
      perfil_id: perfilId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
    };

    let { error } = await supabase
      .from('push_subscriptions').upsert(fila, { onConflict: 'endpoint' });

    /* El upsert necesita un índice único sobre `endpoint`. Si no existe,
       Postgres responde 42P10 y antes eso quedaba como un error genérico.
       Guardamos igual: borramos la fila vieja de ese endpoint e insertamos. */
    if (error && (error.code === '42P10' || /ON CONFLICT/i.test(error.message || ''))) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', fila.endpoint);
      ({ error } = await supabase.from('push_subscriptions').insert(fila));
      if (!error) return { ok: true, aviso: 'falta-indice' };
    }

    if (error) {
      if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        return fallo('sin-permiso-tabla', error.message);
      }
      return fallo('error', error.message);
    }
    return { ok: true };
  } catch (err) {
    console.error('Error activando notificaciones:', err);
    return fallo('error', err?.message || String(err));
  }
}

export async function estaSuscripto() {
  if (!pushSoportado()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return false;
  const suscripcion = await registro.pushManager.getSubscription();
  return !!suscripcion;
}

export async function desactivarNotificaciones() {
  if (!pushSoportado()) return { ok: false };
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return { ok: true };
  const suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', suscripcion.endpoint);
    await suscripcion.unsubscribe();
  }
  return { ok: true };
}
