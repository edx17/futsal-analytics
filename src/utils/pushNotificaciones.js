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

// Llamar SIEMPRE desde un click/tap del usuario (no en un useEffect al cargar),
// si no el navegador ignora el pedido de permiso o lo deniega directo.
export async function activarNotificaciones(clubId, perfilId) {
  if (!pushSoportado()) return { ok: false, motivo: 'no-soportado' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, motivo: 'falta-vapid-key' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'permiso-denegado' };

  try {
    const registro = await navigator.serviceWorker.ready;
    let suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = suscripcion.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        club_id: clubId,
        perfil_id: perfilId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' }
    );

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('Error activando notificaciones:', err);
    return { ok: false, motivo: 'error', detalle: err.message };
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