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
  'ios-viejo':         'Las notificaciones en iPhone necesitan iOS 16.4 o más nuevo. Actualizá el iPhone desde Ajustes → General → Actualización de software.',
  'ios-ajustes':       'El iPhone no dejó activarlas. Entrá a Ajustes → Notificaciones → VirtualClub, activá "Permitir notificaciones" y volvé a tocar el botón.',
  'servicio-push':     'El servicio de notificaciones del teléfono rechazó el alta. Probá de nuevo en un rato; si sigue, borrá la app de la pantalla de inicio y volvé a agregarla.',
  'ios-sin-instalar':  'En iPhone hay que agregar la app a la pantalla de inicio (Compartir → Agregar a inicio) y activarlas desde ahí.',
  'falta-vapid-key':   'Falta la clave VITE_VAPID_PUBLIC_KEY en el entorno. Si funciona en tu máquina pero no en producción, hay que cargarla también en Vercel.',
  'permiso-bloqueado': 'El navegador tiene las notificaciones bloqueadas para este sitio. Se desbloquea desde el candado de la barra de direcciones.',
  'permiso-denegado':  'No se dio permiso. Volvé a intentar y aceptá el cartel del navegador.',
  'sin-service-worker':'El service worker no se registró. Recargá la página; si sigue, revisá que /sw.js se sirva bien.',
  'sin-perfil':        'No se pudo identificar tu usuario. Cerrá sesión y volvé a entrar.',
  'falta-indice':      'Falta el índice único en push_subscriptions.endpoint. Se guardó igual por un camino alternativo, pero conviene crearlo: está en la migración 20260826140000.',
  'sin-permiso-tabla': 'La base rechazó guardar la suscripción en push_subscriptions. Puede ser RLS (falta una política que permita INSERT, no sólo SELECT) o que al rol anon/authenticated le falte el GRANT sobre la tabla.',
  'tabla-inexistente': 'No existe la tabla push_subscriptions en la base. Hay que crearla en Supabase.',
  'sin-https':         'La página no se está sirviendo por HTTPS. Los navegadores sólo permiten notificaciones en https:// (o en localhost).',
  'error':             'Error inesperado al activar.',
};

/* Un error de PostgREST puede significar tres cosas muy distintas y antes las
   tres caían en el mismo cartel genérico. */
function motivoDeError(error) {
  const msg = error?.message || '';
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(msg))
    return 'tabla-inexistente';
  if (error?.code === '42501' || /row-level security/i.test(msg))
    return 'sin-permiso-tabla';
  return 'error';
}

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

const fallo = (motivo, detalle = null) =>
  ({ ok: false, motivo, mensaje: MOTIVOS_PUSH[motivo] || MOTIVOS_PUSH.error, detalle });

/* Texto corto del error para mostrar debajo del cartel: con una captura de
   pantalla alcanza para saber qué pasó, sin tener el teléfono a mano. */
const textoDeError = (err) =>
  [err?.name && err.name !== 'Error' ? err.name : null, err?.code, err?.message || (err ? String(err) : null)]
    .filter(Boolean).join(': ');

/* Sin PushManager no hay push. En iPhone eso tiene dos causas distintas: la
   app no está instalada en la pantalla de inicio, o el iOS es anterior a
   16.4 (ahí no existe aunque esté instalada). */
function motivoSinSoporte() {
  if (!esIOS()) return 'no-soportado';
  return window.navigator.standalone ? 'ios-viejo' : 'ios-sin-instalar';
}

/* Los errores del navegador al suscribir, traducidos. En iPhone el
   NotAllowedError casi siempre es el permiso apagado en Ajustes. */
function motivoDeExcepcion(err) {
  if (err?.name === 'NotAllowedError') return esIOS() ? 'ios-ajustes' : 'permiso-denegado';
  if (err?.name === 'AbortError' || err?.name === 'InvalidStateError') return 'servicio-push';
  return 'error';
}

/* El service worker se registra al cargar la página (main.jsx). Si por algo
   no llegó a registrarse —en el iPhone instalado pasa al abrir la app desde
   el ícono con la página ya en memoria—, se registra acá en vez de esperar
   ocho segundos para nada. */
async function registroDelServiceWorker() {
  try {
    const existente = await navigator.serviceWorker.getRegistration();
    if (!existente) await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('No se pudo registrar el service worker:', err);
  }
  return serviceWorkerListo();
}

const mismosBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* Crea la suscripción, o reusa la que ya hay si sirve. Una suscripción
   vieja hecha con otra clave VAPID (o que el servicio de Apple/Google dio
   de baja) hace fallar el alta para siempre: el teléfono la devuelve, pero
   nadie puede mandarle nada. En ese caso se borra y se hace de nuevo, y lo
   mismo si el subscribe falla una vez por estado inválido. */
async function crearSuscripcion(registro) {
  const clave = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const opciones = { userVisibleOnly: true, applicationServerKey: clave };

  const existente = await registro.pushManager.getSubscription();
  if (existente) {
    const suya = existente.options?.applicationServerKey;
    const json = existente.toJSON();
    const sirve = json?.keys?.p256dh && json?.keys?.auth
      && (!suya || mismosBytes(new Uint8Array(suya), clave));
    if (sirve) return existente;
    await existente.unsubscribe().catch(() => {});
  }

  try {
    return await registro.pushManager.subscribe(opciones);
  } catch (err) {
    if (err?.name !== 'InvalidStateError' && err?.name !== 'AbortError') throw err;
    const vieja = await registro.pushManager.getSubscription();
    if (vieja) await vieja.unsubscribe().catch(() => {});
    return registro.pushManager.subscribe(opciones);
  }
}

/* Permiso + suscripción del navegador. Devuelve { json } con endpoint y
   claves, o un fallo con su motivo. Lo comparten el alta del staff y la del
   jugador: lo único que cambia entre las dos es dónde se guarda. */
async function suscribirNavegador() {
  if (!pushSoportado()) return fallo(motivoSinSoporte());
  if (!window.isSecureContext) return fallo('sin-https');
  if (!VAPID_PUBLIC_KEY) return fallo('falta-vapid-key');
  if (Notification.permission === 'denied') return fallo(esIOS() ? 'ios-ajustes' : 'permiso-bloqueado');

  /* Lo primero que se hace después del toque es pedir el permiso: Safari
     sólo muestra el cartel si viene directo de un gesto del usuario. */
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return fallo(esIOS() && permiso === 'denied' ? 'ios-ajustes' : 'permiso-denegado');

  const registro = await registroDelServiceWorker();
  if (!registro) return fallo('sin-service-worker');

  try {
    const suscripcion = await crearSuscripcion(registro);
    const json = suscripcion.toJSON();
    if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) {
      return fallo('servicio-push', 'La suscripción vino sin claves.');
    }
    return { ok: true, json };
  } catch (err) {
    console.error('Error suscribiendo el navegador:', err);
    return fallo(motivoDeExcepcion(err), textoDeError(err));
  }
}

/* Alta del teléfono de un JUGADOR desde el kiosco. No escribe la tabla
   directo: la sesión del kiosco es compartida, así que pasa por
   kiosco_guardar_push(), que ata la suscripción al jugador del token. */
export async function activarNotificacionesJugador(tokenKiosco) {
  if (!tokenKiosco) return fallo('sin-perfil');
  try {
    const r = await suscribirNavegador();
    if (!r.ok) return r;
    const { error } = await supabase.rpc('kiosco_guardar_push', {
      p_token: tokenKiosco,
      p_endpoint: r.json.endpoint,
      p_p256dh: r.json.keys.p256dh,
      p_auth: r.json.keys.auth,
      p_user_agent: navigator.userAgent,
    });
    if (error) return fallo(error.code === '28000' ? 'sin-perfil' : motivoDeError(error), textoDeError(error));
    return { ok: true };
  } catch (err) {
    console.error('Error activando notificaciones del jugador:', err);
    return fallo('error', textoDeError(err));
  }
}

/* ¿Este navegador ya tiene permiso y suscripción? Para el jugador alcanza con
   eso: no puede leer push_subscriptions para confirmarlo. */
export async function navegadorSuscripto() {
  if (!pushSoportado() || Notification.permission !== 'granted') return false;
  const registro = await navigator.serviceWorker.getRegistration();
  const sus = registro ? await registro.pushManager.getSubscription() : null;
  return !!sus;
}

// Llamar SIEMPRE desde un click/tap del usuario (no en un useEffect al cargar),
// si no el navegador ignora el pedido de permiso o lo deniega directo.
export async function activarNotificaciones(clubId, perfilId) {
  /* Sin usuario no tiene sentido pedir el permiso: se corta antes. El resto
     de los chequeos (soporte, HTTPS, clave, permiso) los hace
     suscribirNavegador, igual que para el jugador. */
  if (pushSoportado() && window.isSecureContext && VAPID_PUBLIC_KEY && !perfilId) return fallo('sin-perfil');

  try {
    const r = await suscribirNavegador();
    if (!r.ok) return r;

    const json = r.json;
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

    if (error) return fallo(motivoDeError(error), textoDeError(error));
    return { ok: true };
  } catch (err) {
    console.error('Error activando notificaciones:', err);
    return fallo('error', textoDeError(err));
  }
}

export async function estaSuscripto() {
  if (!pushSoportado()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return false;
  const suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) return false;

  /* El navegador puede estar suscripto y la fila no haberse guardado nunca
     (falló el insert la primera vez). En ese caso la campanita decía
     "activadas" y no llegaba ningún push jamás, porque el Edge Function
     manda a las filas de la tabla, no a lo que el navegador cree.
     Si la consulta falla (RLS, sin red) no concluimos nada: damos por
     buena la suscripción antes que mostrar un falso negativo. */
  const { data, error } = await supabase
    .from('push_subscriptions').select('endpoint').eq('endpoint', suscripcion.endpoint).limit(1);
  if (error) return true;
  return (data || []).length > 0;
}

/* Revisa una por una las condiciones que tienen que darse para que llegue un
   push, y devuelve cuál falla. Existe porque "no se pudo activar" puede ser
   cualquiera de siete cosas y desde el cartel no había forma de distinguirlas.
   No pide permisos ni suscribe: sólo mira. */
export async function diagnosticarPush(clubId, perfilId) {
  const chequeos = [];
  const anotar = (etiqueta, estado, detalle = null) => chequeos.push({ etiqueta, estado, detalle });

  anotar('Navegador compatible', pushSoportado() ? 'ok' : 'falla',
    pushSoportado() ? null
      : MOTIVOS_PUSH[motivoSinSoporte()]);

  /* localhost cuenta como contexto seguro aunque sea http://, y verlo escrito
     evita el susto de leer "HTTPS ✅ http://". */
  anotar('Sitio en contexto seguro', window.isSecureContext ? 'ok' : 'falla',
    window.isSecureContext
      ? (location.protocol === 'https:' ? null : `${location.hostname} (localhost cuenta como seguro)`)
      : MOTIVOS_PUSH['sin-https']);

  anotar('Clave VAPID cargada', VAPID_PUBLIC_KEY ? 'ok' : 'falla',
    VAPID_PUBLIC_KEY ? `…${String(VAPID_PUBLIC_KEY).slice(-6)}` : MOTIVOS_PUSH['falta-vapid-key']);

  anotar('Usuario identificado', perfilId ? 'ok' : 'falla', perfilId ? null : MOTIVOS_PUSH['sin-perfil']);

  const permiso = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  anotar('Permiso del navegador',
    permiso === 'granted' ? 'ok' : permiso === 'denied' ? 'falla' : 'aviso',
    permiso === 'denied' ? MOTIVOS_PUSH['permiso-bloqueado']
      : permiso === 'default' ? 'Todavía no se pidió. Lo pide el botón de activar.' : null);

  let registro = null;
  if (pushSoportado()) {
    registro = await navigator.serviceWorker.getRegistration();
    anotar('Service worker registrado', registro ? 'ok' : 'falla',
      registro ? null : MOTIVOS_PUSH['sin-service-worker']);
  }

  if (registro) {
    const sus = await registro.pushManager.getSubscription();
    anotar('Dispositivo suscripto', sus ? 'ok' : 'aviso',
      sus ? null : 'Todavía no. Se crea al activar.');

    if (sus) {
      const { data, error } = await supabase
        .from('push_subscriptions').select('endpoint').eq('endpoint', sus.endpoint).limit(1);
      anotar('Suscripción guardada en la base',
        error ? 'falla' : (data || []).length > 0 ? 'ok' : 'falla',
        error ? MOTIVOS_PUSH[motivoDeError(error)]
          : (data || []).length > 0 ? null
          : 'El navegador está suscripto pero la fila no está en push_subscriptions: por eso no llega nada. Tocá activar de nuevo.');
    }
  }

  /* La tabla tiene que existir y dejarnos escribir; si no, el alta falla
     siempre por más que el navegador diga que sí. */
  const { error: errTabla } = await supabase
    .from('push_subscriptions').select('endpoint', { head: true, count: 'exact' }).limit(1);
  anotar('Tabla push_subscriptions', errTabla ? 'falla' : 'ok',
    errTabla ? MOTIVOS_PUSH[motivoDeError(errTabla)] : null);

  return { chequeos, todoOk: chequeos.every((c) => c.estado !== 'falla') };
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
