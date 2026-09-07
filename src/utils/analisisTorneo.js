/**
 * Análisis de un torneo, sobre CUALQUIER conjunto de partidos.
 *
 * La pantalla de Torneos ya calculaba la tabla y las estadísticas, pero
 * siempre sobre la rueda filtrada y siempre para mi equipo. Para comparar
 * rueda 1 contra rueda 2, o mi equipo contra otro, hace falta lo mismo pero
 * sobre listas arbitrarias. Está acá afuera y sin estado para poder llamarlo
 * tres veces con tres listas distintas, y para poder probarlo sin navegador.
 */

import { numeroJornada } from './ruedas';

export const ES_JUGADO = (f) => f?.estado === 'Finalizado' || f?.estado === 'Jugado';

/**
 * Un partido de `partidos` puede venir de dos formas: como partido propio
 * (goles_propios/goles_rival relativos a mi club, con `condicion` diciendo si
 * jugué de local) o como cruce entre terceros (nombre_propio es el local).
 * Todo lo demás trabaja sobre esta forma normalizada y no vuelve a pensarlo.
 */
export function normalizarPartido(f, miClub) {
  const esMio = (!f.nombre_propio || f.nombre_propio === miClub) || (f.rival === miClub);

  let local, visita, escudoLocal, escudoVisita;
  if (esMio) {
    if (f.condicion === 'Visitante') {
      local = f.rival || 'Rival Desconocido'; visita = miClub;
      escudoLocal = f.escudo_rival; escudoVisita = f.escudo_propio;
    } else {
      local = miClub; visita = f.rival || 'Rival Desconocido';
      escudoLocal = f.escudo_propio; escudoVisita = f.escudo_rival;
    }
  } else {
    local = f.nombre_propio || miClub; visita = f.rival || 'Rival Desconocido';
    escudoLocal = f.escudo_propio; escudoVisita = f.escudo_rival;
  }

  let golesLocal, golesVisita;
  if (esMio && f.condicion === 'Visitante') {
    golesLocal = Number(f.goles_rival) || 0;
    golesVisita = Number(f.goles_propios) || 0;
  } else {
    golesLocal = Number(f.goles_propios) || 0;
    golesVisita = Number(f.goles_rival) || 0;
  }

  return { local, visita, golesLocal, golesVisita, escudoLocal, escudoVisita, esMio, jugado: ES_JUGADO(f), partido: f };
}

/** Todos los equipos que aparecen en el torneo, para los selectores. */
export function equiposDe(partidos = [], miClub) {
  const set = new Set();
  (partidos || []).forEach((f) => {
    const n = normalizarPartido(f, miClub);
    set.add(n.local); set.add(n.visita);
  });
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Tabla de posiciones. Es la lógica que ya vivía dentro del useMemo de
 * Torneos, movida acá tal cual para poder pedirla por rueda.
 */
export function calcularTabla(partidos = [], miClub, modo = 'general') {
  const tabla = {};

  (partidos || []).forEach((f) => {
    const n = normalizarPartido(f, miClub);

    [[n.local, n.escudoLocal], [n.visita, n.escudoVisita]].forEach(([eq, escudo]) => {
      if (!tabla[eq]) {
        tabla[eq] = {
          nombre: eq, escudo,
          pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, rachaGeneral: [],
          pjL: 0, pgL: 0, peL: 0, ppL: 0, gfL: 0, gcL: 0, ptsL: 0, rachaLocal: [],
          pjV: 0, pgV: 0, peV: 0, ppV: 0, gfV: 0, gcV: 0, ptsV: 0, rachaVisita: [],
        };
      }
    });

    if (!n.jugado) return;

    const tL = tabla[n.local];
    const tV = tabla[n.visita];

    tL.pj++; tV.pj++;
    tL.gf += n.golesLocal; tV.gf += n.golesVisita;
    tL.gc += n.golesVisita; tV.gc += n.golesLocal;
    tL.pjL++; tL.gfL += n.golesLocal; tL.gcL += n.golesVisita;
    tV.pjV++; tV.gfV += n.golesVisita; tV.gcV += n.golesLocal;

    if (n.golesLocal > n.golesVisita) {
      tL.pg++; tL.pts += 3; tL.pgL++; tL.ptsL += 3; tL.rachaGeneral.push('V'); tL.rachaLocal.push('V');
      tV.pp++; tV.ppV++; tV.rachaGeneral.push('D'); tV.rachaVisita.push('D');
    } else if (n.golesLocal < n.golesVisita) {
      tV.pg++; tV.pts += 3; tV.pgV++; tV.ptsV += 3; tV.rachaGeneral.push('V'); tV.rachaVisita.push('V');
      tL.pp++; tL.ppL++; tL.rachaGeneral.push('D'); tL.rachaLocal.push('D');
    } else {
      tL.pe++; tL.pts += 1; tL.peL++; tL.ptsL += 1; tL.rachaGeneral.push('E'); tL.rachaLocal.push('E');
      tV.pe++; tV.pts += 1; tV.peV++; tV.ptsV += 1; tV.rachaGeneral.push('E'); tV.rachaVisita.push('E');
    }
  });

  return Object.values(tabla).map((t) => {
    t.difGeneral = t.gf - t.gc;
    t.difLocal = t.gfL - t.gcL;
    t.difVisita = t.gfV - t.gcV;
    return t;
  }).sort((a, b) => {
    if (modo === 'local') {
      if (b.ptsL !== a.ptsL) return b.ptsL - a.ptsL;
      if (b.difLocal !== a.difLocal) return b.difLocal - a.difLocal;
      return b.gfL - a.gfL;
    } else if (modo === 'visitante') {
      if (b.ptsV !== a.ptsV) return b.ptsV - a.ptsV;
      if (b.difVisita !== a.difVisita) return b.difVisita - a.difVisita;
      return b.gfV - a.gfV;
    }
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.difGeneral !== a.difGeneral) return b.difGeneral - a.difGeneral;
    return b.gf - a.gf;
  });
}

/** En qué puesto quedó un equipo. null si no jugó en ese conjunto. */
export function puestoDe(tabla = [], equipo) {
  const i = tabla.findIndex((t) => t.nombre === equipo);
  return i === -1 ? null : i + 1;
}

/**
 * Orden de partidos: por NÚMERO DE FECHA, no por el día en que se jugó.
 *
 * Los partidos se reprograman, se suspenden y se juegan fuera de orden, así
 * que ordenar por día deja la segunda rueda como 19, 20, 18, 22, 24. Por
 * número de fecha, la primera fila de una rueda es la ida de la primera fila
 * de la otra, que es lo que hace que las dos columnas se puedan leer
 * enfrentadas.
 *
 * Sin número en la jornada (copas: "Octavos", "Semi") se cae al orden natural
 * del texto y, recién al final, al día jugado.
 */
const porOrdenDeFecha = (a, b) => {
  const na = numeroJornada(a.jornada);
  const nb = numeroJornada(b.jornada);
  if (na != null && nb != null && na !== nb) return na - nb;
  if (na != null && nb == null) return -1;
  if (na == null && nb != null) return 1;

  const j = String(a.jornada || '').localeCompare(String(b.jornada || ''), 'es', { numeric: true, sensitivity: 'base' });
  if (j !== 0) return j;

  if (a.fecha && b.fecha) return String(a.fecha).localeCompare(String(b.fecha));
  return (a.id ?? 0) - (b.id ?? 0);
};

/**
 * Los partidos de UN equipo, en orden cronológico, ya resueltos a
 * victoria/empate/derrota desde el punto de vista de ese equipo.
 */
export function resultadosDe(partidos = [], equipo, miClub) {
  return (partidos || [])
    .map((f) => ({ n: normalizarPartido(f, miClub), f }))
    .filter(({ n }) => n.jugado && (n.local === equipo || n.visita === equipo))
    .sort((a, b) => porOrdenDeFecha(a.f, b.f))
    .map(({ n, f }) => {
      const deLocal = n.local === equipo;
      const gf = deLocal ? n.golesLocal : n.golesVisita;
      const gc = deLocal ? n.golesVisita : n.golesLocal;
      return {
        res: gf > gc ? 'V' : gf < gc ? 'D' : 'E',
        gf, gc, dif: gf - gc,
        rival: deLocal ? n.visita : n.local,
        condicion: deLocal ? 'Local' : 'Visitante',
        jornada: f.jornada || '',
        fecha: f.fecha || '',
        id: f.id,
      };
    });
}

/** PJ/PG/PE/PP, goles, puntos y eficacia sobre una lista de resultados. */
export function statsDe(resultados = []) {
  const s = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, vallas: 0 };
  resultados.forEach((r) => {
    s.pj++; s.gf += r.gf; s.gc += r.gc;
    if (r.res === 'V') s.pg++; else if (r.res === 'D') s.pp++; else s.pe++;
    if (r.gc === 0) s.vallas++;
  });
  s.dif = s.gf - s.gc;
  s.pts = s.pg * 3 + s.pe;
  /* Eficacia = puntos sacados sobre los que estaban en juego. Es la medida
     que permite comparar una rueda de 9 fechas con una de 11. */
  s.eficacia = s.pj > 0 ? Number(((s.pts / (s.pj * 3)) * 100).toFixed(1)) : 0;
  s.promGF = s.pj > 0 ? Number((s.gf / s.pj).toFixed(2)) : 0;
  s.promGC = s.pj > 0 ? Number((s.gc / s.pj).toFixed(2)) : 0;
  return s;
}

const rachaMasLarga = (resultados, cuenta) => {
  let mejor = 0, actual = 0;
  resultados.forEach((r) => {
    if (cuenta(r.res)) { actual++; if (actual > mejor) mejor = actual; }
    else actual = 0;
  });
  return mejor;
};

/**
 * Rachas. Se distinguen cuatro porque contestan cosas distintas: ganar
 * seguido no es lo mismo que no perder seguido, y perder seguido no es lo
 * mismo que no ganar seguido.
 */
export function rachasDe(resultados = []) {
  const ultimo = resultados[resultados.length - 1]?.res || null;
  let actual = 0;
  for (let i = resultados.length - 1; i >= 0 && resultados[i].res === ultimo; i--) actual++;

  return {
    actualTipo: ultimo,
    actualCantidad: ultimo ? actual : 0,
    mejorGanando: rachaMasLarga(resultados, (r) => r === 'V'),
    mejorInvicto: rachaMasLarga(resultados, (r) => r === 'V' || r === 'E'),
    peorPerdiendo: rachaMasLarga(resultados, (r) => r === 'D'),
    peorSinGanar: rachaMasLarga(resultados, (r) => r === 'D' || r === 'E'),
  };
}

/**
 * Mejor y peor partido. El criterio es la diferencia de gol; a igual
 * diferencia gana el de más goles a favor, porque un 5-2 tuvo más producción
 * ofensiva que un 3-0 aunque los dos sean +3.
 */
export function mejorYPeor(resultados = []) {
  if (resultados.length === 0) return { mejor: null, peor: null };
  const ordenados = [...resultados].sort((a, b) => (b.dif - a.dif) || (b.gf - a.gf));
  return { mejor: ordenados[0], peor: ordenados[ordenados.length - 1] };
}
