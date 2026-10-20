import { PREFERENCIAS_POR_DEFECTO } from '../analytics/aperturas';

/* PREFERENCIAS DE LA APERTURA DE SOBRES (de cada uno, en su navegador)
 *
 * Sonido, velocidad y si se ven las aperturas de cine. Son gustos de quien
 * mira: nunca cambian qué cartas salen. Si el navegador no deja guardar
 * (modo privado), se usan las de siempre.
 */

const CLAVE = 'vc_sobres_apertura';

export function leerPreferencias() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    return { ...PREFERENCIAS_POR_DEFECTO, ...(guardadas && typeof guardadas === 'object' ? guardadas : {}) };
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

export function guardarPreferencias(prefs) {
  try { localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch { /* sin storage: queda para esta visita */ }
}

/** "Reducir movimiento" del sistema operativo. */
export const menosMovimiento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Equipos con pocos núcleos o poca memoria: menos partículas y sin desenfoque. */
export function equipoLiviano() {
  if (typeof navigator === 'undefined') return false;
  const nucleos = navigator.hardwareConcurrency || 8;
  const memoria = navigator.deviceMemory || 8;
  return nucleos <= 4 || memoria <= 3;
}
