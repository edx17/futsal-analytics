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

/* PLAYOFFS. Vienen en la misma consulta que el torneo regular, con la fase en
   `fase_copas` ("Cuartos de final", "Semifinal", "Final"…), el número de
   cruce en `llave_playoff` y si es "Ida" / "Vuelta" en `partido_playoff`. La
   jornada viene en 1, así que sin la fase se mezclarían con la fecha 1. */
const fasePlayoff = (p) => texto(p?.fase_copas ?? p?.faseCopas);
const idaVuelta = (v) => {
  const t = texto(v);
  if (!t || /^(true|false|0|1)$/i.test(t)) return null;
  return t;
};

/* ETAPAS. Lo que no es el torneo regular (playoffs, desempates, triangulares,
   Copa Futuro…) va con su etapa, tal como la nombra segundopalo. Así una
   etapa nueva aparece sola, sin tocar la app:
   - Primera: cada partido trae su tipo de fase (ediciones_partidos_fases_id)
     con el nombre para la web y si esa fase se muestra con tabla de
     posiciones (un triangular de desempate) o como cruces.
   - Inferiores: cada torneo es un "tipo" (1 regular, 4 Copa Futuro, 5
     playoff, 8 Copa Futuro de Oro, 9 de Plata…); se consultan todos. */
const FASES_REGULARES = new Set([1, 17]); // Torneo Regular, Torneo Regular por Zona
const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);

const NOMBRES_TIPO = {
  regular: null,
  playoff: 'Playoff',
  copafuturo: 'Copa Futuro',
  copafuturooro: 'Copa Futuro de Oro',
  copafuturoplata: 'Copa Futuro de Plata',
  apertura: 'Apertura',
  clausura: 'Clausura',
  'fase final apertura': 'Fase final Apertura',
  'fase final clausura': 'Fase final Clausura',
};

/** El nombre de la etapa de un tipo de torneo de inferiores ("copafuturooro" → "Copa Futuro de Oro"). */
export function etapaInferiores(nombre, tipo) {
  if (tipo === 1) return null;
  const t = String(nombre || '').trim().toLowerCase();
  if (t in NOMBRES_TIPO) return NOMBRES_TIPO[t];
  if (!t) return tipo ? `Torneo ${tipo}` : null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* Primera: rpc partidos_por_competencia_y_año (los mismos campos que
   1ra-scraper.js). */
export function normalizarPrimera(p) {
  const faseId = numero(p?.ediciones_partidos_fases_id);
  const regular = faseId === null || FASES_REGULARES.has(faseId);
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
    zona: texto(p?.zona),
    fase: fasePlayoff(p),
    llave: numero(p?.llave_playoff ?? p?.llavePlayOff),
    partido_playoff: idaVuelta(p?.partido_playoff),
    penales_local: numero(p?.penales_local),
    penales_visitante: numero(p?.penales_visitante),
    etapa: regular ? null : (texto(p?.fase_nombre_fases_web) || texto(p?.fase_nombre) || 'Playoff'),
    etapa_tabla: regular ? null : bool(p?.fase_mostrar_tabla_posiciones),
    grupo: texto(p?.grupo_copas),
    torneo_tipo: faseId,
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

/* Un cruce de playoff entre los mismos dos equipos que ya se enfrentaron en el
   regular tendría el mismo número: se le suma un bloque por fase (los ids del
   regular no pasan de 10^12). */
const FASES_ORDEN = ['octavos', 'cuartos', 'semi', 'tercer', 'final'];
export function bloqueDeFase(fase) {
  if (!fase) return 0;
  const t = String(fase).toLowerCase();
  const i = FASES_ORDEN.findIndex((f) => t.includes(f));
  return (i >= 0 ? i + 1 : FASES_ORDEN.length + 1) * 1e12;
}

/* Inferiores: rpc get_partidos_inferiores_por_edicion_categoria_tipo_inferiores
   (los campos de inf-scraper.js). No trae estadio ni goleadores. */
/* Cada tipo de torneo va en su propio bloque de ids (el regular, el 1,
   conserva los de siempre): la Copa Futuro puede repetir un cruce del
   regular o del playoff. */
export const bloqueDeTipo = (tipo) => (tipo && tipo > 1 ? (tipo - 1) * 1e14 : 0);

export function normalizarInferiores(p, tipoPedido = null) {
  const local = numero(p?.equipo_local_id);
  const visitante = numero(p?.equipo_visitante_id);
  const fase = fasePlayoff(p);
  const tipo = numero(p?.tipo_torneo_inferiores_id) ?? tipoPedido ?? 1;
  const base = idInferiores(p?.ID ?? p?.id)
    ?? (local !== null && visitante !== null ? local * 1000000 + visitante : null);
  const etapa = etapaInferiores(p?.tipo_torneo_nombre, tipo);
  return {
    id_externo: base === null ? null : base + bloqueDeFase(fase) + bloqueDeTipo(tipo),
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
    zona: texto(p?.zona),
    fase,
    llave: numero(p?.llave_playoff),
    partido_playoff: idaVuelta(p?.partido_playoff ?? p?.tipo_partido),
    penales_local: numero(p?.penaleslocal ?? p?.penales_local),
    penales_visitante: numero(p?.penalesvisitante ?? p?.penales_visitante),
    // Un playoff de inferiores sin la etapa en los datos igual es playoff.
    etapa: etapa ?? (fase ? 'Playoff' : null),
    etapa_tabla: null,
    grupo: null,
    torneo_tipo: tipo,
  };
}

/** Los tipos de torneo de inferiores que se consultan si segundopalo no da la lista. */
export const TIPOS_INFERIORES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** La consulta a segundopalo para una competencia: { rpc, cuerpo, normalizar }. `tipo`: el torneo de inferiores. */
export function consultaDe(competencia, tipo = null) {
  const p = competencia?.fuente_params || {};
  if (competencia?.fuente === 'inferiores') {
    const t = tipo ?? p.tipo ?? 1;
    return {
      rpc: 'get_partidos_inferiores_por_edicion_categoria_tipo_inferiores',
      cuerpo: { p_edicion_id: p.edicion_id, p_categoria_id: p.categoria_id, p_tipo_torneo_inferiores_id: t },
      normalizar: (x) => normalizarInferiores(x, t),
      tipo: t,
    };
  }
  return {
    rpc: 'partidos_por_competencia_y_a%C3%B1o',
    cuerpo: { competencia_id_input: p.competencia_id, 'año_input': competencia?.anio },
    normalizar: normalizarPrimera,
  };
}

/**
 * Todas las consultas de una competencia: en inferiores, una por tipo de
 * torneo (regular, playoff, Copa Futuro…), así lo que se agregue en
 * segundopalo aparece solo. `fuente_params.tipos` fija la lista si hace falta.
 */
export function consultasDe(competencia, tipos = TIPOS_INFERIORES) {
  if (competencia?.fuente !== 'inferiores') return [consultaDe(competencia)];
  const fijos = competencia?.fuente_params?.tipos;
  const lista = Array.isArray(fijos) && fijos.length ? fijos : tipos;
  return [...new Set(lista.map(Number).filter((n) => Number.isInteger(n) && n > 0))].map((t) => consultaDe(competencia, t));
}

const esFinal = (estado) => /^finalizado$/i.test(String(estado || ''));
const CAMPOS = ['jornada', 'fecha', 'hora', 'local', 'visitante', 'goles_local', 'goles_visitante', 'estado', 'estadio', 'goleadores_local', 'goleadores_visitante', 'zona',
  'fase', 'llave', 'partido_playoff', 'penales_local', 'penales_visitante', 'etapa', 'etapa_tabla', 'grupo', 'torneo_tipo'];

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
