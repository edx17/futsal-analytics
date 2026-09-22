/* ============================================================================
   AGENDA ÚNICA
   ----------------------------------------------------------------------------
   El club ya tenía toda la información, pero repartida: el partido en Torneos,
   el entrenamiento en el Microciclo, el apto por vencer en Plantel, la cuota en
   Tesorería y el alta del lesionado en Enfermería. Nadie mira cinco pantallas
   para saber qué pasa el martes.

   Este módulo no consulta nada: recibe las tablas crudas y devuelve UNA lista
   de eventos, todos con la misma forma, ordenados por día y hora. La pantalla
   sólo pinta; las decisiones de qué entra y con qué prioridad viven acá, que es
   donde se pueden probar.

   Forma de cada evento:
     { id, tipo, fecha:'YYYY-MM-DD', hora:'HH:MM'|null, titulo, sub,
       categoria, ruta, prioridad }

   `prioridad` ordena dentro del mismo día cuando no hay hora: primero lo que
   condiciona la jornada (el partido), último lo que es sólo un lindo detalle
   (el cumpleaños).
============================================================================ */

export const TIPOS = {
  partido:       { id: 'partido',       ico: '⚽',  rotulo: 'Partidos',       color: '#00ff88', ruta: '/torneos' },
  entrenamiento: { id: 'entrenamiento', ico: '🏃',  rotulo: 'Entrenamientos', color: '#38bdf8', ruta: '/microciclo' },
  alta:          { id: 'alta',          ico: '🏥',  rotulo: 'Altas médicas',  color: '#22d3ee', ruta: '/enfermeria' },
  apto:          { id: 'apto',          ico: '🩺',  rotulo: 'Aptos físicos',  color: '#fbbf24', ruta: '/plantel' },
  cuota:         { id: 'cuota',         ico: '💵',  rotulo: 'Cuotas',         color: '#f97316', ruta: '/tesoreria' },
  cumple:        { id: 'cumple',        ico: '🎂',  rotulo: 'Cumpleaños',     color: '#c084fc', ruta: '/plantel' },
};

export const ORDEN_TIPOS = ['partido', 'entrenamiento', 'alta', 'apto', 'cuota', 'cumple'];

const PRIORIDAD = { partido: 0, entrenamiento: 1, alta: 2, apto: 3, cuota: 4, cumple: 5 };

/* ── fechas, sin librerías ─────────────────────────────────────────────────
   Todo se maneja como texto 'YYYY-MM-DD'. Comparar textos ISO es comparar
   fechas, y así no hay husos horarios que corran un evento un día para atrás,
   que es el bug clásico de `new Date('2026-03-14')` en Argentina.           */

export const soloDia = (v) => (v ? String(v).slice(0, 10) : null);

export const esDiaValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

/** Suma días a un 'YYYY-MM-DD' y devuelve otro 'YYYY-MM-DD'. */
export function sumarDias(dia, n) {
  const [a, m, d] = String(dia).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) + n * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Distancia en días entre dos 'YYYY-MM-DD' (b − a). */
export function diasEntre(a, b) {
  const [a1, m1, d1] = String(a).slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = String(b).slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

const enRango = (dia, desde, hasta) => !!dia && dia >= desde && dia <= hasta;

const nombreDe = (j) => `${j?.nombre || ''} ${j?.apellido || ''}`.trim() || 'Jugador';

/* ── cumpleaños ────────────────────────────────────────────────────────────
   Son el único evento que se repite: la fecha de nacimiento hay que
   proyectarla a los años que toca la ventana. El 29 de febrero se festeja el
   28 en los años que no son bisiestos, que es lo que hace todo el mundo.     */
export function cumpleEnRango(fechanac, desde, hasta) {
  const nac = soloDia(fechanac);
  if (!esDiaValido(nac)) return [];
  const [, mes, dia] = nac.split('-');
  const salidas = [];
  const anioDesde = Number(desde.slice(0, 4));
  const anioHasta = Number(hasta.slice(0, 4));
  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    let cand = `${anio}-${mes}-${dia}`;
    if (mes === '02' && dia === '29' && new Date(Date.UTC(anio, 1, 29)).getUTCDate() !== 29) {
      cand = `${anio}-02-28`;
    }
    if (enRango(cand, desde, hasta)) salidas.push({ dia: cand, anios: anio - Number(nac.slice(0, 4)) });
  }
  return salidas;
}

/* ── el armado ─────────────────────────────────────────────────────────── */

/**
 * Arma la agenda del club entre dos días, ambos incluidos.
 *
 * Las tablas llegan crudas y cada una se filtra acá: es a propósito, así la
 * pantalla puede pedir una ventana ancha una sola vez y después moverse sin
 * volver a bajar nada.
 */
export function construirAgenda({
  partidos = [],
  sesiones = [],
  jugadores = [],
  deudas = [],
  lesiones = [],
  desde,
  hasta,
  categoria = 'Todas',
} = {}) {
  if (!esDiaValido(desde) || !esDiaValido(hasta) || hasta < desde) return [];

  const catOk = (c) => categoria === 'Todas' || !categoria || (c || 'Sin categoría') === categoria;
  const jugPorId = new Map((jugadores || []).map((j) => [String(j.id), j]));
  const ev = [];

  /* PARTIDOS — sólo los que todavía no se jugaron o los del día. Un partido
     finalizado ya no es agenda, es historia, y vive en Resumen. */
  (partidos || []).forEach((p) => {
    const dia = soloDia(p.fecha);
    if (!enRango(dia, desde, hasta) || !catOk(p.categoria)) return;
    const local = p.condicion === 'Local';
    ev.push({
      id: `partido-${p.id}`,
      tipo: 'partido',
      fecha: dia,
      hora: p.horario ? String(p.horario).slice(0, 5) : null,
      titulo: `vs ${p.rival || 'a confirmar'}`,
      sub: [p.condicion || null, p.competicion || null, p.jornada ? `Fecha ${p.jornada}` : null, p.lugar || null]
        .filter(Boolean).join(' · '),
      categoria: p.categoria || 'Sin categoría',
      ruta: '/torneos',
      prioridad: PRIORIDAD.partido,
      meta: { local, estado: p.estado || null },
    });
  });

  /* ENTRENAMIENTOS — la sesión no tiene hora en la base, así que va sin hora
     y se ordena por prioridad debajo del partido del día. */
  (sesiones || []).forEach((s) => {
    const dia = soloDia(s.fecha);
    if (!enRango(dia, desde, hasta) || !catOk(s.categoria_equipo)) return;
    ev.push({
      id: `sesion-${s.id}`,
      tipo: 'entrenamiento',
      fecha: dia,
      hora: null,
      titulo: s.tipo_sesion || 'Entrenamiento',
      sub: [s.objetivo || null, s.nivel_carga ? `Carga ${s.nivel_carga}` : null].filter(Boolean).join(' · '),
      categoria: s.categoria_equipo || 'Sin categoría',
      ruta: '/microciclo',
      prioridad: PRIORIDAD.entrenamiento,
      meta: { tareas: Array.isArray(s.tareas_ids) ? s.tareas_ids.length : 0 },
    });
  });

  /* APTOS FÍSICOS — el día que vence. Sin esto el club se entera cuando el
     jugador no puede entrar a la cancha. */
  (jugadores || []).forEach((j) => {
    const dia = soloDia(j.vencimiento_apto);
    if (!enRango(dia, desde, hasta) || !catOk(j.categoria)) return;
    ev.push({
      id: `apto-${j.id}`,
      tipo: 'apto',
      fecha: dia,
      hora: null,
      titulo: `Vence el apto de ${nombreDe(j)}`,
      sub: 'Apto físico',
      categoria: j.categoria || 'Sin categoría',
      ruta: '/plantel',
      prioridad: PRIORIDAD.apto,
      meta: { jugadorId: j.id },
    });
  });

  /* CUMPLEAÑOS */
  (jugadores || []).forEach((j) => {
    if (!catOk(j.categoria)) return;
    cumpleEnRango(j.fechanac, desde, hasta).forEach(({ dia, anios }) => {
      ev.push({
        id: `cumple-${j.id}-${dia}`,
        tipo: 'cumple',
        fecha: dia,
        hora: null,
        titulo: `Cumple ${nombreDe(j)}`,
        sub: anios > 0 ? `${anios} años` : 'Cumpleaños',
        categoria: j.categoria || 'Sin categoría',
        ruta: '/plantel',
        prioridad: PRIORIDAD.cumple,
        meta: { jugadorId: j.id, anios },
      });
    });
  });

  /* CUOTAS — sólo las que siguen debiendo algo. La que ya se pagó no es un
     pendiente, no tiene por qué aparecer. */
  (deudas || []).forEach((d) => {
    const dia = soloDia(d.fecha_vencimiento);
    const saldo = (Number(d.monto_original) || 0) - (Number(d.monto_pagado) || 0);
    if (!enRango(dia, desde, hasta) || saldo <= 0) return;
    const j = jugPorId.get(String(d.jugador_id));
    if (j && !catOk(j.categoria)) return;
    ev.push({
      id: `cuota-${d.id}`,
      tipo: 'cuota',
      fecha: dia,
      hora: null,
      titulo: `Vence ${d.concepto || 'la cuota'}${j ? ` de ${nombreDe(j)}` : ''}`,
      sub: `Saldo $${Math.round(saldo).toLocaleString('es-AR')}`,
      categoria: j?.categoria || 'Sin categoría',
      ruta: '/tesoreria',
      prioridad: PRIORIDAD.cuota,
      meta: { saldo, jugadorId: d.jugador_id },
    });
  });

  /* ALTAS MÉDICAS ESTIMADAS — sólo de los que siguen de baja. El que ya volvió
     tiene fecha_alta_real, y su estimación dejó de importar. */
  (lesiones || []).forEach((l) => {
    const dia = soloDia(l.fecha_alta_estimada);
    if (!enRango(dia, desde, hasta)) return;
    if (l.fecha_alta_real || l.estado === 'alta') return;
    const j = jugPorId.get(String(l.jugador_id));
    if (j && !catOk(j.categoria)) return;
    ev.push({
      id: `alta-${l.id}`,
      tipo: 'alta',
      fecha: dia,
      hora: null,
      titulo: `Alta estimada de ${j ? nombreDe(j) : 'un jugador'}`,
      sub: l.diagnostico || l.tipo_lesion || 'Vuelve a estar disponible',
      categoria: j?.categoria || 'Sin categoría',
      ruta: '/enfermeria',
      prioridad: PRIORIDAD.alta,
      meta: { jugadorId: l.jugador_id },
    });
  });

  return ev.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    // Con hora primero, y entre ellos por hora. Sin hora, por prioridad.
    if (!!a.hora !== !!b.hora) return a.hora ? -1 : 1;
    if (a.hora && b.hora && a.hora !== b.hora) return a.hora < b.hora ? -1 : 1;
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    return a.titulo.localeCompare(b.titulo, 'es');
  });
}

/** Agrupa una agenda ya armada en [{ fecha, eventos }], respetando el orden. */
export function porDia(eventos) {
  const mapa = new Map();
  (eventos || []).forEach((e) => {
    if (!mapa.has(e.fecha)) mapa.set(e.fecha, []);
    mapa.get(e.fecha).push(e);
  });
  return [...mapa.entries()].map(([fecha, lista]) => ({ fecha, eventos: lista }));
}

/** Cuántos eventos hay de cada tipo, para los filtros de la pantalla. */
export function conteoPorTipo(eventos) {
  const c = {};
  ORDEN_TIPOS.forEach((t) => { c[t] = 0; });
  (eventos || []).forEach((e) => { c[e.tipo] = (c[e.tipo] || 0) + 1; });
  return c;
}
