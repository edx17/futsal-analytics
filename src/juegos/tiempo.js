/* El día del juego es el de Argentina (como _sobres_hoy en la base): todo lo
   diario (sobres, partida gratis, misiones) se reinicia a las 00:00 de ahí,
   esté donde esté el dispositivo. Argentina es UTC−3 todo el año. */

const OFFSET_AR_MS = -3 * 3600 * 1000;
const DIA_MS = 24 * 3600 * 1000;

/** La fecha de hoy en Argentina ('2026-10-25'). */
export function hoyAR(ahora = Date.now()) {
  return new Date(ahora + OFFSET_AR_MS).toISOString().slice(0, 10);
}

/** Cuánto falta (ms) para la medianoche de Argentina. */
export function msHastaMedianocheAR(ahora = Date.now()) {
  const local = ahora + OFFSET_AR_MS;
  return DIA_MS - (((local % DIA_MS) + DIA_MS) % DIA_MS);
}

/** 3725000 → '01:02:05'. Con días: '2d 03:00:00'. */
export function formatoCuenta(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const dos = (n) => String(n).padStart(2, '0');
  return `${d ? `${d}d ` : ''}${dos(h)}:${dos(m)}:${dos(ss)}`;
}
