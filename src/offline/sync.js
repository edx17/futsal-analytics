/* ═══════════════════════════════════════════════════════════════════════════
   SINCRONIZACIÓN CON SUPABASE

   Regla de oro: la captura offline nunca depende de la red. Se baja el
   partido una vez (con todo lo que el tracker en vivo ya cargó), se trabaja
   sin conexión el tiempo que haga falta, y se sube cuando hay señal.

   La idempotencia sale del `local_id`: cada fila que nace en el dispositivo
   trae el suyo y sube por UPSERT contra ese índice único. Sincronizar dos
   veces no duplica; sincronizar a medias y reintentar tampoco.

   Si todavía no corriste la migración 20260824120000_captura_offline.sql, el
   sincronizador se da cuenta solo: descarta las columnas y las tablas que la
   base no conoce, sube lo que sí entra y te avisa qué quedó afuera. Nada se
   borra del dispositivo hasta que el servidor lo confirma.
   ═══════════════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase';
import * as db from './db';
import { normalizarQuinteto, tMsDeEvento } from './modelo';

/* Campos que existen sólo en el dispositivo y nunca viajan. */
const limpiarLocales = (fila) => {
  const salida = {};
  Object.entries(fila).forEach(([k, v]) => { if (!k.startsWith('_')) salida[k] = v; });
  return salida;
};

/* PostgREST avisa de una columna que no existe con el nombre adentro del
   mensaje. Lo sacamos para poder reintentar sin ella. */
function columnaFaltante(error) {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  const m =
    msg.match(/'([a-z0-9_]+)' column/i) ||
    msg.match(/column "?([a-z0-9_]+)"? of relation/i) ||
    msg.match(/Could not find the '([a-z0-9_]+)' column/i) ||
    msg.match(/column ([a-z0-9_]+) does not exist/i);
  return m ? (m[1] || m[2]) : null;
}

const tablaFaltante = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`;
  return error?.code === '42P01' || error?.code === 'PGRST205' || /Could not find the table/i.test(msg);
};

/* Sube un lote quitando, de a una, las columnas que la base no conoce. Así el
   que no corrió la migración igual sincroniza lo que su esquema soporta. */
async function subirLote(tabla, filas, { onConflict, devolver = false }) {
  if (filas.length === 0) return { data: [], omitidas: [], tablaAusente: false };

  let payload = filas.map(limpiarLocales);
  let clave = onConflict;
  const omitidas = [];

  for (let intento = 0; intento < 12; intento++) {
    /* Sin columna de conflicto no hay upsert posible: insertamos derecho. Se
       pierde la idempotencia, pero es el caso del que no corrió la migración
       y ahí lo que importa es que el dato entre. */
    let q = clave
      ? supabase.from(tabla).upsert(payload, { onConflict: clave, ignoreDuplicates: false })
      : supabase.from(tabla).insert(payload);
    if (devolver) q = q.select();
    const { data, error } = await q;

    if (!error) return { data: data || [], omitidas, tablaAusente: false };
    if (tablaFaltante(error)) return { data: [], omitidas, tablaAusente: true };

    const col = columnaFaltante(error);
    if (!col) throw error;

    omitidas.push(col);
    if (col === clave) clave = null;
    payload = payload.map(f => { const c = { ...f }; delete c[col]; return c; });
  }
  throw new Error(`No se pudo subir a ${tabla}: demasiadas columnas desconocidas`);
}

/* ── BAJADA ──────────────────────────────────────────────────────────────── */

/* Deja el partido entero utilizable sin red: ficha, plantel y todos los
   eventos que ya cargó el tracker en vivo, más lo que se haya analizado
   offline desde otro dispositivo. */
export async function descargarPartido(partido, clubId) {
  const idPartido = partido.id;

  let plantilla = partido.plantilla;
  if (typeof plantilla === 'string') {
    try { plantilla = JSON.parse(plantilla); } catch { plantilla = []; }
  }
  const ids = (plantilla || []).map(p => p.id_jugador).filter(Boolean);

  const [{ data: jugadores }, { data: eventos }] = await Promise.all([
    ids.length
      ? supabase.from('jugadores').select('*').in('id', ids)
      : Promise.resolve({ data: [] }),
    supabase.from('eventos').select('*').eq('id_partido', idPartido),
  ]);

  /* Las tablas nuevas pueden no existir todavía: si fallan, seguimos. */
  const opcional = async (tabla) => {
    try {
      const { data, error } = await supabase.from(tabla).select('*').eq('id_partido', idPartido);
      return error ? [] : (data || []);
    } catch { return []; }
  };
  const [snapshots, recorridos, stints, secuencias] = await Promise.all([
    opcional('snapshots_posicionales'),
    opcional('recorridos_jugador'),
    opcional('stints_cancha'),
    opcional('secuencias_pase'),
  ]);

  const titulares = (plantilla || []).filter(p => p.titular).map(p => String(p.id_jugador));

  await db.guardar('partidos', {
    id: idPartido,
    partido,
    plantilla: plantilla || [],
    jugadores: jugadores || [],
    titulares,
    club_id: clubId,
    descargado_en: new Date().toISOString(),
  });

  /* Lo que baja del servidor entra como 'sincronizado': ya está allá arriba.
     Lo local que todavía no subió no se pisa. */
  const marcar = (filas) => filas.map(f => ({ ...f, _estado: 'sincronizado' }));

  const eventosRemotos = (eventos || []).map(ev => ({
    ...ev,
    local_id: ev.local_id || `remoto_${ev.id}`,
    t_ms: tMsDeEvento(ev),
    quinteto_activo: normalizarQuinteto(ev.quinteto_activo),
    _estado: 'sincronizado',
    _remoto: true,
  }));

  const localesPrevios = await db.leerPorPartido('eventos', idPartido);
  const pendientes = new Set(
    localesPrevios.filter(e => e._estado !== 'sincronizado').map(e => e.local_id)
  );

  await db.guardarVarios('eventos', eventosRemotos.filter(e => !pendientes.has(e.local_id)));
  await db.guardarVarios('snapshots', marcar(snapshots));
  await db.guardarVarios('recorridos', marcar(recorridos));
  await db.guardarVarios('stints', marcar(stints));
  await db.guardarVarios('secuencias', marcar(secuencias));

  return {
    eventos: eventosRemotos.length,
    jugadores: (jugadores || []).length,
    snapshots: snapshots.length,
  };
}

export async function listarPartidosDescargados() {
  const filas = await db.leerTodo('partidos');
  return filas.sort((a, b) => (b.descargado_en || '').localeCompare(a.descargado_en || ''));
}

/* ── SUBIDA ──────────────────────────────────────────────────────────────── */

export async function contarPendientes(idPartido) {
  const [eventos, snapshots, recorridos, stints, secuencias] = await Promise.all([
    db.leerPorPartido('eventos', idPartido),
    db.leerPorPartido('snapshots', idPartido),
    db.leerPorPartido('recorridos', idPartido),
    db.leerPorPartido('stints', idPartido),
    db.leerPorPartido('secuencias', idPartido),
  ]);
  const pend = (arr) => arr.filter(f => f._estado !== 'sincronizado').length;
  return {
    eventos: pend(eventos),
    snapshots: pend(snapshots),
    recorridos: pend(recorridos),
    stints: pend(stints),
    secuencias: pend(secuencias),
    total: pend(eventos) + pend(snapshots) + pend(recorridos) + pend(stints) + pend(secuencias),
  };
}

/* Sube todo lo pendiente de un partido, en el orden en que las cosas se
   referencian entre sí: primero la secuencia, después los eventos (que la
   apuntan), y al final lo que necesita el id real de un evento. */
export async function sincronizarPartido(idPartido) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin conexión');
  }

  const local = await db.cargarPartidoCompleto(idPartido);
  const pendiente = (arr) => arr.filter(f => f._estado !== 'sincronizado');

  const reporte = { eventos: 0, snapshots: 0, recorridos: 0, stints: 0, secuencias: 0, omitidas: new Set(), sinTabla: [] };
  const anotar = (r) => {
    r.omitidas.forEach(c => reporte.omitidas.add(c));
    return r;
  };

  // 1) Secuencias: el gol y los pases las apuntan, así que van primero.
  const secPend = pendiente(local.secuencias);
  const resSec = anotar(await subirLote('secuencias_pase', secPend, { onConflict: 'id' }));
  if (resSec.tablaAusente) reporte.sinTabla.push('secuencias_pase');
  else {
    await db.guardarVarios('secuencias', secPend.map(s => ({ ...s, _estado: 'sincronizado' })));
    reporte.secuencias = secPend.length;
  }

  // 2) Eventos nuevos. Vuelven con su id real, que hace falta más abajo.
  const evPend = pendiente(local.eventos);
  const evNuevos = evPend.filter(e => e.id == null);
  const evEditados = evPend.filter(e => e.id != null);

  const mapaIds = new Map();          // local_id → id real
  local.eventos.forEach(e => { if (e.id != null) mapaIds.set(e.local_id, e.id); });

  if (evNuevos.length) {
    const res = anotar(await subirLote('eventos', evNuevos, { onConflict: 'local_id', devolver: true }));
    if (res.tablaAusente) throw new Error('No existe la tabla eventos');

    /* Sin la columna local_id la base no puede devolvernos el vínculo; en ese
       caso confiamos en el orden del lote, que PostgREST respeta. */
    res.data.forEach((fila, i) => {
      const localId = fila.local_id || evNuevos[i]?.local_id;
      if (localId) mapaIds.set(localId, fila.id);
    });

    await db.guardarVarios('eventos', evNuevos.map(e => ({
      ...e,
      id: mapaIds.get(e.local_id) ?? e.id ?? null,
      _estado: 'sincronizado',
    })));
    reporte.eventos += evNuevos.length;
  }

  // 3) Eventos que ya existían en la base y acá se enriquecieron: el gol que
  //    ahora cuelga de una cadena de pases, o al que le calculamos el
  //    contexto numérico. Se actualizan por id, sin tocar lo demás.
  for (const ev of evEditados) {
    const parche = {
      secuencia_id: ev.secuencia_id ?? null,
      orden_secuencia: ev.orden_secuencia ?? null,
      zona_x_fin: ev.zona_x_fin ?? null,
      zona_y_fin: ev.zona_y_fin ?? null,
      posiciones: ev.posiciones ?? null,
      defensores_linea: ev.defensores_linea ?? null,
      atacantes_linea: ev.atacantes_linea ?? null,
      balance_linea: ev.balance_linea ?? null,
      pase_completado: ev.pase_completado ?? null,
      tipo_perdida: ev.tipo_perdida ?? null,
      id_asistencia: ev.id_asistencia ?? null,
      id_receptor: ev.id_receptor ?? null,
      t_ms: ev.t_ms ?? null,
    };
    let intento = { ...parche };
    for (let i = 0; i < 12; i++) {
      const { error } = await supabase.from('eventos').update(intento).eq('id', ev.id);
      if (!error) break;
      const col = columnaFaltante(error);
      if (!col) throw error;
      reporte.omitidas.add(col);
      delete intento[col];
      if (Object.keys(intento).length === 0) break;
    }
    await db.guardar('eventos', { ...ev, _estado: 'sincronizado' });
    reporte.eventos += 1;
  }

  // 4) Snapshots del mapita: recién ahora sabemos el id real del evento al
  //    que cuelgan (si colgaban de uno recién creado).
  const snapPend = pendiente(local.snapshots).map(s => ({
    ...s,
    id_evento: s.id_evento ?? (s._local_id_evento ? mapaIds.get(s._local_id_evento) ?? null : null),
  }));
  const resSnap = anotar(await subirLote('snapshots_posicionales', snapPend, { onConflict: 'local_id' }));
  if (resSnap.tablaAusente) reporte.sinTabla.push('snapshots_posicionales');
  else {
    await db.guardarVarios('snapshots', snapPend.map(s => ({ ...s, _estado: 'sincronizado' })));
    reporte.snapshots = snapPend.length;
  }

  // 5) Recorridos y stints: no dependen de nadie.
  const recPend = pendiente(local.recorridos);
  const resRec = anotar(await subirLote('recorridos_jugador', recPend, { onConflict: 'local_id' }));
  if (resRec.tablaAusente) reporte.sinTabla.push('recorridos_jugador');
  else {
    await db.guardarVarios('recorridos', recPend.map(r => ({ ...r, _estado: 'sincronizado' })));
    reporte.recorridos = recPend.length;
  }

  const stPend = pendiente(local.stints);
  const resSt = anotar(await subirLote('stints_cancha', stPend, { onConflict: 'local_id' }));
  if (resSt.tablaAusente) reporte.sinTabla.push('stints_cancha');
  else {
    await db.guardarVarios('stints', stPend.map(s => ({ ...s, _estado: 'sincronizado' })));
    reporte.stints = stPend.length;
  }

  // 6) Cerramos el círculo: la secuencia apunta al evento que la terminó.
  if (!resSec.tablaAusente) {
    const cierres = secPend.filter(s => s._local_id_evento_final && !s.id_evento_final);
    for (const sec of cierres) {
      const idReal = mapaIds.get(sec._local_id_evento_final);
      if (idReal == null) continue;
      const { error } = await supabase
        .from('secuencias_pase')
        .update({ id_evento_final: idReal })
        .eq('id', sec.id);
      if (!error) await db.guardar('secuencias', { ...sec, id_evento_final: idReal, _estado: 'sincronizado' });
    }
  }

  return { ...reporte, omitidas: [...reporte.omitidas] };
}
