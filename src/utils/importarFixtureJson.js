// src/utils/importarFixtureJson.js
//
// SINCRONIZAR EL FIXTURE CON UN ARCHIVO DE LA LIGA
//
// Paralelo a parseFixturePegado: en vez del texto copiado de la web, entra el
// JSON que arma el scraper (una lista de partidos con jornada, fecha, hora,
// local, visitante, goles y estado). Los equipos se reconocen con el mismo
// matchearRivales y los mismos alias que el pegado.
//
// La diferencia es que esto ACTUALIZA: compara cada partido del archivo con el
// fixture que ya está en la app y arma un plan (nuevos, resultados que faltan,
// fechas que cambiaron, cosas para revisar). Correrlo una o mil veces deja la
// base igual: un partido se reconoce por jornada + local + visitante, así que
// nunca se inserta dos veces.
//
// Reglas, en orden de importancia:
//  - Lo que cargaron ustedes manda. Un partido finalizado en la app no vuelve a
//    pendiente aunque el archivo esté atrasado.
//  - Un partido con toma de datos (trackeado) nunca cambia de resultado: si el
//    oficial no coincide, queda en "para revisar".
//  - Si los dos dicen finalizado y el resultado no coincide, tampoco se pisa
//    solo: va a "para revisar" y se corrige sólo si lo pedís.
//  - Fecha y hora se actualizan (reprogramaciones, el día real de cada cruce),
//    salvo en tus partidos ya jugados.
//  - No se toca nada más: convocatoria, citación, video, eventos.

import { normalizarNombre, ID_MI_CLUB } from './parseFixturePegado';

const numero = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const numJornada = (j) => (String(j ?? '').match(/\d+/) || [''])[0];

/** "19:30:00" → "19:30" */
const horaCorta = (h) => {
  const m = String(h || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

/**
 * Lee el JSON del scraper.
 * @param {string} texto  El contenido del archivo.
 * @returns {{ cruces: Array, avisos: string[] }}
 */
export function parseFixtureJson(texto) {
  let datos;
  try {
    datos = JSON.parse(String(texto || '').replace(/^\uFEFF/, ''));
  } catch {
    return { cruces: [], avisos: ['El archivo no es un JSON válido.'] };
  }
  if (!Array.isArray(datos)) {
    return { cruces: [], avisos: ['El archivo tiene que ser una lista de partidos.'] };
  }

  const avisos = [];
  const cruces = [];
  datos.forEach((p, i) => {
    const local = String(p?.equipo_local || '').trim();
    const visitante = String(p?.equipo_visitante || '').trim();
    const n = numJornada(p?.jornada);
    if (!local || !visitante || !n) {
      avisos.push(`El partido ${i + 1} del archivo no tiene local, visitante o jornada: se saltea.`);
      return;
    }
    const estadoFuente = String(p?.estado || '').trim();
    const golesLocal = numero(p?.goles_local);
    const golesVisitante = numero(p?.goles_visitante);
    // Sólo cuenta como resultado lo finalizado y con los dos goles: "Jugándose"
    // trae el marcador a medias y no tiene que entrar como final.
    const finalizado = /^finalizado$/i.test(estadoFuente) && golesLocal !== null && golesVisitante !== null;
    cruces.push({
      idExterno: p?.id_externo ?? null,
      jornada: `Fecha ${n}`,
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.fecha || '')) ? p.fecha : null,
      hora: horaCorta(p?.hora),
      local,
      visitante,
      golesLocal,
      golesVisitante,
      estadoFuente,
      finalizado,
      estadio: p?.estadio || null,
      goleadoresLocal: p?.goleadores_local || null,
      goleadoresVisitante: p?.goleadores_visitante || null,
    });
  });
  if (!cruces.length && !avisos.length) avisos.push('El archivo no trae ningún partido.');
  return { cruces, avisos };
}

/* ── cómo se ve cada partido del fixture de la app ──────────────────────── */

const esAjeno = (p) => (p?.condicion || '') === 'Neutral' || !!p?.local_rival_id;

/** Local y visitante de una fila de `partidos`, con sus goles. */
function ladosDeFila(p) {
  if (esAjeno(p)) {
    return { local: normalizarNombre(p.nombre_propio), visitante: normalizarNombre(p.rival), gl: numero(p.goles_propios), gv: numero(p.goles_rival), propio: false };
  }
  if ((p.condicion || 'Local') === 'Visitante') {
    return { local: normalizarNombre(p.rival), visitante: ID_MI_CLUB, gl: numero(p.goles_rival), gv: numero(p.goles_propios), propio: true };
  }
  return { local: ID_MI_CLUB, visitante: normalizarNombre(p.rival), gl: numero(p.goles_propios), gv: numero(p.goles_rival), propio: true };
}

const clave = (jornada, local, visitante) => `${numJornada(jornada)}|${local}|${visitante}`;

/* Los goles del archivo, llevados a las columnas de la fila (que guarda los
   tuyos en goles_propios aunque juegues de visitante). */
function golesParaFila(fila, gl, gv) {
  if (!esAjeno(fila) && (fila.condicion || 'Local') === 'Visitante') return { goles_propios: gv, goles_rival: gl };
  return { goles_propios: gl, goles_rival: gv };
}

/**
 * Compara el archivo (ya pasado por matchearRivales) contra el fixture de la app.
 *
 * @param {Array}  partidos  Salida de matchearRivales: { local_id, visitante_id, jornada, _crudo, _sinResolver }
 * @param {Array}  fixture   Filas de `partidos` del torneo (con `esTrackeado`)
 * @param {Array}  rivales   Filas de `rivales`
 * @param {object} ctx       { clubId, torneo: { id, nombre, categoria }, miClub, miEscudo }
 * @returns {{ nuevos, actualizar, revisar, iguales, sinResolver, avisos }}
 */
export function planificarSincronizacion(partidos, fixture, rivales, ctx) {
  const porId = new Map((rivales || []).map((r) => [r.id, r]));
  const nombreDe = (id) => (id === ID_MI_CLUB ? ID_MI_CLUB : normalizarNombre(porId.get(id)?.nombre));
  const texto = (id, crudo) => (id === ID_MI_CLUB ? (ctx?.miClub || 'MI CLUB') : (porId.get(id)?.nombre || crudo));

  const indice = new Map();
  (fixture || []).forEach((f) => {
    const l = ladosDeFila(f);
    const k = clave(f.jornada, l.local, l.visitante);
    if (!indice.has(k)) indice.set(k, []);
    indice.get(k).push(f);
  });

  const nuevos = [];
  const actualizar = [];
  const revisar = [];
  const avisos = [];
  const sinResolver = new Set();
  const vistos = new Set();
  let iguales = 0;

  (partidos || []).forEach((p) => {
    const c = p._crudo || {};
    if (p._sinResolver?.length || !p.local_id || !p.visitante_id) {
      (p._sinResolver || []).forEach((n) => sinResolver.add(n));
      return;
    }
    if (p.local_id === p.visitante_id) {
      avisos.push(`${c.jornada}: "${c.local}" y "${c.visitante}" quedaron como el mismo equipo. Se saltea.`);
      return;
    }

    const k = clave(p.jornada || c.jornada, nombreDe(p.local_id), nombreDe(p.visitante_id));
    if (vistos.has(k)) { avisos.push(`El archivo repite ${c.jornada} ${c.local} vs ${c.visitante}: se toma una sola vez.`); return; }
    vistos.add(k);

    const desc = `${c.jornada} · ${texto(p.local_id, c.local)} vs ${texto(p.visitante_id, c.visitante)}`;
    const marcador = c.finalizado ? ` · ${c.golesLocal}-${c.golesVisitante}` : '';
    const filas = indice.get(k) || [];

    /* El mismo cruce con la localía al revés (la liga dice A-B y en la app está
       B-A en esa fecha): es el mismo partido, no uno nuevo. No se toca solo. */
    if (!filas.length) {
      const invertido = indice.get(clave(p.jornada || c.jornada, nombreDe(p.visitante_id), nombreDe(p.local_id))) || [];
      if (invertido.length) {
        const l = ladosDeFila(invertido[0]);
        revisar.push({
          id: invertido[0].id,
          desc,
          trackeado: !!invertido[0].esTrackeado,
          motivo: `En la app está con la localía al revés (${texto(p.visitante_id, c.visitante)} de local${l.gl !== null ? `, ${l.gl}-${l.gv}` : ''}). No se cambia.`,
          cambios: null,
        });
        return;
      }
    }

    if (filas.length > 1) {
      revisar.push({ id: null, desc, motivo: `Está ${filas.length} veces en la app: hay que borrar los repetidos a mano.`, cambios: null });
      return;
    }

    if (!filas.length) {
      nuevos.push({ fila: filaNueva(p, rivales, ctx), desc: desc + marcador });
      return;
    }

    const fila = filas[0];
    const lados = ladosDeFila(fila);
    /* Cada parte del cambio por separado, para poder elegir qué se trae
       (ver elegirCambios): el resultado, la fecha y el horario. */
    const partes = {};

    if (c.finalizado) {
      if (fila.estado !== 'Finalizado') {
        partes.resultado = { cambios: { estado: 'Finalizado', ...golesParaFila(fila, c.golesLocal, c.golesVisitante) }, que: `resultado ${c.golesLocal}-${c.golesVisitante}` };
      } else if (lados.gl !== c.golesLocal || lados.gv !== c.golesVisitante) {
        revisar.push({
          id: fila.id,
          desc,
          trackeado: !!fila.esTrackeado,
          motivo: fila.esTrackeado
            ? `Oficial ${c.golesLocal}-${c.golesVisitante}, en la app ${lados.gl}-${lados.gv}. Tiene toma de datos: no se cambia.`
            : `Oficial ${c.golesLocal}-${c.golesVisitante}, en la app ${lados.gl}-${lados.gv}.`,
          cambios: fila.esTrackeado ? null : golesParaFila(fila, c.golesLocal, c.golesVisitante),
        });
      }
    }

    // Fecha y hora: no en tus partidos ya jugados (esa fecha la cargaron ustedes).
    const tocaFecha = !(lados.propio && (fila.estado === 'Finalizado' || fila.esTrackeado));
    if (tocaFecha) {
      if (c.fecha && c.fecha !== (fila.fecha || null)) partes.fecha = { cambios: { fecha: c.fecha }, que: fila.fecha ? `fecha ${fila.fecha} → ${c.fecha}` : `fecha ${c.fecha}` };
      const horaApp = horaCorta(fila.horario);
      if (c.hora && c.hora !== horaApp) partes.hora = { cambios: { horario: c.hora }, que: horaApp ? `hora ${horaApp} → ${c.hora}` : `hora ${c.hora}` };
    }

    const lista = Object.values(partes);
    if (lista.length) {
      actualizar.push({
        id: fila.id,
        desc,
        partes,
        cambios: Object.assign({}, ...lista.map((x) => x.cambios)),
        que: lista.map((x) => x.que),
        resultado: !!partes.resultado,
      });
    } else iguales += 1;
  });

  return { nuevos, actualizar, revisar, iguales, sinResolver: [...sinResolver], avisos };
}

/* Un partido que no está en la app: la misma forma que arma handleGuardarFixture
   en Torneos para la carga múltiple. */
function filaNueva(p, rivales, ctx) {
  const c = p._crudo || {};
  const esMiLocal = p.local_id === ID_MI_CLUB;
  const esMiVisitante = p.visitante_id === ID_MI_CLUB;
  const porId = new Map((rivales || []).map((r) => [r.id, r]));
  const base = {
    club_id: ctx?.clubId,
    torneo_id: ctx?.torneo?.id,
    jornada: p.jornada || c.jornada,
    fecha: c.fecha || null,
    horario: c.hora || null,
    estado: c.finalizado ? 'Finalizado' : 'Pendiente',
    categoria: ctx?.torneo?.categoria,
    competicion: ctx?.torneo?.nombre,
  };
  const gl = c.finalizado ? c.golesLocal : 0;
  const gv = c.finalizado ? c.golesVisitante : 0;

  if (esMiLocal || esMiVisitante) {
    const r = porId.get(esMiLocal ? p.visitante_id : p.local_id);
    return {
      ...base,
      rival_id: r?.id || null, rival: r?.nombre || '', escudo_rival: r?.escudo || null,
      nombre_propio: ctx?.miClub, escudo_propio: ctx?.miEscudo || null,
      condicion: esMiLocal ? 'Local' : 'Visitante',
      goles_propios: esMiLocal ? gl : gv,
      goles_rival: esMiLocal ? gv : gl,
    };
  }
  const loc = porId.get(p.local_id);
  const vis = porId.get(p.visitante_id);
  return {
    ...base,
    rival_id: vis?.id || null, rival: vis?.nombre || '', escudo_rival: vis?.escudo || null,
    nombre_propio: loc?.nombre || '', local_rival_id: loc?.id || null, escudo_propio: loc?.escudo || null,
    condicion: 'Neutral',
    goles_propios: gl,
    goles_rival: gv,
  };
}

/** Para recordar los nombres resueltos a mano: { alias, alias_norm, rival_id } (tu club no va). */
export function aliasDeResueltos(resueltos, rivales) {
  const porId = new Map((rivales || []).map((r) => [r.id, r]));
  return Object.entries(resueltos || {})
    .filter(([nombre, id]) => id && id !== ID_MI_CLUB && porId.has(id) && normalizarNombre(nombre) !== normalizarNombre(porId.get(id).nombre))
    .map(([nombre, id]) => ({ rival_id: id, alias: nombre.trim(), alias_norm: normalizarNombre(nombre) }));
}

/**
 * Lo mismo que leer el archivo, pero con los partidos que ya bajó la app de
 * segundopalo (tabla liga_partidos, ver Otras competencias).
 * @param {Array} filas  Filas de liga_partidos.
 * @returns {{ cruces: Array, avisos: string[] }}
 */
export function crucesDeLiga(filas) {
  return parseFixtureJson(JSON.stringify((filas || []).map((p) => ({
    id_externo: p.id_externo,
    jornada: p.jornada,
    fecha: p.fecha,
    hora: p.hora,
    equipo_local: p.local,
    equipo_visitante: p.visitante,
    goles_local: p.goles_local,
    goles_visitante: p.goles_visitante,
    estado: p.estado,
    estadio: p.estadio,
    goleadores_local: p.goleadores_local,
    goleadores_visitante: p.goleadores_visitante,
  }))));
}

/* ── qué se aplica ──────────────────────────────────────────────────────── */

/** Los grupos que se pueden elegir en la sincronización, en orden. */
export const GRUPOS_SYNC = ['resultado', 'fecha', 'hora', 'nuevo', 'corregir'];

/**
 * Los ítems elegibles del plan, cada uno con su clave: un resultado, una
 * fecha o un horario de un partido que ya está; un partido nuevo; o un
 * resultado distinto para corregir (de "para revisar", sin toma de datos).
 *
 * @returns {Array<{ clave, grupo, desc, detalle }>}
 */
export function itemsElegibles(plan) {
  if (!plan) return [];
  const items = [];
  plan.actualizar.forEach((a) => {
    ['resultado', 'fecha', 'hora'].forEach((g) => {
      if (a.partes?.[g]) items.push({ clave: `${g}:${a.id}`, grupo: g, desc: a.desc, detalle: a.partes[g].que });
    });
  });
  plan.nuevos.forEach((n, i) => items.push({ clave: `nuevo:${i}`, grupo: 'nuevo', desc: n.desc, detalle: '' }));
  plan.revisar.forEach((r) => {
    if (r.id && r.cambios) items.push({ clave: `corregir:${r.id}`, grupo: 'corregir', desc: r.desc, detalle: r.motivo });
  });
  return items;
}

/**
 * Arma lo que se escribe en la base según lo elegido.
 *
 * @param {object} plan          Salida de planificarSincronizacion.
 * @param {Set<string>} elegidos Claves de itemsElegibles que se aplican.
 * @returns {{ updates: Array<{ id, cambios }>, inserts: Array<object> }}
 */
export function elegirCambios(plan, elegidos) {
  if (!plan) return { updates: [], inserts: [] };
  const si = (k) => elegidos?.has(k);
  const porId = new Map();
  const sumar = (id, cambios) => porId.set(id, { ...(porId.get(id) || {}), ...cambios });

  plan.actualizar.forEach((a) => {
    ['resultado', 'fecha', 'hora'].forEach((g) => {
      if (a.partes?.[g] && si(`${g}:${a.id}`)) sumar(a.id, a.partes[g].cambios);
    });
  });
  plan.revisar.forEach((r) => {
    if (r.id && r.cambios && si(`corregir:${r.id}`)) sumar(r.id, r.cambios);
  });

  return {
    updates: [...porId.entries()].map(([id, cambios]) => ({ id, cambios })),
    inserts: plan.nuevos.filter((_, i) => si(`nuevo:${i}`)).map((n) => n.fila),
  };
}
