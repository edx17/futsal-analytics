// src/analytics/liga.js
//
// AFA Stats / Otras competencias: tabla, goleadores, fixture y reportes a
// partir de los partidos de liga_partidos (lo que publica segundopalo.com).
// Funciones puras: reciben las filas y devuelven lo que dibuja la pantalla.

export const DIVISIONES = ['A', 'B', 'C', 'D'];
export const CATEGORIAS_LIGA = ['1ra', '3ra', '4ta', '5ta', '6ta', '7ma', '8va'];

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export const esFinalizado = (p) => /^finalizado$/i.test(String(p?.estado || ''));
const jugado = (p) => esFinalizado(p) && p.goles_local !== null && p.goles_local !== undefined
  && p.goles_visitante !== null && p.goles_visitante !== undefined;

/**
 * ¿Este equipo de la liga es mi club? Compara sin tildes, mayúsculas ni
 * espacios, y acepta que uno empiece con el otro ("Libertadores" ↔
 * "LIBERTADORES SC (AFA - Masc)").
 */
export function esMiEquipo(equipo, miClub) {
  const a = clave(equipo);
  const b = clave(String(miClub || '').replace(/\(.*?\)/g, ''));
  if (!a || !b) return false;
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 5 && largo.startsWith(corto);
}

/** La división donde juega mi club (en cualquier competencia), o null. */
export function divisionDeMiClub(partidosPorCompetencia, competencias, miClub) {
  for (const c of competencias || []) {
    const lista = partidosPorCompetencia?.[c.id] || [];
    if (lista.some((p) => esMiEquipo(p.local, miClub) || esMiEquipo(p.visitante, miClub))) return c.division;
  }
  return null;
}

const filaVacia = (equipo) => ({ equipo, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, forma: [] });

/**
 * Tabla de posiciones. `ambito`: 'general' | 'local' | 'visitante'.
 * Orden: puntos, diferencia, goles a favor, nombre. `forma` son los últimos
 * cinco resultados (G/E/P), el más reciente al final.
 */
export function tablaPosiciones(partidos, ambito = 'general') {
  const filas = new Map();
  const fila = (eq) => { if (!filas.has(eq)) filas.set(eq, filaVacia(eq)); return filas.get(eq); };
  (partidos || []).forEach((p) => { if (p.local) fila(p.local); if (p.visitante) fila(p.visitante); });

  const ordenados = [...(partidos || [])].filter(jugado)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || (a.jornada ?? 0) - (b.jornada ?? 0));

  ordenados.forEach((p) => {
    const lados = [];
    if (ambito !== 'visitante') lados.push([p.local, p.goles_local, p.goles_visitante]);
    if (ambito !== 'local') lados.push([p.visitante, p.goles_visitante, p.goles_local]);
    lados.forEach(([eq, gf, gc]) => {
      const f = fila(eq);
      f.pj += 1; f.gf += gf; f.gc += gc;
      if (gf > gc) { f.pg += 1; f.pts += 3; f.forma.push('G'); }
      else if (gf === gc) { f.pe += 1; f.pts += 1; f.forma.push('E'); }
      else { f.pp += 1; f.forma.push('P'); }
    });
  });

  return [...filas.values()]
    .map((f) => ({ ...f, dg: f.gf - f.gc, forma: f.forma.slice(-5) }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.equipo.localeCompare(b.equipo))
    .map((f, i) => ({ ...f, pos: i + 1 }));
}

/**
 * "F.Nannini1, F.Nannini2, D.González 1" → [{nombre:'F.Nannini'}, …], uno
 * por gol. El número del final es el orden del gol de ese jugador en el
 * partido, no la cantidad. "G. Ramírez" y "G.Ramírez" son el mismo.
 */
export function parsearGoleadores(texto) {
  return String(texto || '')
    .split(',')
    .map((s) => s.trim().replace(/\s*\d+$/, '').replace(/\.\s+/g, '.').replace(/\s+/g, ' ').trim())
    .filter((s) => s && /[a-záéíóúñü]/i.test(s));
}

/**
 * Tabla de goleadores: un registro por jugador y equipo, con goles y en
 * cuántos partidos convirtió. Inferiores no trae goleadores: da [].
 */
export function tablaGoleadores(partidos) {
  const acum = new Map();
  (partidos || []).filter(esFinalizado).forEach((p) => {
    [[p.local, p.goleadores_local], [p.visitante, p.goleadores_visitante]].forEach(([equipo, texto]) => {
      const goles = parsearGoleadores(texto);
      const enEste = new Set();
      goles.forEach((nombre) => {
        const k = `${clave(nombre)}|${clave(equipo)}`;
        if (!acum.has(k)) acum.set(k, { nombre, equipo, goles: 0, partidos: 0 });
        const g = acum.get(k);
        g.goles += 1;
        if (!enEste.has(k)) { enEste.add(k); g.partidos += 1; }
      });
    });
  });
  return [...acum.values()]
    .sort((a, b) => b.goles - a.goles || a.partidos - b.partidos || a.nombre.localeCompare(b.nombre))
    .map((g, i, arr) => ({ ...g, pos: i > 0 && arr[i - 1].goles === g.goles ? null : i + 1 }));
}

/** Partidos agrupados por fecha (jornada), en orden. */
export function fixturePorJornada(partidos) {
  const grupos = new Map();
  (partidos || []).forEach((p) => {
    const j = p.jornada ?? 0;
    if (!grupos.has(j)) grupos.set(j, []);
    grupos.get(j).push(p);
  });
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([jornada, lista]) => ({
      jornada,
      partidos: lista.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))
        || String(a.hora || '').localeCompare(String(b.hora || '')) || String(a.local).localeCompare(String(b.local))),
      jugados: lista.filter(esFinalizado).length,
    }));
}

/** La primera fecha con partidos sin terminar (la "fecha actual"), o la última. */
export function jornadaActual(fixture) {
  const pendiente = (fixture || []).find((f) => f.jugados < f.partidos.length);
  return pendiente ? pendiente.jornada : (fixture || []).at(-1)?.jornada ?? null;
}

/** La racha vigente de un equipo: { tipo: 'G'|'E'|'P'|'invicto', n }. */
function rachas(partidos) {
  const porEquipo = new Map();
  [...partidos].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
    .forEach((p) => {
      [[p.local, p.goles_local - p.goles_visitante], [p.visitante, p.goles_visitante - p.goles_local]].forEach(([eq, d]) => {
        if (!porEquipo.has(eq)) porEquipo.set(eq, []);
        porEquipo.get(eq).push(d > 0 ? 'G' : d === 0 ? 'E' : 'P');
      });
    });
  const res = [];
  porEquipo.forEach((lista, equipo) => {
    let invicto = 0;
    for (let i = lista.length - 1; i >= 0 && lista[i] !== 'P'; i -= 1) invicto += 1;
    let ganadas = 0;
    for (let i = lista.length - 1; i >= 0 && lista[i] === 'G'; i -= 1) ganadas += 1;
    let sinGanar = 0;
    for (let i = lista.length - 1; i >= 0 && lista[i] !== 'G'; i -= 1) sinGanar += 1;
    res.push({ equipo, invicto, ganadas, sinGanar });
  });
  return res;
}

const mejor = (lista, campo, menor = false) => {
  if (!lista.length) return null;
  const vals = lista.map((x) => x[campo]);
  const tope = menor ? Math.min(...vals) : Math.max(...vals);
  return { valor: tope, equipos: lista.filter((x) => x[campo] === tope).map((x) => x.equipo) };
};

/**
 * Los números de la competencia: promedios, cómo terminan los partidos, el
 * mejor ataque y defensa, la goleada más grande y las rachas vigentes.
 */
export function reportesLiga(partidos) {
  const jugados = (partidos || []).filter(jugado);
  const total = (partidos || []).length;
  const goles = jugados.reduce((s, p) => s + p.goles_local + p.goles_visitante, 0);
  const local = jugados.filter((p) => p.goles_local > p.goles_visitante).length;
  const empates = jugados.filter((p) => p.goles_local === p.goles_visitante).length;
  const visita = jugados.length - local - empates;
  const pct = (n) => (jugados.length ? Math.round((n / jugados.length) * 100) : 0);

  const tabla = tablaPosiciones(partidos).filter((f) => f.pj > 0);
  const conPromedio = tabla.map((f) => ({ ...f, gfp: f.gf / f.pj, gcp: f.gc / f.pj }));

  const goleada = [...jugados].sort((a, b) =>
    Math.abs(b.goles_local - b.goles_visitante) - Math.abs(a.goles_local - a.goles_visitante)
    || (b.goles_local + b.goles_visitante) - (a.goles_local + a.goles_visitante))[0] || null;
  const masGoles = [...jugados].sort((a, b) =>
    (b.goles_local + b.goles_visitante) - (a.goles_local + a.goles_visitante))[0] || null;

  const r = rachas(jugados);
  const conRacha = (campo) => {
    const m = mejor(r, campo);
    return m && m.valor > 1 ? m : null;
  };

  return {
    total,
    jugados: jugados.length,
    goles,
    promedioGoles: jugados.length ? goles / jugados.length : 0,
    resultados: { local, empates, visita, pctLocal: pct(local), pctEmpate: pct(empates), pctVisita: pct(visita) },
    mejorAtaque: mejor(conPromedio, 'gf'),
    mejorDefensa: mejor(conPromedio, 'gc', true),
    peorDefensa: mejor(conPromedio, 'gc'),
    goleada,
    masGoles,
    rachaInvicto: conRacha('invicto'),
    rachaGanadas: conRacha('ganadas'),
    rachaSinGanar: conRacha('sinGanar'),
  };
}

/** Los partidos de un equipo, del más viejo al más nuevo. */
export function partidosDeEquipo(partidos, equipo) {
  return (partidos || [])
    .filter((p) => p.local === equipo || p.visitante === equipo)
    .sort((a, b) => (a.jornada ?? 0) - (b.jornada ?? 0) || String(a.fecha || '').localeCompare(String(b.fecha || '')));
}

/** "Primera", "TERCERA", "4ta", "Quinta división" → '1ra', '3ra', '4ta', '5ta'. */
export function categoriaLiga(texto) {
  const t = sinTildes(texto).toLowerCase();
  const n = (t.match(/\d/) || [])[0];
  if (n) return CATEGORIAS_LIGA.find((c) => c.startsWith(n)) || null;
  const palabras = { primera: '1ra', tercera: '3ra', cuarta: '4ta', quinta: '5ta', sexta: '6ta', septima: '7ma', octava: '8va' };
  const k = Object.keys(palabras).find((w) => t.includes(w));
  return k ? palabras[k] : null;
}
