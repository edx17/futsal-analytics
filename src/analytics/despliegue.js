/* ═══════════════════════════════════════════════════════════════════════════
   MÉTRICAS DEL ANÁLISIS OFFLINE

   Lo que la captura offline hace posible medir y el tracker en vivo no:

   · minutos reales en cancha, corregibles a mano (stints)
   · mapa de calor de DÓNDE ESTUVO el jugador, no de dónde tocó la pelota
   · pases completados e incompletos, con precisión por jugador
   · pérdidas separadas en forzadas (te presionaron) y no forzadas (error)
   · LA LÍNEA DE LA PELOTA: cuántos quedamos por detrás y cuántos rivales
     por delante. Es lo que detecta el 3v2 momentáneo cuando nos rompen la
     presión, que no tiene nada que ver con expulsados ni portero-jugador.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  BALON_ID, DURACION_PERIODO_MS, PERIODOS, msAbsoluto, tMsDeEvento, coordDeEvento,
  normalizarQuinteto, crearStint, esGol, esPase,
} from '../offline/modelo';

/* ── TIEMPO EN CANCHA ────────────────────────────────────────────────────── */

/* Reconstruye los tramos en cancha a partir de los eventos 'Cambio' que dejó
   el tracker en vivo. Es sólo la semilla: el analista después los corre a
   mano, que es justamente lo que no se podía hacer hasta ahora.

   Un 'Cambio' trae id_jugador (el que sale) e id_receptor (el que entra). */
export function sembrarStints({ eventos = [], titulares = [], clubId, idPartido, duracionPeriodoMs = DURACION_PERIODO_MS }) {
  const stints = [];
  const abiertos = new Map(); // idJugador → stint abierto en el período actual

  const abrir = (idJugador, periodo, tMs) => {
    const clave = String(idJugador);
    if (abiertos.has(clave)) return;
    const s = crearStint({ clubId, idPartido, idJugador: clave, periodo, entradaMs: tMs });
    abiertos.set(clave, s);
    stints.push(s);
  };
  const cerrar = (idJugador, tMs) => {
    const clave = String(idJugador);
    const s = abiertos.get(clave);
    if (!s) return;
    s.salida_ms = tMs;
    abiertos.delete(clave);
  };

  const porPeriodo = PERIODOS.map(p => ({
    periodo: p,
    eventos: eventos
      .filter(e => (e.periodo || 'PT') === p)
      .sort((a, b) => tMsDeEvento(a) - tMsDeEvento(b)),
  }));

  /* El quinteto del primer evento de cada período manda: es más confiable
     que arrastrar el estado desde el período anterior, porque el entretiempo
     casi siempre trae cambios que nadie registró como tales. */
  porPeriodo.forEach(({ periodo, eventos: evs }) => {
    abiertos.clear();

    const primero = evs.find(e => normalizarQuinteto(e.quinteto_activo).length > 0);
    const arranque = primero ? normalizarQuinteto(primero.quinteto_activo)
                             : (periodo === 'PT' ? titulares.map(String) : []);
    arranque.forEach(id => abrir(id, periodo, 0));

    evs.forEach(ev => {
      if (ev.accion !== 'Cambio' || ev.equipo !== 'Propio') return;
      const t = tMsDeEvento(ev);
      if (ev.id_jugador != null) cerrar(ev.id_jugador, t);
      if (ev.id_receptor != null) abrir(ev.id_receptor, periodo, t);
    });

    /* Una roja saca al jugador y no vuelve. */
    evs.forEach(ev => {
      if (ev.accion === 'Tarjeta Roja' && ev.equipo === 'Propio' && ev.id_jugador != null) {
        cerrar(ev.id_jugador, tMsDeEvento(ev));
      }
    });

    abiertos.forEach((s) => { s.salida_ms = duracionPeriodoMs; });
  });

  return stints;
}

export function minutosPorJugador(stints = []) {
  const acc = {};
  stints.forEach(s => {
    const clave = String(s.id_jugador);
    const fin = s.salida_ms == null ? s.entrada_ms : s.salida_ms;
    acc[clave] = (acc[clave] || 0) + Math.max(0, fin - s.entrada_ms);
  });
  return Object.fromEntries(
    Object.entries(acc).map(([id, ms]) => [id, Number((ms / 60000).toFixed(1))])
  );
}

export const stintsDeJugador = (stints = [], idJugador) =>
  stints
    .filter(s => String(s.id_jugador) === String(idJugador))
    .sort((a, b) => msAbsoluto(a.periodo, a.entrada_ms) - msAbsoluto(b.periodo, b.entrada_ms));

/* ¿Quién estaba en cancha en tal momento? Lo usamos para saber contra qué
   quinteto pasó cada cosa sin depender de que el evento traiga quinteto. */
export function enCanchaEn(stints = [], periodo, tMs) {
  return stints
    .filter(s => (s.periodo || 'PT') === periodo &&
                 s.entrada_ms <= tMs &&
                 (s.salida_ms == null || s.salida_ms >= tMs))
    .map(s => String(s.id_jugador));
}

/* El tramo abierto de un jugador en este momento. El seguimiento posicional
   se cuelga de acá: el rastro dura lo que dura el tramo. */
export const stintActivo = (stints = [], idJugador, periodo, tMs) =>
  stints.find(s => String(s.id_jugador) === String(idJugador) &&
                   (s.periodo || 'PT') === periodo &&
                   s.entrada_ms <= tMs &&
                   (s.salida_ms == null || s.salida_ms >= tMs)) || null;

/* ── LÍNEA DE LA PELOTA ──────────────────────────────────────────────────── */

/* La pregunta que importa: si nos rompen la presión y queda un 3v2, ¿lo veo?

   Con la pelota en x, mirando siempre desde nuestro arco (x=0):

   · Fase DEFENSIVA (la pelota la tiene el rival)
       atacantes  = rivales a la altura de la pelota o ya pasados hacia
                    nuestro arco  (x <= xBalón)
       defensores = nuestros entre la pelota y nuestro arco  (x < xBalón)
     Un 3v2 en contra sale como atacantes 3, defensores 2, balance -1.

   · Fase OFENSIVA (la pelota la tenemos nosotros): el espejo.
       atacantes  = nuestros a la altura de la pelota o por delante
       defensores = rivales entre la pelota y su arco

   El arquero se excluye por defecto: un 3v2 se cuenta entre jugadores de
   campo, si no todo parecería un 3v3. */
export function balanceLineaPelota({
  posiciones = [], balon = null, fase = 'defensiva',
  idArquero = null, incluirArquero = false, tolerancia = 0,
}) {
  if (!balon || balon.x == null) return null;
  const xB = Number(balon.x);

  const propios = posiciones.filter(p =>
    p.equipo !== 'Rival' && p.id_jugador !== BALON_ID &&
    (incluirArquero || String(p.id_jugador) !== String(idArquero)));
  const rivales = posiciones.filter(p => p.equipo === 'Rival' && p.id_jugador !== BALON_ID);

  let atacantes, defensores, quienesAtacan, quienesDefienden;

  if (fase === 'ofensiva') {
    quienesAtacan = propios.filter(p => Number(p.x) >= xB - tolerancia);
    quienesDefienden = rivales.filter(p => Number(p.x) > xB + tolerancia);
  } else {
    quienesAtacan = rivales.filter(p => Number(p.x) <= xB + tolerancia);
    quienesDefienden = propios.filter(p => Number(p.x) < xB - tolerancia);
  }

  atacantes = quienesAtacan.length;
  defensores = quienesDefienden.length;

  /* Desde NUESTRO punto de vista: en defensa, menos defensores que
     atacantes es inferioridad; en ataque, es superioridad nuestra. */
  const diferencia = defensores - atacantes;
  const aFavor = fase === 'ofensiva' ? -diferencia : diferencia;

  return {
    fase,
    atacantes,
    defensores,
    balance: diferencia,
    marcador: `${atacantes}v${defensores}`,
    etiqueta: aFavor > 0 ? 'Superioridad' : aFavor < 0 ? 'Inferioridad' : 'Igualdad',
    critico: fase !== 'ofensiva' && diferencia < 0,
    idsDefensores: quienesDefienden.map(p => String(p.id_jugador)),
    idsAtacantes: quienesAtacan.map(p => String(p.id_jugador)),
    xBalon: xB,
  };
}

export const balonDe = (posiciones = []) =>
  posiciones.find(p => p.id_jugador === BALON_ID) || null;

/* La foto más cercana en el tiempo, si está lo bastante cerca. */
export const snapshotMasCercano = (snapshots = [], periodo, tMs, toleranciaMs = 20000) => {
  let mejor = null;
  let mejorDist = Infinity;
  snapshots.forEach(s => {
    if ((s.periodo || 'PT') !== periodo) return;
    const d = Math.abs((s.t_ms ?? 0) - tMs);
    if (d < mejorDist) { mejorDist = d; mejor = s; }
  });
  return mejorDist <= toleranciaMs ? { snapshot: mejor, desfaseMs: mejorDist } : null;
};

/* El contexto de un gol: primero mira la foto que tenga el propio evento
   (la que le pegaste desde el análisis), y si no, la foto suelta más
   cercana. Un gol en contra se lee en fase defensiva y uno a favor en
   ofensiva, que es como se mira cada uno. */
export function contextoLineaGol(gol, snapshots = [], { idArquero = null, toleranciaMs = 20000 } = {}) {
  const fase = gol?.equipo === 'Propio' ? 'ofensiva' : 'defensiva';

  if (gol?.balance_linea != null) {
    const atacantes = gol.atacantes_linea ?? 0;
    const defensores = gol.defensores_linea ?? 0;
    const aFavor = fase === 'ofensiva' ? -(defensores - atacantes) : (defensores - atacantes);
    return {
      fase, atacantes, defensores,
      balance: defensores - atacantes,
      marcador: `${atacantes}v${defensores}`,
      etiqueta: aFavor > 0 ? 'Superioridad' : aFavor < 0 ? 'Inferioridad' : 'Igualdad',
      guardado: true, desfaseMs: 0,
    };
  }

  const propio = Array.isArray(gol?.posiciones) && gol.posiciones.length
    ? { posiciones: gol.posiciones, balon: balonDe(gol.posiciones), desfaseMs: 0 }
    : null;

  let fuente = propio;
  if (!fuente) {
    const cercano = snapshotMasCercano(snapshots, gol?.periodo || 'PT', tMsDeEvento(gol), toleranciaMs);
    if (cercano) {
      const s = cercano.snapshot;
      fuente = {
        posiciones: s.posiciones || [],
        balon: s.x_balon != null ? { x: s.x_balon, y: s.y_balon } : balonDe(s.posiciones || []),
        desfaseMs: cercano.desfaseMs,
      };
    }
  }
  if (!fuente) return null;

  /* Sin pelota marcada, el punto del gol hace de pelota. */
  const balon = fuente.balon || (() => {
    const c = coordDeEvento(gol || {});
    return c.x != null ? { x: c.x, y: c.y } : null;
  })();

  const r = balanceLineaPelota({ posiciones: fuente.posiciones, balon, fase, idArquero });
  return r ? { ...r, desfaseMs: fuente.desfaseMs, guardado: false } : null;
}

export const golesConContexto = (eventos = [], snapshots = [], opciones = {}) =>
  eventos
    .filter(ev => esGol(ev.accion))
    .sort((a, b) => msAbsoluto(a.periodo, tMsDeEvento(a)) - msAbsoluto(b.periodo, tMsDeEvento(b)))
    .map(gol => ({ gol, linea: contextoLineaGol(gol, snapshots, opciones) }));

/* ── PASES ───────────────────────────────────────────────────────────────── */

/* Completados, incompletos y precisión. Los pases del tracker en vivo no
   traen resultado (pase_completado null): se cuentan aparte para no inflar
   la precisión con datos que nadie marcó. */
export function resumenPases(eventos = [], { equipo = 'Propio' } = {}) {
  const total = { completados: 0, incompletos: 0, sinMarcar: 0 };
  const porJugador = {};

  eventos.forEach(ev => {
    if (!esPase(ev.accion) || ev.equipo !== equipo) return;
    const clave = ev.id_jugador != null ? String(ev.id_jugador) : 'sin_jugador';
    if (!porJugador[clave]) porJugador[clave] = { completados: 0, incompletos: 0, sinMarcar: 0 };

    const destino = ev.pase_completado === true ? 'completados'
                  : ev.pase_completado === false ? 'incompletos'
                  : 'sinMarcar';
    total[destino] += 1;
    porJugador[clave][destino] += 1;
  });

  const precision = (o) => {
    const base = o.completados + o.incompletos;
    return base > 0 ? Number(((o.completados / base) * 100).toFixed(1)) : null;
  };

  return {
    ...total,
    intentados: total.completados + total.incompletos,
    precision: precision(total),
    porJugador: Object.fromEntries(
      Object.entries(porJugador).map(([id, o]) => [id, { ...o, precision: precision(o) }])
    ),
  };
}

/* ── PÉRDIDAS ────────────────────────────────────────────────────────────── */

/* Forzada = te la sacaron con presión. No forzada = regalada.
   El índice que importa es qué proporción fue error propio, y en qué zona:
   una pérdida no forzada en salida no es lo mismo que una en campo rival. */
export function indicePerdidas(eventos = [], { equipo = 'Propio' } = {}) {
  const perdidas = eventos.filter(ev =>
    ev.accion === 'Pérdida' && ev.equipo === equipo);

  const tercio = (x) => (x == null ? 'sin_zona' : x < 33.4 ? 'defensivo' : x < 66.7 ? 'medio' : 'ofensivo');

  const salida = {
    total: perdidas.length,
    forzadas: 0,
    noForzadas: 0,
    sinClasificar: 0,
    porZona: { defensivo: 0, medio: 0, ofensivo: 0, sin_zona: 0 },
    noForzadasEnSalida: 0,
    porJugador: {},
  };

  perdidas.forEach(ev => {
    const z = tercio(coordDeEvento(ev).x);
    salida.porZona[z] += 1;

    const tipo = ev.tipo_perdida === 'forzada' ? 'forzadas'
               : ev.tipo_perdida === 'no_forzada' ? 'noForzadas'
               : 'sinClasificar';
    salida[tipo] += 1;
    if (tipo === 'noForzadas' && z === 'defensivo') salida.noForzadasEnSalida += 1;

    const clave = ev.id_jugador != null ? String(ev.id_jugador) : 'sin_jugador';
    if (!salida.porJugador[clave]) salida.porJugador[clave] = { total: 0, forzadas: 0, noForzadas: 0 };
    salida.porJugador[clave].total += 1;
    if (tipo !== 'sinClasificar') salida.porJugador[clave][tipo] += 1;
  });

  const clasificadas = salida.forzadas + salida.noForzadas;
  salida.pctNoForzadas = clasificadas > 0
    ? Number(((salida.noForzadas / clasificadas) * 100).toFixed(1))
    : null;

  return salida;
}

/* ── DESPLIEGUE FÍSICO / MAPA DE CALOR ───────────────────────────────────── */

/* Junta las tres fuentes de "dónde estuvo" un jugador, de más a menos
   confiable, y les da peso distinto:
     · recorridos: lo fuiste moviendo vos siguiéndolo, vale por lo que es
     · fotos posicionales: instantáneas, alto valor
     · sus propios eventos: sabemos que estuvo ahí porque tocó la pelota */
export function puntosDespliegue({ idJugador, recorridos = [], snapshots = [], eventos = [], incluirEventos = true }) {
  const clave = String(idJugador);
  const puntos = [];

  recorridos
    .filter(r => String(r.id_jugador) === clave)
    .forEach(r => {
      (r.puntos || []).forEach(p => {
        if (p?.x == null || p?.y == null) return;
        puntos.push({ x: Number(p.x), y: Number(p.y), peso: 1, t_ms: p.t_ms, fuente: 'recorrido' });
      });
    });

  snapshots.forEach(s => {
    (s.posiciones || []).forEach(p => {
      if (String(p.id_jugador) !== clave || p.x == null || p.y == null) return;
      puntos.push({ x: Number(p.x), y: Number(p.y), peso: 1.5, t_ms: s.t_ms, fuente: 'snapshot' });
    });
  });

  if (incluirEventos) {
    eventos.forEach(ev => {
      if (String(ev.id_jugador) !== clave) return;
      const { x, y } = coordDeEvento(ev);
      if (x == null || y == null) return;
      puntos.push({ x: Number(x), y: Number(y), peso: 1, t_ms: tMsDeEvento(ev), fuente: 'evento' });
      /* En una conducción el jugador también estuvo en el punto final. */
      if (ev.accion === 'Conducción' && ev.zona_x_fin != null && ev.zona_y_fin != null) {
        puntos.push({ x: Number(ev.zona_x_fin), y: Number(ev.zona_y_fin), peso: 1, fuente: 'evento' });
      }
    });
  }

  return puntos;
}

/* Grilla de ocupación normalizada 0-1, para pintar zonas o comparar
   jugadores. x=0 arco propio, x=100 arco rival. */
export function grillaDespliegue(puntos = [], cols = 6, rows = 4) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  let max = 0;

  puntos.forEach(p => {
    const c = Math.max(0, Math.min(cols - 1, Math.floor((p.x / 100) * cols)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor((p.y / 100) * rows)));
    grid[r][c] += p.peso ?? 1;
    if (grid[r][c] > max) max = grid[r][c];
  });

  return { grid, max, normalizada: grid.map(f => f.map(v => (max > 0 ? v / max : 0))) };
}

/* Centro de gravedad y dispersión: el resumen de una línea del despliegue. */
export function centroDespliegue(puntos = []) {
  if (puntos.length === 0) return null;
  const pesoTotal = puntos.reduce((a, p) => a + (p.peso ?? 1), 0);
  const cx = puntos.reduce((a, p) => a + p.x * (p.peso ?? 1), 0) / pesoTotal;
  const cy = puntos.reduce((a, p) => a + p.y * (p.peso ?? 1), 0) / pesoTotal;
  const varX = puntos.reduce((a, p) => a + ((p.x - cx) ** 2) * (p.peso ?? 1), 0) / pesoTotal;
  const varY = puntos.reduce((a, p) => a + ((p.y - cy) ** 2) * (p.peso ?? 1), 0) / pesoTotal;
  return {
    x: Number(cx.toFixed(1)),
    y: Number(cy.toFixed(1)),
    profundidad: Number(Math.sqrt(varX).toFixed(1)),
    amplitud: Number(Math.sqrt(varY).toFixed(1)),
    muestras: puntos.length,
  };
}

/* ── CADENAS DE PASES ────────────────────────────────────────────────────── */

export const cadenaDeSecuencia = (eventos = [], secuenciaId) =>
  eventos
    .filter(ev => ev.secuencia_id === secuenciaId)
    .sort((a, b) => (a.orden_secuencia ?? 0) - (b.orden_secuencia ?? 0));

/* Resume una cadena para mostrarla al lado del gol: cuántos pases, cuántos
   llegaron, cuánto duró, cuánto campo avanzó y por quiénes pasó. */
export function resumenCadena(cadena = []) {
  if (cadena.length === 0) return null;
  const inicio = cadena[0];
  const fin = cadena[cadena.length - 1];
  const pases = cadena.filter(e => esPase(e.accion));
  const xInicio = coordDeEvento(inicio).x ?? 0;
  const xFin = fin.zona_x_fin ?? coordDeEvento(fin).x ?? 0;

  return {
    pases: pases.length,
    completados: pases.filter(e => e.pase_completado === true).length,
    incompletos: pases.filter(e => e.pase_completado === false).length,
    eventos: cadena.length,
    duracionMs: Math.max(0, tMsDeEvento(fin) - tMsDeEvento(inicio)),
    avanceCampo: Number((xFin - xInicio).toFixed(1)),
    inicioEnCampoPropio: xInicio < 50,
    jugadores: [...new Set(cadena.map(e => e.id_jugador).filter(Boolean).map(String))],
    resultado: fin.accion,
  };
}
