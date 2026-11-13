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

/** Las n mejores cartas de la colección (mayor media; si empatan, la más rara), sin repetir jugador. */
export function mejoresCartas(cartas = [], n = 3) {
  const vistos = new Set();
  return [...(cartas || [])]
    .filter((c) => c && c.carta)
    .sort((a, b) => (Number(b.carta.ovr) || 0) - (Number(a.carta.ovr) || 0) || rangoRareza(a.rareza) - rangoRareza(b.rareza))
    .filter((c) => {
      const j = String(c.carta.id ?? c.catalogo_id);
      if (vistos.has(j)) return false;
      vistos.add(j);
      return true;
    })
    .slice(0, n);
}

/** La mejor carta de la colección: la de mayor media; si empatan, la más rara. */
export function mejorCarta(cartas = []) {
  return mejoresCartas(cartas, 1)[0] || null;
}

const SOBRES_GRATIS = ['diario', 'racha', 'wellness', 'premio', 'premio_especial'];

export const MODOS = {
  vdraft: { id: 'vdraft', titulo: 'V-DRAFT', bajada: 'Armá tu equipo carta por carta. Desafío del día y torneo semanal con pozo.', imagen: '/juegos/vdraft.jpg', acento: '#00ff88' },
  penales: { id: 'penales', titulo: 'PENALES', bajada: 'Tu pateador y tu arquero contra la CPU. Ganá V-Coins.', imagen: '/penales/fondo.webp', acento: '#22d3ee' },
  duelos: { id: 'duelos', titulo: 'DUELOS', bajada: 'Retá a otro del club con 5 cartas de tu colección.', imagen: '/juegos/mysquad.jpg', acento: '#f43f5e' },
  sobres: { id: 'sobres', titulo: 'SOBRES', bajada: 'Abrí tus sobres y completá la colección.', imagen: '/juegos/sobres.jpg', acento: '#fbbf24' },
  mysquad: { id: 'mysquad', titulo: 'MYSQUAD', bajada: 'Armá tu quinteto con el plantel y compartilo.', imagen: '/juegos/mysquad.jpg', acento: '#a78bfa' },
  god: { id: 'sobres', clave: 'god', titulo: 'MODO GOD', bajada: 'Cartas, héroes, eventos, sobres, usuarios y V-Coins.', imagen: '/juegos/sobres.jpg', acento: '#fbbf24' },
};

/**
 * Los modos en orden, cada uno con su cartel.
 * badge: { texto, tono: 'neon'|'oro'|'naranja'|undefined, latido, cuenta: true (mostrar la cuenta regresiva) }
 */
export function modosDelMenu({ sobres = null, vdraft = null, duelos = null, kiosco = false, esSuper = false } = {}) {
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

  const retos = duelos?.recibidos?.length || 0;
  const nuevos = (duelos?.historial || []).filter((d) => d.nuevo).length;
  const badgeDuelos = retos ? { texto: `TE ${retos === 1 ? 'RETARON' : `RETARON ${retos} VECES`}`, tono: 'neon', latido: true }
    : nuevos ? { texto: 'RESULTADO NUEVO', tono: 'neon' } : { texto: 'RETÁ A ALGUIEN', tono: 'naranja' };

  const modos = [
    { ...MODOS.vdraft, badge: badgeVDraft },
    { ...MODOS.duelos, badge: badgeDuelos },
    { ...MODOS.penales, badge: { texto: 'CON PREMIO', tono: 'naranja' } },
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
    // La que está más cerca de cumplirse (de las que faltan): para mostrarla en el resumen.
    proxima: lista.filter((m) => m.progreso < m.meta)
      .sort((a, b) => (b.progreso / (b.meta || 1)) - (a.progreso / (a.meta || 1)))[0] || null,
  };
}
