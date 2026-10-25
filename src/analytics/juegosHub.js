/* JUEGOS · EL MENÚ (sin pantalla, para poder probarlo)
 *
 * Arma lo que muestra el menú de juegos a partir de lo que devuelve la base:
 *   - la carta protagonista (la mejor de tu colección);
 *   - los modos con su cartel ("Gratis hoy", "Recompensa disponible"…);
 *   - el resumen de las misiones del día.
 * Una sola fuente para las dos vistas: el hub (PC/tablet) y el carrusel (celular).
 */

import { ORDEN_RAREZA } from './aperturas';

const rangoRareza = (r) => {
  const i = ORDEN_RAREZA.indexOf(r);
  return i === -1 ? ORDEN_RAREZA.length : i;
};

/** La mejor carta de la colección: la de mayor media; si empatan, la más rara. */
export function mejorCarta(cartas = []) {
  return [...(cartas || [])]
    .filter((c) => c && c.carta)
    .sort((a, b) => (Number(b.carta.ovr) || 0) - (Number(a.carta.ovr) || 0) || rangoRareza(a.rareza) - rangoRareza(b.rareza))[0] || null;
}

const SOBRES_GRATIS = ['diario', 'racha', 'wellness', 'premio', 'premio_especial'];

export const MODOS = {
  vdraft: { id: 'vdraft', titulo: 'V-DRAFT', bajada: 'Armá tu equipo carta por carta y salí campeón contra la liga.', imagen: '/juegos/vdraft.jpg', acento: '#38bdf8' },
  penales: { id: 'penales', titulo: 'PENALES', bajada: 'Pateá al ángulo y adiviná el lado para atajar.', imagen: '/penales/fondo.webp', acento: '#f97316' },
  sobres: { id: 'sobres', titulo: 'SOBRES', bajada: 'Abrí tus sobres y completá la colección.', imagen: '/juegos/sobres.jpg', acento: '#fbbf24' },
  mysquad: { id: 'mysquad', titulo: 'MYSQUAD', bajada: 'El quinteto ideal y los premios de la semana.', imagen: '/juegos/mysquad.jpg', acento: '#00ff88' },
  god: { id: 'sobres', clave: 'god', titulo: 'MODO GOD', bajada: 'Cartas, héroes, eventos, sobres, usuarios y V-Coins.', imagen: '/juegos/sobres.jpg', acento: '#fbbf24' },
};

/**
 * Los modos en orden, cada uno con su cartel.
 * badge: { texto, tono: 'neon'|'oro'|'naranja'|undefined, latido, cuenta: true (mostrar la cuenta regresiva) }
 */
export function modosDelMenu({ sobres = null, vdraft = null, kiosco = false, esSuper = false } = {}) {
  if (esSuper && !kiosco) {
    return [
      { ...MODOS.god, badge: { texto: 'ADMIN', tono: 'oro' } },
      { ...MODOS.mysquad, badge: { texto: 'SÓLO PRUEBA' } },
      { ...MODOS.penales, badge: { texto: 'SÓLO PRUEBA' } },
      { ...MODOS.vdraft, bloqueado: 'El superusuario no compite.', badge: { texto: 'NO COMPITE' } },
    ];
  }

  const d = sobres?.disponibles || {};
  const gratis = SOBRES_GRATIS.some((k) => d[k]);
  const conPuntos = (sobres?.puntos ?? 0) >= (sobres?.costo_puntos ?? Infinity);
  const badgeSobres = gratis ? { texto: 'GRATIS HOY', tono: 'neon', latido: true }
    : conPuntos ? { texto: 'CON V-COINS', tono: 'oro' }
      : sobres ? { texto: 'VUELVEN EN', cuenta: true } : null;

  const enJuego = vdraft?.partida && vdraft.partida.estado !== 'terminada';
  const badgeVDraft = enJuego ? { texto: 'PARTIDA EN JUEGO', tono: 'neon', latido: true }
    : vdraft?.gratis_hoy ? { texto: 'GRATIS HOY', tono: 'neon', latido: true }
      : vdraft ? { texto: `${vdraft.costo ?? 100} V-COINS`, tono: 'oro' } : null;

  const modos = [
    { ...MODOS.vdraft, badge: badgeVDraft },
    { ...MODOS.penales, badge: { texto: 'NUEVO', tono: 'naranja' } },
    { ...MODOS.sobres, badge: badgeSobres },
  ];
  if (!kiosco) modos.push({ ...MODOS.mysquad, badge: null });
  return modos;
}

/** Cuántas misiones hay para cobrar y cuántas se completaron. */
export function resumenMisiones(misiones = []) {
  const lista = misiones || [];
  return {
    total: lista.length,
    cumplidas: lista.filter((m) => m.progreso >= m.meta).length,
    paraCobrar: lista.filter((m) => m.progreso >= m.meta && !m.cobrada).length,
    vcoinsPendientes: lista.filter((m) => m.progreso >= m.meta && !m.cobrada).reduce((s, m) => s + (m.premio || 0), 0),
  };
}
