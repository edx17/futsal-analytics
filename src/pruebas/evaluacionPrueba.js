import { bloquesParaCierre, bloquePorId, TRANSVERSALES } from './rubrica';

/* PRUEBAS · EL MOTOR DEL CIERRE (al estilo de analytics/rating.js)
 *
 * No tiene números fijos: todo sale de `config` (ver configDefault.js).
 *
 *   1. Cada evaluador: promedio por criterio (si lo puntuó en más de una sesión).
 *   2. Por criterio: promedio entre evaluadores. Por bloque: promedio de sus criterios.
 *   3. Divergencia: en un bloque, dos evaluadores que difieren
 *      `umbrales.divergencia_min` puntos o más → marcado para revisión.
 *   4. Puntaje final 1-5: promedio ponderado por puesto de los bloques y los
 *      transversales (`ponderaciones[puesto][bloque]`). Peso 0 = no cuenta.
 *   5. Semáforo: >= incorporar → incorporar; >= seguir_observando → observar;
 *      si no, no_incorporar. Si el bloque clave del puesto queda en
 *      <= bloque_clave_max, como mucho "observar".
 *   6. Fortalezas y aspectos a mejorar: los 2 bloques (no transversales) más
 *      altos y los 2 más bajos.
 * Mínimo de evaluadores para cerrar: `umbrales.evaluadores_min` (configurable; 1 = alcanza con el DT).
 * Con un solo evaluador no hay divergencias que marcar.
 */

export const RECOMENDACIONES = {
  incorporar: { id: 'incorporar', texto: 'Incorporar', color: '#00e676' },
  observar: { id: 'observar', texto: 'Seguir observando', color: '#fbbf24' },
  no_incorporar: { id: 'no_incorporar', texto: 'No incorporar', color: '#ef4444' },
};

/** El valor de siempre (si la configuración no lo trae). */
export const MINIMO_EVALUADORES = 2;
export const minimoEvaluadores = (config) => {
  const n = Number(config?.umbrales?.evaluadores_min);
  return Number.isInteger(n) && n >= 1 ? n : MINIMO_EVALUADORES;
};
const r2 = (n) => Math.round(n * 100) / 100;
const prom = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** El semáforo para un puntaje, con la regla del bloque clave. */
export function semaforo(puntaje, { umbrales }, bloqueClave = null) {
  if (puntaje == null) return null;
  let rec = puntaje >= umbrales.incorporar ? 'incorporar' : puntaje >= umbrales.seguir_observando ? 'observar' : 'no_incorporar';
  const limitado = rec === 'incorporar' && bloqueClave?.puntaje != null && bloqueClave.puntaje <= umbrales.bloque_clave_max;
  if (limitado) rec = 'observar';
  return { recomendacion: rec, limitadoPorBloqueClave: limitado };
}

/**
 * Evalúa a un candidato.
 * `evaluaciones`: filas de pruebas_evaluaciones del candidato ({ evaluador_id, bloque, criterio, puntaje, dato_objetivo }).
 * `puesto`: 'Cierre' | 'Ala' | 'Pivot'. `etapa`: 1 (sin juego real) o 2 (todo).
 */
export function evaluarCandidato({ evaluaciones = [], puesto, config, etapa = 1 }) {
  const validos = new Set(bloquesParaCierre(etapa).map((b) => b.id));
  const filas = evaluaciones.filter((e) => validos.has(e.bloque) && Number(e.puntaje) >= 1 && Number(e.puntaje) <= 5);

  // 1. evaluador → bloque → criterio → [puntajes]
  const porEval = new Map();
  filas.forEach((e) => {
    const k = `${e.evaluador_id}|${e.bloque}|${e.criterio}`;
    if (!porEval.has(k)) porEval.set(k, []);
    porEval.get(k).push(Number(e.puntaje));
  });
  const deEvaluador = new Map(); // `${ev}|${bloque}` → [promedios de criterio]
  const deCriterio = new Map();  // `${bloque}|${criterio}` → [promedios de cada evaluador]
  porEval.forEach((xs, k) => {
    const [ev, bloque, criterio] = k.split('|');
    const p = prom(xs);
    const kb = `${ev}|${bloque}`;
    if (!deEvaluador.has(kb)) deEvaluador.set(kb, []);
    deEvaluador.get(kb).push(p);
    const kc = `${bloque}|${criterio}`;
    if (!deCriterio.has(kc)) deCriterio.set(kc, []);
    deCriterio.get(kc).push(p);
  });

  const evaluadores = [...new Set(filas.map((e) => e.evaluador_id))];
  const pesos = config.ponderaciones?.[puesto] || {};

  // 2 y 3. por bloque
  const bloques = bloquesParaCierre(etapa).map((b) => {
    const criterios = b.criterios.map((c) => {
      const xs = deCriterio.get(`${b.id}|${c.id}`) || [];
      return { id: c.id, nombre: c.nombre, puntaje: xs.length ? r2(prom(xs)) : null, evaluadores: xs.length };
    });
    const con = criterios.filter((c) => c.puntaje != null);
    const promPorEvaluador = evaluadores
      .map((ev) => ({ ev, p: prom(deEvaluador.get(`${ev}|${b.id}`) || []) }))
      .filter((x) => x.p != null);
    const ps = promPorEvaluador.map((x) => x.p);
    const diferencia = ps.length >= 2 ? Math.max(...ps) - Math.min(...ps) : 0;
    return {
      id: b.id, nombre: b.nombre, transversal: !!b.transversal,
      puntaje: con.length ? r2(prom(con.map((c) => c.puntaje))) : null,
      peso: Number(pesos[b.id] ?? 0),
      criterios,
      evaluadores: promPorEvaluador.length,
      diferencia: r2(diferencia),
      divergencia: ps.length >= 2 && diferencia >= config.umbrales.divergencia_min,
    };
  });

  // 4. puntaje final ponderado
  const cuentan = bloques.filter((b) => b.puntaje != null && b.peso > 0);
  const sumaPesos = cuentan.reduce((s, b) => s + b.peso, 0);
  const puntaje = sumaPesos > 0 ? r2(cuentan.reduce((s, b) => s + b.puntaje * b.peso, 0) / sumaPesos) : null;

  // 5. semáforo con el bloque clave
  const clave = bloques.find((b) => b.id === config.bloques_clave?.[puesto]) || null;
  const sem = semaforo(puntaje, config, clave);

  // 6. fortalezas y a mejorar (bloques no transversales con puntaje)
  const ordenados = bloques.filter((b) => !b.transversal && b.puntaje != null)
    .sort((a, b) => (b.puntaje - a.puntaje) || a.nombre.localeCompare(b.nombre));
  const fortalezas = ordenados.slice(0, 2).map((b) => ({ id: b.id, nombre: b.nombre, puntaje: b.puntaje }));
  const aMejorar = ordenados.length > 2 ? ordenados.slice(-2).reverse().map((b) => ({ id: b.id, nombre: b.nombre, puntaje: b.puntaje })) : [];

  // El dato objetivo de eficacia (goles / intentos) sumado entre evaluadores y sesiones (el mejor registro de cada uno).
  const efic = new Map();
  filas.filter((e) => e.dato_objetivo && (e.dato_objetivo.intentos != null)).forEach((e) => {
    const prev = efic.get(e.evaluador_id);
    const it = Number(e.dato_objetivo.intentos) || 0;
    if (!prev || it > prev.intentos) efic.set(e.evaluador_id, { intentos: it, goles: Number(e.dato_objetivo.goles) || 0 });
  });
  const eficacia = efic.size ? [...efic.values()].reduce((m, x) => (x.intentos > m.intentos ? x : m)) : null;

  return {
    puesto, etapa,
    evaluadores: evaluadores.length,
    minimoEvaluadores: minimoEvaluadores(config),
    suficiente: evaluadores.length >= minimoEvaluadores(config),
    bloques,
    transversales: bloques.filter((b) => b.transversal),
    divergencias: bloques.filter((b) => b.divergencia).map((b) => ({ id: b.id, nombre: b.nombre, diferencia: b.diferencia })),
    puntaje,
    recomendacion: sem?.recomendacion ?? null,
    limitadoPorBloqueClave: !!sem?.limitadoPorBloqueClave,
    bloqueClave: clave ? { id: clave.id, nombre: clave.nombre, puntaje: clave.puntaje } : null,
    fortalezas, aMejorar,
    eficacia: eficacia ? { ...eficacia, pct: eficacia.intentos ? Math.round((eficacia.goles / eficacia.intentos) * 100) : null } : null,
  };
}

/**
 * Simulación del configurador: cada candidato evaluado con la config actual y con la nueva.
 * `items`: [{ candidato, evaluaciones, etapa }]. Los que tienen un cierre decidido se marcan
 * `congelado` (su decisión no cambia aunque se guarde la nueva config).
 */
export function simular(items = [], configActual, configNueva) {
  return items.map(({ candidato, evaluaciones, etapa = 1, congelado = false }) => {
    const puesto = candidato.puesto_principal;
    const a = evaluarCandidato({ evaluaciones, puesto, config: configActual, etapa });
    const b = evaluarCandidato({ evaluaciones, puesto, config: configNueva, etapa });
    return {
      candidato, etapa, congelado,
      actual: { puntaje: a.puntaje, recomendacion: a.recomendacion },
      nueva: { puntaje: b.puntaje, recomendacion: b.recomendacion },
      cambia: a.recomendacion !== b.recomendacion,
    };
  }).filter((x) => x.actual.puntaje != null || x.nueva.puntaje != null);
}

/** Los ejes del radar: los bloques con su puntaje (sin los transversales, que van aparte). */
export const ejesRadar = (resultado) => (resultado?.bloques || [])
  .filter((b) => !b.transversal)
  .map((b) => ({ id: b.id, nombre: bloquePorId[b.id]?.corto || bloquePorId[b.id]?.nombre || b.nombre, valor: b.puntaje }));

export const NOMBRES_TRANSVERSALES = Object.fromEntries(TRANSVERSALES.map((t) => [t.id, t.nombre]));
