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

/** Los partidos de un equipo, del más viejo al más nuevo (los playoffs, después del regular). */
export function partidosDeEquipo(partidos, equipo) {
  return (partidos || [])
    .filter((p) => p.local === equipo || p.visitante === equipo)
    .sort((a, b) => ordenFase(a.fase) - ordenFase(b.fase) || (a.jornada ?? 0) - (b.jornada ?? 0)
      || String(a.fecha || '').localeCompare(String(b.fecha || '')));
}

/* ── PLAYOFFS ──────────────────────────────────────────────────────────────
   segundopalo marca los partidos de playoff con la fase ("Cuartos de final",
   "Semifinal", "Final"…), el número de cruce (llave) y si es ida o vuelta.
   El torneo regular (tabla, fixture por fecha, reportes) es lo que no tiene
   fase. */

export const esPlayoff = (p) => !!p?.fase;
export const soloRegular = (partidos) => (partidos || []).filter((p) => !esPlayoff(p));
export const soloPlayoff = (partidos) => (partidos || []).filter(esPlayoff);

const FASES = [['32', 1], ['16', 2], ['octavo', 3], ['cuarto', 4], ['semi', 5], ['tercer', 6], ['final', 7]];

/** El orden de una fase (el regular primero; la final al final). */
export function ordenFase(fase) {
  if (!fase) return 0;
  const t = sinTildes(fase).toLowerCase();
  const hit = FASES.find(([k]) => t.includes(k));
  return hit ? hit[1] : 6.5;
}

const ORDEN_PARTIDO = (p) => (/ida/i.test(p.partido_playoff || '') ? 0 : /vuelta/i.test(p.partido_playoff || '') ? 1 : 2);

/**
 * Los playoffs como cuadro: las fases en orden y, en cada una, sus cruces
 * con los partidos (ida y vuelta), el global y quién pasa.
 *   pasa: el equipo, o null si falta jugar o el global quedó igualado sin
 *   penales (en AFA puede definir la ventaja deportiva).
 * @returns {Array<{ fase, cruces: Array<{ llave, equipos: [string, string], partidos, global: [number, number]|null, penales, pasa, jugados }> }>}
 */
export function cuadroPlayoff(partidos) {
  const porFase = new Map();
  soloPlayoff(partidos).forEach((p) => {
    if (!porFase.has(p.fase)) porFase.set(p.fase, []);
    porFase.get(p.fase).push(p);
  });
  return [...porFase.entries()]
    .sort((a, b) => ordenFase(a[0]) - ordenFase(b[0])
      || String(a[1][0]?.fecha || '').localeCompare(String(b[1][0]?.fecha || '')))
    .map(([fase, lista]) => {
      const porCruce = new Map();
      lista.forEach((p) => {
        const k = p.llave ?? [clave(p.local), clave(p.visitante)].sort().join('|');
        if (!porCruce.has(k)) porCruce.set(k, []);
        porCruce.get(k).push(p);
      });
      const cruces = [...porCruce.entries()].map(([k, ps]) => {
        const orden = [...ps].sort((a, b) => ORDEN_PARTIDO(a) - ORDEN_PARTIDO(b) || String(a.fecha || '').localeCompare(String(b.fecha || '')));
        const equipos = [orden[0].local, orden[0].visitante];
        const jugadosC = orden.filter(jugado);
        const golesDe = (eq) => jugadosC.reduce((s, p) => s + (p.local === eq ? p.goles_local : p.visitante === eq ? p.goles_visitante : 0), 0);
        const global = jugadosC.length ? [golesDe(equipos[0]), golesDe(equipos[1])] : null;
        const ultimo = orden.at(-1);
        const conPenales = ultimo && ultimo.penales_local !== null && ultimo.penales_local !== undefined
          && ultimo.penales_visitante !== null && ultimo.penales_visitante !== undefined;
        const penales = conPenales
          ? [ultimo.local === equipos[0] ? ultimo.penales_local : ultimo.penales_visitante,
            ultimo.local === equipos[0] ? ultimo.penales_visitante : ultimo.penales_local]
          : null;
        let pasa = null;
        if (global && jugadosC.length === orden.length) {
          if (global[0] !== global[1]) pasa = global[0] > global[1] ? equipos[0] : equipos[1];
          else if (penales && penales[0] !== penales[1]) pasa = penales[0] > penales[1] ? equipos[0] : equipos[1];
        }
        return { llave: typeof k === 'number' ? k : null, equipos, partidos: orden, global, penales, pasa, jugados: jugadosC.length };
      }).sort((a, b) => (a.llave ?? 99) - (b.llave ?? 99) || a.equipos[0].localeCompare(b.equipos[0]));
      return { fase, cruces };
    });
}

/** Cómo se llama un partido de playoff: "Cuartos de final · Ida". */
export const etiquetaPlayoff = (p) => [p?.fase, p?.partido_playoff].filter(Boolean).join(' · ');

/** Para listas angostas: "F7" en el regular; "4tos I", "Semi V", "Final" en los playoffs. */
export function etiquetaCorta(p) {
  if (!esPlayoff(p)) return `F${p?.jornada ?? '?'}`;
  const o = ordenFase(p.fase);
  const fase = { 3: '8vos', 4: '4tos', 5: 'Semi', 6: '3º', 7: 'Final' }[o] || 'PO';
  const iv = /ida/i.test(p.partido_playoff || '') ? ' I' : /vuelta/i.test(p.partido_playoff || '') ? ' V' : '';
  return fase + iv;
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

/** 'z1' / 'Z1' / 'zona 1' / '1' → 'Zona 1'. Otro texto queda tal cual. */
export function nombreZona(z) {
  const t = String(z ?? '').trim();
  const m = t.match(/^(?:z|zona)?\s*(\d+)$/i);
  return m ? `Zona ${m[1]}` : t;
}

/* Grupos de equipos que juegan entre sí (componentes del grafo de cruces). */
function gruposDeCruces(partidos) {
  const padre = new Map();
  const raiz = (x) => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const unir = (a, b) => {
    [a, b].forEach((x) => { if (!padre.has(x)) padre.set(x, x); });
    const ra = raiz(a); const rb = raiz(b);
    if (ra !== rb) padre.set(ra, rb);
  };
  (partidos || []).forEach((p) => { if (p.local && p.visitante) unir(p.local, p.visitante); });
  const grupos = new Map();
  [...padre.keys()].forEach((eq) => {
    const r = raiz(eq);
    if (!grupos.has(r)) grupos.set(r, new Set());
    grupos.get(r).add(eq);
  });
  return [...grupos.values()];
}

/**
 * Separa una competencia en zonas. Devuelve [] si se juega en una sola.
 *
 * Primero usa la zona que trae cada partido. Si no viene (inferiores), arma los
 * grupos de equipos que juegan entre sí y les pone el nombre según
 * `zonaPorEquipo` (la zona de cada club en la Primera de la misma división); si
 * tampoco se sabe, quedan "Zona 1", "Zona 2"… por orden alfabético.
 *
 * @returns {Array<{ zona: string, equipos: Set<string>, partidos: Array }>}
 */
export function zonasDe(partidos, zonaPorEquipo = {}) {
  const lista = partidos || [];
  const conZona = lista.filter((p) => p.zona);
  let zonas;
  if (conZona.length === lista.length && lista.length) {
    const m = new Map();
    lista.forEach((p) => {
      const z = nombreZona(p.zona);
      if (!m.has(z)) m.set(z, { zona: z, equipos: new Set(), partidos: [] });
      const g = m.get(z);
      g.partidos.push(p); g.equipos.add(p.local); g.equipos.add(p.visitante);
    });
    zonas = [...m.values()];
  } else {
    const grupos = gruposDeCruces(lista);
    if (grupos.length < 2) return [];
    const usados = new Set();
    zonas = grupos
      .sort((a, b) => [...a].sort()[0].localeCompare([...b].sort()[0]))
      .map((equipos, i) => {
        const votos = {};
        equipos.forEach((e) => { const z = zonaPorEquipo[e]; if (z) votos[z] = (votos[z] || 0) + 1; });
        const [ganadora] = Object.entries(votos).sort((a, b) => b[1] - a[1])[0] || [];
        let zona = ganadora ? nombreZona(ganadora) : `Zona ${i + 1}`;
        if (usados.has(zona)) zona = `Zona ${i + 1}`;
        usados.add(zona);
        return { zona, equipos, partidos: lista.filter((p) => equipos.has(p.local)) };
      });
  }
  if (zonas.length < 2) return [];
  return zonas.sort((a, b) => a.zona.localeCompare(b.zona, 'es', { numeric: true }));
}
