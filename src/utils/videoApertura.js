/* LOS VIDEOS DE LAS APERTURAS: UN REPRODUCTOR PREPARADO POR VIDEO
 *
 * Cada cinemática tiene un solo <video>, creado la primera vez que hace falta
 * y reutilizado después:
 *   - se elige UN formato (el que el navegador reproduce mejor) y se baja sólo
 *     ese, una vez;
 *   - se puede preparar antes de abrir (al apuntar al sobre, o al tocar ABRIR
 *     mientras la base todavía está sorteando las cartas);
 *   - el componente lo toma, lo muestra y lo devuelve; ni un re-render ni el
 *     doble montaje de React (StrictMode) lo recrean ni lo vacían.
 * `liberarVideos()` los descarga del todo (al salir de la pantalla de sobres).
 */

const reproductores = new Map(); // id → HTMLVideoElement

const esApple = () => typeof navigator !== 'undefined' && /Apple/i.test(navigator.vendor || '');

/** El formato a usar: WebM (VP9, ~25% más liviano) donde se decodifica bien; si no, MP4 (H.264). */
export function elegirFuente(fuentes = [], video = typeof document !== 'undefined' ? document.createElement('video') : null) {
  if (!video || !video.canPlayType) return fuentes[fuentes.length - 1] || null;
  const webm = fuentes.find((f) => f.tipo === 'video/webm');
  const mp4 = fuentes.find((f) => f.tipo === 'video/mp4');
  if (webm && !esApple() && video.canPlayType('video/webm; codecs="vp9"') === 'probably') return webm;
  if (mp4 && video.canPlayType('video/mp4; codecs="avc1.640020"')) return mp4;
  return webm || mp4 || fuentes[0] || null;
}

/** El <video> de una cinemática, listo para cargar (lo crea la primera vez). */
export function tomarVideo(video) {
  if (typeof document === 'undefined' || !video) return null;
  let v = reproductores.get(video.id);
  if (v && v.getAttribute('src')) return v;
  v = v || document.createElement('video');
  const fuente = elegirFuente(video.fuentes, v);
  if (!fuente) return null;
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  v.disablePictureInPicture = true;
  v.preload = 'auto';
  if (video.poster) v.poster = video.poster;
  v.src = fuente.src;
  v.dataset.fuente = fuente.tipo;
  reproductores.set(video.id, v);
  return v;
}

/** Empieza a bajar la cinemática antes de abrir el sobre (sin reproducirla). */
export function prepararVideo(video) {
  const v = tomarVideo(video);
  if (v && v.readyState === 0 && v.networkState !== 2 /* LOADING */) {
    try { v.load(); } catch { /* el navegador decide */ }
  }
  return v;
}

/** Fuerza a volver a bajar (reintento después de un error). */
export function recargarVideo(video) {
  const v = reproductores.get(video?.id);
  if (v) {
    v.removeAttribute('src');
    try { v.load(); } catch { /* nada */ }
  }
  reproductores.delete(video?.id);
  return prepararVideo(video);
}

/** Descarga todo (al salir de la pantalla): no queda nada en memoria ni bajando. */
export function liberarVideos() {
  reproductores.forEach((v) => {
    try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch { /* nada */ }
  });
  reproductores.clear();
}
