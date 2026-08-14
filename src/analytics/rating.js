// src/analytics/rating.js
// ═══════════════════════════════════════════════════════════════════════════
// RATING v2
//
// Cambios estructurales respecto de v1:
//  1. Familias con saturación: la 5ª recuperación vale mucho menos que la 1ª.
//     Antes la suma era lineal y el volumen de acciones baratas superaba a las
//     decisivas (5 rec + 3 faltas recibidas = 7.6 vs 1 gol + 2 asist = 7.3).
//  2. Dificultad vía xG: un gol de 0.05 no vale lo mismo que un tap-in de 0.85,
//     y errar un mano a mano cuesta más que errar de 25 metros.
//  3. Contexto de equipo: el +/- pasa a ser el término contextual dominante y
//     hay techo de nota en derrotas abultadas. Antes el rating no miraba el
//     marcador y un 2 goles + 2 asistencias en un 11-2 sacaba 7.5.
//  4. `Falta recibida` baja de 0.5-0.8 por unidad (sin tope) a 0.15 con tope
//     duro. Antes 8 faltas recibidas y nada más daban 7.2.
//  5. Confiabilidad por PARTICIPACIÓN, no por el cronómetro, y sin el doble
//     conteo de volumen de v1 (más eventos => más score Y más factor de tiempo).
//  6. Arquero girando sobre GOLES EVITADOS (xG recibido - goles recibidos) en
//     vez del conteo de atajadas. Se elimina el techo por goles recibidos, que
//     castigaba al arquero por el desempeño de la defensa.
//
// COMPATIBILIDAD: la firma vieja sigue funcionando. El contexto de partido es
// un 6º parámetro opcional; sin él se calcula sin techo por resultado.
// ═══════════════════════════════════════════════════════════════════════════

import { calcularXGEvento } from './xg';

/* ───────────────────────── Parámetros calibrables ───────────────────────── */
export const PARAMS = {
  BASE: 6.0,

  // Techo asintótico de cada familia (k en sat(x,k) = k*x/(x+k))
  K_FINALIZACION: 8.0,
  K_CREACION: 7.0,
  K_DEFENSA: 2.8,               // calibrado: era 4.0
  K_POSESION: 2.5,              // calibrado: era 3.0
  K_FALTAS_RECIBIDAS: 0.6,
  K_PLUSMINUS: 4.0,
  K_ARQUERO: 8.0,

  // Acciones decisivas, moduladas por dificultad (xG)
  GOL_BASE: 2.5,
  GOL_DIFICULTAD: 3.0,        // gol = BASE + DIFICULTAD * (1 - xG)
  REMATE_ARCO: 0.25,          // crédito por rematar al arco
  PENAL_OCASION: 1.0,         // castigo por no convertir, proporcional al xG
  REMATE_FUERA: 0.8,          // castigo por errar el arco, proporcional al xG
  ASISTENCIA_BASE: 1.2,
  ASISTENCIA_XG: 2.5,         // asistencia = BASE + XG * xG_generado
  PASE_CLAVE_BASE: 0.5,
  PASE_CLAVE_XG: 1.5,

  // Acciones de volumen
  RECUPERACION: 1.0,              // calibrado: era 1.2
  RECUPERACION_ALTA_BONUS: 0.5,   // recuperar en campo rival
  DUELO_DEF: 0.6,                 // calibrado: era 1.0. Un duelo ganado es una
  DUELO_OFE: 0.55,                // unidad mucho más chica que una recuperación
  PERDIDA: 0.95,                // calibrado: era 1.1
  PERDIDA_ZONA_PROPIA: 1.5,     // calibrado: era 1.7
  FALTA_RECIBIDA: 0.15,
  FALTA_COMETIDA: 0.35,
  FALTA_COMETIDA_PROPIA: 0.65,
  AMARILLA: 1.2,
  ROJA: 4.0,
  TECHO_ROJA: 4.5,              // calibrado: era un piso duro de 3.5

  // Contexto de equipo
  PESO_PLUSMINUS: 1.1,
  BONUS_VICTORIA: 0.25,
  BONUS_DERROTA: -0.25,
  TECHO_DERROTA_4: 7.5,
  TECHO_DERROTA_6: 7.0,
  INDULTO_PM_NO_NEGATIVO: 0.5,

  // Confiabilidad de muestra
  PARTICIPACION_PLENA: 0.30,
  EXPONENTE_CONFIABILIDAD: 0.6,

  // Arquero. El eje es "goles evitados" (xG recibido - goles recibidos), pero
  // lo mezclamos con el % de atajadas para no depender enteramente de un modelo
  // de xG que todavía está sub-calibrado para futsal (ver script de calibración).
  GOL_EVITADO: 2.8,             // calibrado: era 2.2
  ARQ_PESO_XG: 0.6,
  ARQ_PESO_ATAJADAS: 0.4,
  ARQ_BASELINE_ATAJADAS: 0.65,   // % de atajadas considerado "normal"
  ARQ_ESCALA_ATAJADAS: 12,
  TECHO_ARQ_MALO: 5.5,

  // Curva final
  CURVA_K: 6.0,
  CURVA_MAX: 4.2,
  CURVA_MIN: 5.0,
};

/* ─────────────────────────────── Utilidades ─────────────────────────────── */

// Saturación: rendimientos decrecientes con techo asintótico en k.
const sat = (x, k) => (k > 0 && x > 0 ? (k * x) / (x + k) : x);
// Versión simétrica: también amortigua lo negativo.
const satSim = (x, k) => (x >= 0 ? sat(x, k) : -sat(-x, k));

const normalizarPosicion = (pos) => {
  if (!pos) return 'universal';
  const p = String(pos).toLowerCase();
  if (p.includes('arquero') || p.includes('portero')) return 'arquero';
  if (p.includes('pivot') || p.includes('pívot')) return 'pivot';
  if (p.includes('cierre') || p.includes('ultimo') || p.includes('último')) return 'cierre';
  if (p.includes('ala')) return 'ala';
  return 'universal';
};

/* Multiplicadores por familia y posición. Reemplazan la tabla de pesos por
   acción de v1: misma idea (un gol del cierre es más raro, una recuperación
   del pivot es más valiosa) pero sin 40 números sueltos que se contradicen. */
const MULT = {
  pivot:     { finalizacion: 1.00, creacion: 1.00, defensa: 1.30, posesion: 1.00 },
  ala:       { finalizacion: 1.00, creacion: 1.05, defensa: 1.10, posesion: 1.00 },
  cierre:    { finalizacion: 1.25, creacion: 1.15, defensa: 0.90, posesion: 1.10 },
  arquero:   { finalizacion: 1.00, creacion: 1.30, defensa: 1.00, posesion: 1.20 },
  universal: { finalizacion: 1.00, creacion: 1.00, defensa: 1.00, posesion: 1.00 },
};

const xgDe = (ev) => {
  const v = Number(ev?.xg);
  if (Number.isFinite(v) && v > 0) return v;
  try { return calcularXGEvento(ev) || 0; } catch (e) { return 0; }
};

const zonaX = (ev) => {
  const x = ev?.zona_x_norm !== undefined ? ev.zona_x_norm : ev?.zona_x;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/* ═══════════════════════════════════════════════════════════════════════════
   RATING PRINCIPAL

   @param jugador          { posicion, ... }
   @param eventosJugador   eventos del jugador (soporta tipoVirtual)
   @param arg3/arg4/arg5   compatibilidad v1: (eventosRivales, plusMinus, minutos)
                           o (plusMinus, minutos, eventosRivales)
   @param contexto         OPCIONAL:
     {
       golesFavor, golesContra,   // marcador del partido
       participacion,             // 0-1, de calcularParticipacion()
       xgRecibido, golesRecibidos // arqueros, atribuidos mientras estuvo en cancha
     }
   ═══════════════════════════════════════════════════════════════════════════ */
export function calcularRatingJugador(jugador, eventosJugador = [], arg3 = [], arg4 = 0, arg5 = 0, contexto = null) {
  return calcularRatingDetallado(jugador, eventosJugador, arg3, arg4, arg5, contexto).rating;
}

/* Igual, pero devuelve el desglose completo: sirve para mostrar en la UI por
   qué sacó esa nota y para el script de calibración. */
export function calcularRatingDetallado(jugador, eventosJugador = [], arg3 = [], arg4 = 0, arg5 = 0, contexto = null) {
  /* ── Escudo de parámetros (las dos firmas de v1) ── */
  let eventosRivales = [];
  let plusMinus = 0;
  let minutosJugados = 0;

  if (Array.isArray(arg3)) {
    eventosRivales = arg3;
    plusMinus = Number(arg4) || 0;
    minutosJugados = Number(arg5) || 0;
  } else {
    plusMinus = Number(arg3) || 0;
    minutosJugados = Number(arg4) || 0;
    eventosRivales = Array.isArray(arg5) ? arg5 : [];
  }

  const evs = Array.isArray(eventosJugador) ? eventosJugador : [];
  const pos = normalizarPosicion(jugador?.posicion);
  const mult = MULT[pos] || MULT.universal;
  const P = PARAMS;

  const fam = { finalizacion: 0, creacion: 0, defensa: 0, posesion: 0, faltasRec: 0 };
  let penalizaciones = 0;
  const conteo = {
    goles: 0, asistencias: 0, pasesClave: 0, remates: 0, rematesArco: 0,
    recuperaciones: 0, perdidas: 0, faltasCometidas: 0, faltasRecibidas: 0,
    duelosDefGan: 0, duelosDefPer: 0, duelosOfeGan: 0, duelosOfePer: 0,
    amarillas: 0, rojas: 0, xgAcumulado: 0,
  };

  evs.forEach(ev => {
    const acc = ev?.accion || '';
    const necesitaXG = acc.includes('Remate') || acc === 'Gol' || acc === 'Asistencia' || acc === 'Pase Clave' || ev?.tipoVirtual;
    const xg = necesitaXG ? xgDe(ev) : 0;
    const x = zonaX(ev);

    /* Finalización — el gol vale más cuanto más difícil era */
    if (acc === 'Gol' || acc === 'Remate - Gol') {
      fam.finalizacion += P.GOL_BASE + P.GOL_DIFICULTAD * (1 - xg);
      conteo.goles++; conteo.remates++; conteo.rematesArco++; conteo.xgAcumulado += xg;
    } else if (acc === 'Remate - Atajado') {
      fam.finalizacion += P.REMATE_ARCO - P.PENAL_OCASION * xg;
      conteo.remates++; conteo.rematesArco++;
    } else if (acc.includes('Remate')) {
      fam.finalizacion -= P.REMATE_FUERA * xg;
      conteo.remates++;
    } else if (acc === 'Ocasión Fallada') {
      fam.finalizacion -= Math.max(0.4, P.PENAL_OCASION * 1.5 * xg);
    }

    /* Creación — vale más el pase que genera la ocasión clara */
    if (acc === 'Asistencia' || ev?.tipoVirtual === 'Asistencia') {
      fam.creacion += P.ASISTENCIA_BASE + P.ASISTENCIA_XG * xg;
      conteo.asistencias++;
    } else if (acc === 'Pase Clave' || ev?.tipoVirtual === 'Pase Clave') {
      fam.creacion += P.PASE_CLAVE_BASE + P.PASE_CLAVE_XG * xg;
      conteo.pasesClave++;
    }

    /* Defensa */
    if (acc === 'Recuperación' || acc === 'Intercepción') {
      fam.defensa += P.RECUPERACION + (x != null && x > 66 ? P.RECUPERACION_ALTA_BONUS : 0);
      conteo.recuperaciones++;
    }
    if (acc === 'Duelo DEF Ganado' || acc === 'Duelo DEF Indirecto Ganado') { fam.defensa += P.DUELO_DEF; conteo.duelosDefGan++; }
    if (acc === 'Duelo DEF Perdido' || acc === 'Duelo DEF Indirecto Perdido') { fam.defensa -= P.DUELO_DEF; conteo.duelosDefPer++; }

    /* Posesión */
    if (acc === 'Duelo OFE Ganado' || acc === 'Duelo OFE Indirecto Ganado') { fam.posesion += P.DUELO_OFE; conteo.duelosOfeGan++; }
    if (acc === 'Duelo OFE Perdido' || acc === 'Duelo OFE Indirecto Perdido') { fam.posesion -= P.DUELO_OFE; conteo.duelosOfePer++; }
    if (acc === 'Pérdida') {
      fam.posesion -= (x != null && x < 33) ? P.PERDIDA_ZONA_PROPIA : P.PERDIDA;
      conteo.perdidas++;
    }

    /* Faltas recibidas: aportan, pero con techo duro */
    if (acc === 'Falta recibida' || acc === 'Penal a favor') {
      fam.faltasRec += P.FALTA_RECIBIDA;
      conteo.faltasRecibidas++;
    }

    /* Disciplina: resta sin saturar */
    if (acc === 'Falta cometida' || acc === 'Falta cometida (Ventaja)') {
      penalizaciones -= (x != null && x < 33) ? P.FALTA_COMETIDA_PROPIA : P.FALTA_COMETIDA;
      conteo.faltasCometidas++;
    }
    if (acc === 'Penal en contra') penalizaciones -= 1.5;
    if (acc === 'Tarjeta Amarilla') { penalizaciones -= P.AMARILLA; conteo.amarillas++; }
    if (acc === 'Tarjeta Roja') { penalizaciones -= P.ROJA; conteo.rojas++; }
  });

  /* ── Arquero: el eje es lo que EVITÓ, no cuántas veces tocó la pelota ── */
  let golesEvitados = null;
  if (pos === 'arquero') {
    let xgRec = Number(contexto?.xgRecibido);
    let golRec = Number(contexto?.golesRecibidos);

    if (!Number.isFinite(xgRec) || !Number.isFinite(golRec)) {
      const remates = eventosRivales.filter(e => (e.accion || '').includes('Remate'));
      xgRec = remates.reduce((s, e) => s + xgDe(e), 0);
      golRec = remates.filter(e => e.accion === 'Remate - Gol' || e.accion === 'Gol').length;
    }

    // % de atajadas sobre remates al arco enfrentados
    let atajadas = Number(contexto?.atajadas);
    let tirosAlArco = Number(contexto?.tirosAlArco);
    if (!Number.isFinite(atajadas) || !Number.isFinite(tirosAlArco)) {
      const alArco = eventosRivales.filter(e => e.accion === 'Remate - Gol' || e.accion === 'Gol' || e.accion === 'Remate - Atajado');
      atajadas = alArco.filter(e => e.accion === 'Remate - Atajado').length;
      tirosAlArco = alArco.length;
    }

    if (Number.isFinite(xgRec) && Number.isFinite(golRec) && (xgRec > 0 || golRec > 0)) {
      golesEvitados = xgRec - golRec;

      const terminoXG = satSim(golesEvitados * P.GOL_EVITADO, P.K_ARQUERO) * P.ARQ_PESO_XG;

      let terminoAtajadas = 0;
      if (tirosAlArco >= 3) {
        const pct = atajadas / tirosAlArco;
        terminoAtajadas = (pct - P.ARQ_BASELINE_ATAJADAS) * P.ARQ_ESCALA_ATAJADAS * P.ARQ_PESO_ATAJADAS;
      }

      fam.finalizacion += terminoXG + terminoAtajadas;
    }
  }

  /* ── Saturación por familia + multiplicadores posicionales ── */
  const contrib = {
    finalizacion: satSim(fam.finalizacion * mult.finalizacion, P.K_FINALIZACION),
    creacion:     satSim(fam.creacion * mult.creacion, P.K_CREACION),
    defensa:      satSim(fam.defensa * mult.defensa, P.K_DEFENSA),
    posesion:     satSim(fam.posesion * mult.posesion, P.K_POSESION),
    faltasRec:    sat(fam.faltasRec, P.K_FALTAS_RECIBIDAS),
    disciplina:   penalizaciones,
  };

  /* ── Contexto de equipo: el +/- pesa de verdad ── */
  contrib.plusMinus = satSim(plusMinus, P.K_PLUSMINUS) * P.PESO_PLUSMINUS;

  const scoreBruto =
    contrib.finalizacion + contrib.creacion + contrib.defensa +
    contrib.posesion + contrib.faltasRec + contrib.disciplina + contrib.plusMinus;

  /* ── Confiabilidad: muestra chica tracciona hacia la nota base.
     Sin el doble conteo de v1: acá el volumen NO infla el factor. ── */
  let participacion = Number(contexto?.participacion);
  if (!Number.isFinite(participacion) || participacion <= 0) {
    participacion = minutosJugados > 0 ? Math.min(1, minutosJugados / 40) : P.PARTICIPACION_PLENA;
  }
  const factorConfiabilidad = Math.min(1, Math.pow(participacion / P.PARTICIPACION_PLENA, P.EXPONENTE_CONFIABILIDAD));
  const scoreAjustado = scoreBruto * factorConfiabilidad;

  /* ── Curva asintótica ── */
  let rating = P.BASE;
  if (scoreAjustado > 0) rating += P.CURVA_MAX * (scoreAjustado / (scoreAjustado + P.CURVA_K));
  else if (scoreAjustado < 0) rating -= P.CURVA_MIN * (Math.abs(scoreAjustado) / (Math.abs(scoreAjustado) + P.CURVA_K));

  /* ── Ajuste y techo por resultado del equipo ── */
  const gf = Number(contexto?.golesFavor);
  const gc = Number(contexto?.golesContra);
  let techoAplicado = null;

  if (Number.isFinite(gf) && Number.isFinite(gc)) {
    const dif = gf - gc;
    if (dif > 0) rating += P.BONUS_VICTORIA;
    else if (dif < 0) rating += P.BONUS_DERROTA;

    if (dif <= -4) {
      let techo = dif <= -6 ? P.TECHO_DERROTA_6 : P.TECHO_DERROTA_4;
      // Indulto: si con él en cancha el equipo NO perdió, no paga el desastre ajeno
      if (plusMinus >= 0) techo += P.INDULTO_PM_NO_NEGATIVO;
      if (rating > techo) { rating = techo; techoAplicado = techo; }
    }
  }

  /* ── Castigos duros ── */
  if (conteo.rojas > 0) rating = Math.min(rating, P.TECHO_ROJA);
  if (pos === 'arquero' && golesEvitados !== null && golesEvitados < -1.5) {
    rating = Math.min(rating, P.TECHO_ARQ_MALO);
  }

  rating = Math.max(1, Math.min(10, rating));

  return {
    rating: Number(rating.toFixed(1)),
    desglose: {
      familias: fam,
      contrib,
      conteo,
      scoreBruto: Number(scoreBruto.toFixed(2)),
      scoreAjustado: Number(scoreAjustado.toFixed(2)),
      factorConfiabilidad: Number(factorConfiabilidad.toFixed(2)),
      participacion: Number(participacion.toFixed(2)),
      plusMinus,
      golesEvitados: golesEvitados !== null ? Number(golesEvitados.toFixed(2)) : null,
      techoAplicado,
      posicion: pos,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MVP — regla aparte del rating.
   Exige muestra mínima y no corona a nadie en una goleada en contra.
   ═══════════════════════════════════════════════════════════════════════════ */
export function elegirMVP(candidatos = [], contextoPartido = {}) {
  const MIN_PARTICIPACION = 0.25;

  const elegibles = candidatos.filter(c =>
    (Number(c.participacion) || 0) >= MIN_PARTICIPACION && Number.isFinite(Number(c.rating))
  );
  const pool = elegibles.length > 0 ? elegibles : candidatos;
  if (pool.length === 0) return null;

  const mejor = [...pool].sort((a, b) => b.rating - a.rating)[0];

  const gf = Number(contextoPartido.golesFavor);
  const gc = Number(contextoPartido.golesContra);
  const dif = Number.isFinite(gf) && Number.isFinite(gc) ? gf - gc : 0;

  let etiqueta = 'MVP';
  if (dif <= -3) etiqueta = 'LO MÁS RESCATABLE';
  else if (dif < 0) etiqueta = 'EL MEJOR DE LOS NUESTROS';

  return { ...mejor, etiqueta, diferenciaGol: dif };
}

/* Stats de arquero derivadas de los remates que enfrentó (ya atribuidos por
   quinteto en ResumenPlantel/Resumen). */
export function calcularStatsArqueroDesdeRemates(rematesRecibidos = []) {
  const remates = rematesRecibidos.filter(e => (e.accion || '').includes('Remate'));
  const goles = remates.filter(e => e.accion === 'Remate - Gol' || e.accion === 'Gol').length;
  const atajadas = remates.filter(e => e.accion === 'Remate - Atajado').length;
  const xgRecibido = remates.reduce((s, e) => s + xgDe(e), 0);
  return {
    tirosRecibidos: remates.length,
    golesRecibidos: goles,
    atajadas,
    xgRecibido: Number(xgRecibido.toFixed(2)),
    golesEvitados: Number((xgRecibido - goles).toFixed(2)),
    porcentajeAtajadas: remates.length > 0 ? Number(((atajadas / remates.length) * 100).toFixed(1)) : 0,
  };
}