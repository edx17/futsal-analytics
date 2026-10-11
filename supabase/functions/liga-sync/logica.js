// supabase/functions/liga-sync/logica.js
//
// LO QUE HACE EL SCRAPER, SIN RED: pasar lo que devuelve segundopalo a una fila
// nuestra y decidir qué hay que guardar. JS puro (sin Deno ni npm) para que lo
// use la función de Supabase y también las pruebas de vitest.

const numero = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const texto = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

/** "19:30:00" → "19:30" */
export const horaCorta = (h) => {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

const fechaIso = (f) => (/^\d{4}-\d{2}-\d{2}/.test(String(f || '')) ? String(f).slice(0, 10) : null);
const jornadaNum = (j) => {
  const m = String(j ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
};

/* Primera: rpc partidos_por_competencia_y_año (los mismos campos que
   1ra-scraper.js). */
export function normalizarPrimera(p) {
  return {
    id_externo: numero(p?.id),
    jornada: jornadaNum(p?.jornada),
    fecha: fechaIso(p?.fecha),
    hora: horaCorta(p?.hora),
    local: texto(p?.equipos_local_nombre),
    visitante: texto(p?.equipos_visitante_nombre),
    goles_local: numero(p?.goles_local),
    goles_visitante: numero(p?.goles_visitante),
    estado: texto(p?.estados_partido_nombre),
    estadio: texto(p?.estadios_nombre),
    goleadores_local: texto(p?.goleadores_local),
    goleadores_visitante: texto(p?.goleadores_visitante),
  };
}

/* En inferiores el ID no es un número sino un texto armado con la edición, la
   categoría, el tipo de torneo y los ids de los dos equipos:
   "inf-127-3-1-28-144" (local 28, visitante 144). Dentro de una competencia el
   cruce local-visitante es único (cada uno es local una vez por rival), así
   que el número sale de esos dos ids. Si algún día viene numérico, se usa tal
   cual. */
export function idInferiores(id) {
  const n = numero(id);
  if (n !== null) return n;
  const m = String(id ?? '').match(/(\d+)-(\d+)$/);
  return m ? Number(m[1]) * 1000000 + Number(m[2]) : null;
}

/* Inferiores: rpc get_partidos_inferiores_por_edicion_categoria_tipo_inferiores
   (los campos de inf-scraper.js). No trae estadio ni goleadores. */
export function normalizarInferiores(p) {
  const local = numero(p?.equipo_local_id);
  const visitante = numero(p?.equipo_visitante_id);
  return {
    id_externo: idInferiores(p?.ID ?? p?.id)
      ?? (local !== null && visitante !== null ? local * 1000000 + visitante : null),
    jornada: jornadaNum(p?.jornada),
    fecha: fechaIso(p?.fecha),
    hora: horaCorta(p?.hora),
    local: texto(p?.equipolocal),
    visitante: texto(p?.equipovisitante),
    goles_local: numero(p?.goleslocal),
    goles_visitante: numero(p?.golesvisitante),
    estado: texto(p?.estado),
    estadio: null,
    goleadores_local: null,
    goleadores_visitante: null,
  };
}

/** La consulta a segundopalo para una competencia: { rpc, cuerpo, normalizar }. */
export function consultaDe(competencia) {
  const p = competencia?.fuente_params || {};
  if (competencia?.fuente === 'inferiores') {
    return {
      rpc: 'get_partidos_inferiores_por_edicion_categoria_tipo_inferiores',
      cuerpo: { p_edicion_id: p.edicion_id, p_categoria_id: p.categoria_id, p_tipo_torneo_inferiores_id: p.tipo ?? 1 },
      normalizar: normalizarInferiores,
    };
  }
  return {
    rpc: 'partidos_por_competencia_y_a%C3%B1o',
    cuerpo: { competencia_id_input: p.competencia_id, 'año_input': competencia?.anio },
    normalizar: normalizarPrimera,
  };
}

const esFinal = (estado) => /^finalizado$/i.test(String(estado || ''));
const CAMPOS = ['jornada', 'fecha', 'hora', 'local', 'visitante', 'goles_local', 'goles_visitante', 'estado', 'estadio', 'goleadores_local', 'goleadores_visitante'];

/**
 * Compara lo que vino de la fuente con lo que ya tenemos guardado.
 * Un partido se identifica por su id en segundopalo: actualizar mil veces no
 * duplica nada.
 *
 * Regla: lo finalizado no vuelve atrás. Si ya lo teníamos finalizado y la
 * fuente lo trae "Jugándose" o "Pendiente" (pasa mientras se juega), se deja
 * como estaba.
 *
 * @returns {{ guardar: Array, resumen: { nuevos, resultados, reprogramados, otros, sinCambios, descartados } }}
 */
export function planificar(existentes, recibidos) {
  const previos = new Map((existentes || []).map((e) => [Number(e.id_externo), e]));
  const guardar = [];
  const vistos = new Set();
  const resumen = { nuevos: 0, resultados: 0, reprogramados: 0, otros: 0, sinCambios: 0, descartados: 0 };

  (recibidos || []).forEach((r) => {
    if (!r || r.id_externo === null || !r.local || !r.visitante) { resumen.descartados += 1; return; }
    if (vistos.has(r.id_externo)) return;
    vistos.add(r.id_externo);

    const previo = previos.get(Number(r.id_externo));
    if (!previo) { guardar.push(r); resumen.nuevos += 1; return; }

    if (esFinal(previo.estado) && !esFinal(r.estado)) { resumen.sinCambios += 1; return; }

    const cambia = CAMPOS.some((k) => (previo[k] ?? null) !== (r[k] ?? null));
    if (!cambia) { resumen.sinCambios += 1; return; }

    guardar.push(r);
    if (esFinal(r.estado) && !esFinal(previo.estado)) resumen.resultados += 1;
    else if ((previo.fecha ?? null) !== r.fecha || (previo.hora ?? null) !== r.hora) resumen.reprogramados += 1;
    else resumen.otros += 1;
  });

  return { guardar, resumen };
}
