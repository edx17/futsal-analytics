/* JUEGOS · SONIDO Y VIBRACIÓN
 *
 * `sonar(id)` y `vibrar(id)` para los momentos clave (gol, carta especial,
 * victoria…). El sonido usa el mismo motor que la apertura de sobres
 * (utils/sonidoApertura: sintetizado + el público grabado). La vibración,
 * `navigator.vibrate` donde exista (Android; iPhone no la tiene).
 * Las preferencias quedan en el dispositivo. El hook vive en useFeedback.js.
 */

import { prepararAudio, sonar as sonarApertura } from '../utils/sonidoApertura';

const CLAVE = 'juegos_prefs';

/* id → [sonido de sonidoApertura, duración] */
export const SONIDOS = {
  click: ['golpeSuave', 0.2],
  elegir: ['brillo', 0.4],
  gol: ['cartaOro', 1.8],
  especial: ['cartaRara', 2.6],
  victoria: ['cartaEvento', 2.6],
  derrota: ['golpe', 0.6],
  premio: ['brillo', 0.6],
};

/* id → patrón de vibración (ms) */
export const VIBRACIONES = {
  click: [8],
  elegir: [12],
  gol: [60, 40, 120],
  especial: [40, 30, 40, 30, 160],
  victoria: [80, 60, 80, 60, 220],
  derrota: [200],
  premio: [30, 30, 60],
};

export function leerPreferencias() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE));
    return { sonido: p?.sonido !== false, vibracion: p?.vibracion !== false };
  } catch {
    return { sonido: true, vibracion: true };
  }
}

export function guardarPreferencias(p) {
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin storage */ }
  oyentes.forEach((f) => f(p));
}

const oyentes = new Set();
export function alCambiarPreferencias(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

export const puedeVibrar = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Hace sonar un momento del juego (si el sonido está prendido). */
export function sonar(id, prefs = leerPreferencias()) {
  const s = SONIDOS[id];
  if (!s || !prefs.sonido) return;
  prepararAudio(true);
  sonarApertura(s[0], s[1]);
}

/** Hace vibrar (si se puede y está prendido). */
export function vibrar(id, prefs = leerPreferencias()) {
  const v = Array.isArray(id) ? id : VIBRACIONES[id];
  if (!v || !prefs.vibracion || !puedeVibrar()) return;
  try { navigator.vibrate(v); } catch { /* algunos navegadores lo bloquean */ }
}
