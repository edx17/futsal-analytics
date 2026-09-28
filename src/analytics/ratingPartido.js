// src/analytics/ratingPartido.js
// ═══════════════════════════════════════════════════════════════════════════
// RATING DE UN PARTIDO — una sola forma de armarlo para toda la app
//
// Resumen, Inicio, Plantel, Citación, Reportes y el perfil del jugador
// calculaban el rating cada uno a su manera: unos le pasaban al arquero todos
// los remates rivales y otros sólo los que recibió en cancha, el perfil
// contaba como gol propio el gol que el jugador asistió, y ninguno le pasaba
// el resultado del partido. El mismo jugador en el mismo partido podía tener
// una nota distinta en cada pantalla.
//
// Acá se arma todo desde los eventos del partido:
//   · sus eventos, más una copia virtual de cada gol que asistió;
//   · los eventos del rival mientras él estaba en cancha (quinteto_activo);
//   · el +/-, y la participación por quintetos en lugar de los minutos del
//     reloj (el minuto que se guarda es el del cronómetro de la toma de
//     datos y no siempre coincide con el tiempo de juego);
//   · el resultado del partido, para el bonus por ganar y el techo en
//     goleadas en contra.
// ═══════════════════════════════════════════════════════════════════════════

import { analizarPartido, calcularParticipacion } from './engine';
import { calcularRatingDetallado } from './rating';

const esGol = (ev) => ev?.accion === 'Gol' || ev?.accion === 'Remate - Gol';
const mismoId = (a, b) => a != null && b != null && String(a) === String(b);

const quintetoDe = (ev) => {
  let qa = ev?.quinteto_activo;
  if (!qa) return null;
  if (typeof qa === 'string') {
    try { qa = JSON.parse(qa); } catch { return null; }
  }
  return Array.isArray(qa) && qa.length ? qa.map(String) : null;
};

const ordenar = (a, b) => {
  if (a.periodo !== b.periodo) return a.periodo === 'PT' ? -1 : b.periodo === 'PT' ? 1 : 0;
  return ((a.minuto || 0) * 60 + (a.segundos || 0)) - ((b.minuto || 0) * 60 + (b.segundos || 0));
};

/**
 * Prepara el cálculo para un partido. Devuelve `detalle(jugador)` y
 * `rating(jugador)`; lo pesado (quintetos, +/-, participación) se hace una vez.
 *
 * @param eventos   todos los eventos del partido (o del tramo que se analiza)
 * @param opciones  { plusMinus }: el +/- por jugador si ya está calculado
 */
export function prepararRatingsPartido(eventos = [], { plusMinus } = {}) {
  const evs = (Array.isArray(eventos) ? eventos : []).slice().sort(ordenar);
  const pm = plusMinus || analizarPartido(evs, 'Propio', false).plusMinusJugador || {};
  const { participacion } = calcularParticipacion(evs);

  const propios = evs.filter((e) => e.equipo === 'Propio');
  const rivales = evs.filter((e) => e.equipo === 'Rival' || e.is_rival);
  const golesFavor = propios.filter(esGol).length;
  const golesContra = rivales.filter(esGol).length;
  const hayQuintetos = rivales.some((e) => quintetoDe(e));

  const detalle = (jugador) => {
    const id = String(jugador?.id);
    const suyos = propios.filter((e) => mismoId(e.id_jugador, id));
    const asistidos = propios
      .filter((e) => esGol(e) && mismoId(e.id_asistencia, id))
      .map((e) => ({ ...e, id_jugador: jugador.id, tipoVirtual: 'Asistencia' }));
    // Sin quintetos guardados no se sabe quién estaba: el arquero carga con todo.
    const rivalEnCancha = hayQuintetos
      ? rivales.filter((e) => quintetoDe(e)?.includes(id))
      : rivales;
    const part = participacion[id];
    const pmJugador = Number(pm[id] ?? pm[jugador.id]) || 0;
    const minutos = part?.minutosEquivalentes || 0;
    const r = calcularRatingDetallado(jugador, [...suyos, ...asistidos], rivalEnCancha, pmJugador, minutos, {
      golesFavor,
      golesContra,
      participacion: (part?.pct || 0) / 100,
    });
    return { ...r, plusMinus: pmJugador, participacion: (part?.pct || 0) / 100 };
  };

  return {
    golesFavor,
    golesContra,
    detalle,
    rating: (jugador) => detalle(jugador).rating,
  };
}
