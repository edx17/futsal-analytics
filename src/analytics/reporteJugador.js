/* REPORTE DE JUGADOR (cierre de año)
 *
 * Una función pura: entran los datos de la temporada y sale el reporte como
 * secciones de bloques (portada, números, series, tablas, rankings, listas).
 * La misma salida se ve como documento (dashboard / PDF) o como presentación
 * (una sección por diapositiva): ver src/reportes.
 *
 * Los números de la temporada salen de procesarPlantel (los mismos que
 * Resumen Plantel); acá se suma lo partido a partido, la comparación con su
 * categoría y lo que no es cancha (presentismo, wellness, lesiones,
 * disciplina).
 *
 * AUDIENCIAS. Todos los reportes son para todos, con el tono de cada uno:
 *   ct         el cuerpo técnico: todo, con lo que hay que trabajar.
 *   jugador    el jugador y su familia: lo mismo dicho en positivo, sin el
 *              detalle del wellness ni los últimos puestos de los rankings.
 *   directiva  la comisión: el resumen, la evolución y el compromiso.
 */

import { calcularParticipacion } from './engine';
import { prepararRatingsPartido } from './ratingPartido';
import { calcularXGEvento } from './xg';
import { esArquero, mismoId, minimoPartidosDestacado } from './plantel';
import { cuentaParaPresentismo, cuentaComoPresente, diasDeBaja } from '../utils/disponibilidad';

export const AUDIENCIAS = [
  { id: 'ct', nombre: 'Cuerpo técnico' },
  { id: 'jugador', nombre: 'Jugador y familia' },
  { id: 'directiva', nombre: 'Comisión directiva' },
];

const TODAS = ['ct', 'jugador', 'directiva'];

/* Las áreas de la devolución (lo que escribe cada una sobre el jugador; tabla reportes_devoluciones). */
export const AREAS_DEVOLUCION = [
  { id: 'tactico', nombre: 'Desempeño táctico-técnico' },
  { id: 'fisico', nombre: 'Preparación física' },
  { id: 'nutricion', nombre: 'Nutrición' },
  { id: 'conductual', nombre: 'Desempeño conductual' },
  { id: 'medico', nombre: 'Cuerpo médico' },
  { id: 'datos', nombre: 'Análisis de datos' },
];

/* Las mediciones de Fisiología (tabla rendimiento) que van al reporte. `mas`: más es mejor. */
const MEDICIONES = [
  { id: 'cmj', rotulo: 'CMJ', unidad: 'cm', mas: true },
  { id: 'yoyo', rotulo: 'Yo-Yo', unidad: '', mas: true, de: (m) => m.y26 ?? m.y25 },
  { id: 'broad', rotulo: 'Salto horizontal', unidad: 'm', mas: true },
  { id: 'peso', rotulo: 'Peso', unidad: 'kg', mas: null },
  { id: 'musc', rotulo: 'Masa muscular', unidad: '%', mas: true },
  { id: 'adip', rotulo: 'Masa adiposa', unidad: '%', mas: false },
  { id: 'sum6', rotulo: 'Σ 6 pliegues', unidad: 'mm', mas: false },
];
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const fechaLarga = (f) => { const [y, m, d] = String(f || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : ''; };

/** Lo último de cada medición física y cuánto cambió desde la primera de la temporada. */
export function fisicoDelJugador(mediciones = []) {
  const orden = [...mediciones].filter((m) => m?.fecha_medicion).sort((a, b) => String(a.fecha_medicion).localeCompare(String(b.fecha_medicion)));
  return MEDICIONES.map((def) => {
    const valores = orden.map((m) => ({ f: m.fecha_medicion, v: num(def.de ? def.de(m) : m[def.id]) })).filter((x) => x.v != null);
    if (!valores.length) return null;
    const ult = valores[valores.length - 1];
    const pri = valores[0];
    const dif = valores.length > 1 ? Math.round((ult.v - pri.v) * 100) / 100 : null;
    const mejora = dif == null || dif === 0 || def.mas == null ? null : (dif > 0) === def.mas;
    return {
      id: def.id, rotulo: def.rotulo, valor: `${ult.v}${def.unidad && def.unidad !== '%' ? ` ${def.unidad}` : def.unidad}`,
      detalle: dif != null && dif !== 0 ? `${dif > 0 ? '+' : ''}${dif}${def.unidad === '%' ? ' pts' : def.unidad ? ` ${def.unidad}` : ''} desde el ${fechaCorta(pri.f)}` : `medido el ${fechaCorta(ult.f)}`,
      mejora,
    };
  }).filter(Boolean);
}
const esGol = (ev) => ev?.accion === 'Gol' || ev?.accion === 'Remate - Gol';
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const prom = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
export const nombreCompleto = (j) => [j?.nombre, j?.apellido].filter(Boolean).join(' ') || 'Jugador';
const fechaCorta = (f) => {
  const [, m, d] = String(f || '').slice(0, 10).split('-');
  return d && m ? `${Number(d)}/${Number(m)}` : '';
};

/**
 * Lo partido a partido del jugador: en qué partidos jugó, con su nota, goles,
 * asistencias, xG y la participación (% del partido en cancha).
 */
export function partidosDelJugador(jugador, partidos = [], eventos = []) {
  const sid = String(jugador.id);
  const porPartido = new Map();
  eventos.forEach((ev) => {
    if (!porPartido.has(ev.id_partido)) porPartido.set(ev.id_partido, []);
    porPartido.get(ev.id_partido).push(ev);
  });
  return [...partidos]
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
    .map((p) => {
      const evs = porPartido.get(p.id) || [];
      if (!evs.length) return null;
      const part = calcularParticipacion(evs)[sid];
      const propios = evs.filter((e) => mismoId(e.id_jugador, sid) && e.equipo !== 'Rival');
      const jugo = !!part?.presente || propios.length > 0;
      if (!jugo) return null;
      const ratings = prepararRatingsPartido(evs);
      const rating = Number(ratings.rating(jugador));
      const goles = propios.filter(esGol).length;
      const asistencias = evs.filter((e) => mismoId(e.id_asistencia, sid) && esGol(e)).length;
      const xg = propios.filter((e) => String(e.accion || '').startsWith('Remate')).reduce((s, e) => s + (calcularXGEvento(e) || 0), 0);
      const gp = Number(p.goles_propios); const gr = Number(p.goles_rival);
      const resultado = Number.isFinite(gp) && Number.isFinite(gr) ? (gp > gr ? 'G' : gp < gr ? 'P' : 'E') : null;
      return {
        id: p.id, fecha: String(p.fecha || '').slice(0, 10), rival: p.rival || 'Rival', competicion: p.competicion || '',
        marcador: Number.isFinite(gp) && Number.isFinite(gr) ? `${gp}-${gr}` : '', resultado,
        rating: Number.isFinite(rating) ? r1(rating) : null, goles, asistencias, xg: r1(xg),
        participacion: Math.round(part?.pct || 0),
      };
    })
    .filter(Boolean);
}

/* Qué se compara con los compañeros. `por`: por partido jugado. */
export const METRICAS_CAMPO = [
  { id: 'rating', rotulo: 'Rating promedio', valor: (f) => f.ratingProm, fmt: r1, tope: 10 },
  { id: 'goles', rotulo: 'Goles por partido', valor: (f) => f.gPorPJ, fmt: (v) => v.toFixed(2) },
  { id: 'asist', rotulo: 'Asistencias por partido', valor: (f) => f.aPorPJ, fmt: (v) => v.toFixed(2) },
  { id: 'xg', rotulo: 'xG por partido', valor: (f) => (f.jugados ? f.xg / f.jugados : 0), fmt: (v) => v.toFixed(2) },
  { id: 'pases', rotulo: 'Pases clave por partido', valor: (f) => (f.jugados ? f.pasesClave / f.jugados : 0), fmt: (v) => v.toFixed(1) },
  { id: 'rec', rotulo: 'Recuperaciones por partido', valor: (f) => (f.jugados ? f.rec / f.jugados : 0), fmt: (v) => v.toFixed(1) },
  { id: 'def', rotulo: 'Duelos defensivos ganados', valor: (f) => f.defPct, fmt: (v) => `${Math.round(v)}%`, minimo: (f) => f.duelDefTot >= 5, tope: 100 },
  { id: 'ofe', rotulo: 'Duelos ofensivos ganados', valor: (f) => f.ofePct, fmt: (v) => `${Math.round(v)}%`, minimo: (f) => f.duelOfeTot >= 5, tope: 100 },
  { id: 'min', rotulo: 'Minutos jugados (% posible)', valor: (f) => f.pctMin, fmt: (v) => `${Math.round(v)}%`, tope: 100 },
];
export const METRICAS_ARQUERO = [
  { id: 'rating', rotulo: 'Rating promedio', valor: (f) => f.ratingProm, fmt: r1, tope: 10 },
  { id: 'atajadas', rotulo: 'Atajadas (% de remates al arco)', valor: (f) => f.pctAtajadas, fmt: (v) => `${Math.round(v)}%`, minimo: (f) => f.atajadas + f.golesRecibidos >= 5, tope: 100 },
  { id: 'evitables', rotulo: 'Goles evitados (xG − recibidos)', valor: (f) => f.golesEvitables, fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) },
  { id: 'min', rotulo: 'Minutos jugados (% posible)', valor: (f) => f.pctMin, fmt: (v) => `${Math.round(v)}%`, tope: 100 },
];

/**
 * Su lugar entre los compañeros de la categoría (los que jugaron lo
 * suficiente, como en los destacados de Resumen Plantel).
 * @returns {Array<{ id, rotulo, valor, texto, promedio, textoPromedio, puesto, de, percentil }>}
 */
export function compararConCategoria(fila, companeros = [], partidosEquipo = 0) {
  const metricas = esArquero(fila.posicion) ? METRICAS_ARQUERO : METRICAS_CAMPO;
  const minimo = minimoPartidosDestacado(partidosEquipo);
  const pares = companeros.filter((c) => esArquero(c.posicion) === esArquero(fila.posicion) && c.jugados >= minimo);
  if (!pares.some((c) => mismoId(c.id, fila.id))) pares.push(fila);
  return metricas
    .filter((m) => !m.minimo || m.minimo(fila))
    .map((m) => {
      const validos = pares.filter((c) => !m.minimo || m.minimo(c));
      const valores = validos.map((c) => Number(m.valor(c)) || 0).sort((a, b) => b - a);
      const v = Number(m.valor(fila)) || 0;
      const puesto = valores.findIndex((x) => x <= v) + 1 || valores.length;
      const de = valores.length;
      const media = prom(valores) ?? 0;
      return {
        id: m.id, rotulo: m.rotulo, valor: v, texto: m.fmt(v), promedio: media, textoPromedio: m.fmt(media),
        // La escala de la barra: la propia de la métrica (10, 100%) o el mejor de la categoría.
        tope: m.tope ?? Math.max(...valores.map(Math.abs), Math.abs(v), 0.01),
        puesto, de, percentil: de > 1 ? Math.round(((de - puesto) / (de - 1)) * 100) : 100,
      };
    });
}

/** Lo que no es cancha: presentismo, wellness, lesiones, disciplina. */
export function compromisoDelJugador({ jugadorId, asistencias = [], wellness = [], lesiones = [], sanciones = [], fila = null, hasta }) {
  const mias = asistencias.filter((a) => mismoId(a.jugador_id, jugadorId) && cuentaParaPresentismo(a.estado));
  const presentes = mias.filter((a) => cuentaComoPresente(a.estado)).length;
  const w = wellness.filter((x) => mismoId(x.jugador_id, jugadorId));
  const wProm = (k) => { const xs = w.map((x) => Number(x[k])).filter(Number.isFinite); return xs.length ? r1(prom(xs)) : null; };
  const les = lesiones.filter((l) => mismoId(l.jugador_id, jugadorId));
  const sanc = sanciones.filter((s) => mismoId(s.jugador_id, jugadorId));
  return {
    entrenamientos: mias.length,
    presentes,
    presentismo: pct(presentes, mias.length),
    wellnessCargados: w.length,
    readiness: wProm('readiness_score'),
    sueno: wProm('sueno'), fatiga: wProm('fatiga'), animo: wProm('animo'),
    lesiones: les.length,
    diasDeBaja: les.reduce((s, l) => s + (diasDeBaja(l, hasta) || 0), 0),
    amarillas: fila?.amarillas || 0,
    rojas: fila?.rojas || 0,
    sanciones: sanc.length,
  };
}

/**
 * El reporte completo.
 * @param {object} d
 *   jugador     la fila de jugadores
 *   fila        su fila de procesarPlantel (jugadoresProc o arquerosProc)
 *   companeros  las filas de procesarPlantel de su categoría
 *   partidos, eventos   los de la temporada (ya filtrados por categoría y año)
 *   asistencias, wellness, lesiones, sanciones
 *   temporada   el año ("2026")
 *   club        { nombre, escudo }
 *   audiencia   'ct' | 'jugador' | 'directiva'
 *   hasta       fecha de corte (YYYY-MM-DD) para los días de baja
 * @returns {{ titulo, subtitulo, audiencia, secciones: Array<{ id, titulo, bloques }> }}
 */
/* Ficha técnica: puesto, perfil, nacimiento y condición (propio / a préstamo). */
function fichaTecnica(jugador, ficha = {}) {
  const items = [
    ['Posición', jugador.posicion],
    ['Perfil', ficha.pierna || jugador.pierna],
    ['Fecha de nacimiento', fechaLarga(jugador.fechanac)],
    ['Condición', ficha.condicion],
  ].filter(([, v]) => v);
  return items.length ? { tipo: 'ficha', titulo: 'Ficha técnica', items: items.map(([rotulo, valor]) => ({ rotulo, valor: String(valor) })) } : null;
}

/* Preparación física (Fisiología): lo último de cada medición y cuánto cambió. */
function sumarFisico(sumar, d) {
  const fis = fisicoDelJugador(d.fisico || []);
  if (fis.length) {
    sumar('fisico', 'Preparación física', [{ tipo: 'kpis', items: fis.map((m) => ({ rotulo: m.rotulo, valor: m.valor, detalle: m.detalle, tono: m.mejora == null ? null : m.mejora ? 'bien' : 'trabajo' })) }]);
  }
}

/* Lo primero del reporte, después de la portada: 01 la devolución de cada área y 02 el staff. */
function sumarDevolucion(sumar, d) {
  const textos = d.devolucion || {};
  const areas = AREAS_DEVOLUCION.map((a) => ({ ...a, texto: String(textos[a.id]?.texto || '').trim(), autor: textos[a.id]?.autor_nombre || '' }))
    .filter((a) => a.texto || d.aMano);
  if (areas.length) {
    sumar('devolucion', 'Devolución de la temporada', [{ tipo: 'devolucion', items: areas.map((a) => ({ titulo: a.nombre, texto: a.texto, autor: a.autor, vacio: !a.texto })) }]);
  }
  const staff = (d.staff || []).filter((x) => x && (x.nombre || '').trim());
  if (staff.length) sumar('staff', 'Staff y cuerpo técnico', [{ tipo: 'staff', items: staff.map((x) => ({ cargo: String(x.cargo || '').trim(), nombre: String(x.nombre).trim() })) }]);
}

export function reporteJugador(d) {
  const { jugador, fila, companeros = [], partidos = [], eventos = [], temporada, club = {}, audiencia = 'ct' } = d;
  const arquero = esArquero(fila?.posicion || jugador?.posicion);
  const nombre = nombreCompleto(jugador);
  const pj = partidosDelJugador(jugador, partidos, eventos);
  const partidosEquipo = partidos.length;
  const comp = fila ? compararConCategoria(fila, companeros, partidosEquipo) : [];
  const comprom = compromisoDelJugador({ jugadorId: jugador.id, ...d, fila });
  const conNota = pj.filter((p) => p.rating != null);

  const secciones = [];
  const sumar = (id, titulo, bloques, para = TODAS) => {
    if (!para.includes(audiencia)) return;
    const b = bloques.filter(Boolean);
    if (b.length) secciones.push({ id, titulo, bloques: b });
  };

  sumar('portada', nombre, [{
    tipo: 'portada', nombre, dorsal: jugador.dorsal ?? null, posicion: jugador.posicion || '', categoria: jugador.categoria || '',
    foto: jugador.foto || null, temporada, club: club.nombre || '', escudo: club.escudo || null,
    titulo: `Temporada ${temporada}`,
  }, fichaTecnica(jugador, d.ficha)]);
  sumarDevolucion(sumar, d);

  if (!fila || !fila.jugados) {
    sumar('sin', 'La temporada', [{ tipo: 'texto', texto: `${nombre} todavía no tiene partidos con datos cargados en ${temporada}.` }]);
    sumarFisico(sumar, d);
    return { titulo: `Reporte de ${nombre}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
  }

  const kpis = arquero ? [
    { rotulo: 'Partidos', valor: fila.jugados, detalle: `${fila.titularidades} de titular` },
    { rotulo: 'Minutos', valor: Math.round(fila.minutos), detalle: `${Math.round(fila.pctMin)}% de lo posible` },
    { rotulo: 'Atajadas', valor: fila.atajadas, detalle: `${Math.round(fila.pctAtajadas)}% de los remates al arco` },
    { rotulo: 'Goles recibidos', valor: fila.golesRecibidos, detalle: `${r1(fila.golesRecibidos / fila.jugados)} por partido` },
    { rotulo: 'Goles evitados', valor: (fila.golesEvitables > 0 ? '+' : '') + r1(fila.golesEvitables), detalle: 'xG en contra − goles recibidos' },
    { rotulo: 'Rating', valor: r1(fila.ratingProm), detalle: `promedio en ${fila.ratingCount} partidos`, destacado: true },
  ] : [
    { rotulo: 'Partidos', valor: fila.jugados, detalle: `${fila.titularidades} de titular` },
    { rotulo: 'Minutos', valor: Math.round(fila.minutos), detalle: `${Math.round(fila.pctMin)}% de lo posible` },
    { rotulo: 'Goles', valor: fila.goles, detalle: `${fila.gPorPJ.toFixed(2)} por partido` },
    { rotulo: 'Asistencias', valor: fila.asistencias, detalle: `${fila.aPorPJ.toFixed(2)} por partido` },
    { rotulo: 'xG', valor: r1(fila.xg), detalle: fila.goles > fila.xg + 1 ? 'convirtió más de lo esperado' : fila.goles < fila.xg - 1 ? 'convirtió menos de lo esperado' : 'en línea con lo esperado' },
    { rotulo: 'Rating', valor: r1(fila.ratingProm), detalle: `promedio en ${fila.ratingCount} partidos`, destacado: true },
  ];
  if (audiencia !== 'jugador' || fila.pmProm >= 0) {
    kpis.push({ rotulo: '+/− por partido', valor: (fila.pmProm > 0 ? '+' : '') + r1(fila.pmProm), detalle: 'goles a favor − en contra con él en cancha' });
  }
  sumar('numeros', 'La temporada en números', [{ tipo: 'kpis', items: kpis }]);

  // Partido a partido.
  const serie = conNota.map((p) => ({ x: fechaCorta(p.fecha), y: p.rating, rival: p.rival, goles: p.goles, asistencias: p.asistencias, resultado: p.resultado }));
  const mitad = Math.floor(conNota.length / 2);
  const antes = prom(conNota.slice(0, mitad).map((p) => p.rating));
  const despues = prom(conNota.slice(mitad).map((p) => p.rating));
  const tendencia = conNota.length >= 6 && antes != null && despues != null
    ? (despues - antes >= 0.3 ? `Terminó mejor de lo que empezó: ${r1(antes)} de promedio en la primera mitad y ${r1(despues)} en la segunda.`
      : antes - despues >= 0.3 ? `Arrancó mejor de lo que terminó: ${r1(antes)} de promedio en la primera mitad y ${r1(despues)} en la segunda.`
        : `Fue parejo toda la temporada: ${r1(antes)} y ${r1(despues)} de promedio en cada mitad.`)
    : null;
  sumar('evolucion', 'Partido a partido', [
    serie.length > 1 ? { tipo: 'serie', titulo: 'Rating de cada partido', puntos: serie, promedio: r1(fila.ratingProm), min: 4, max: 10 } : null,
    tendencia ? { tipo: 'texto', texto: tendencia } : null,
  ]);

  // Sus mejores partidos.
  const mejores = [...conNota].sort((a, b) => b.rating - a.rating || b.goles - a.goles).slice(0, 5);
  sumar('mejores', 'Sus mejores partidos', [mejores.length > 0 && {
    tipo: 'tabla',
    columnas: arquero ? ['Fecha', 'Rival', 'Resultado', 'Rating'] : ['Fecha', 'Rival', 'Resultado', 'Goles', 'Asist.', 'Rating'],
    filas: mejores.map((p) => (arquero
      ? [fechaCorta(p.fecha), p.rival, p.marcador, p.rating]
      : [fechaCorta(p.fecha), p.rival, p.marcador, p.goles || '–', p.asistencias || '–', p.rating])),
    resaltarUltima: true,
  }]);

  // Cómo juega (en barras, contra el promedio de su categoría).
  if (comp.length) {
    sumar('comparacion', 'En su categoría', [
      { tipo: 'barras', titulo: `Comparado con el promedio de ${jugador.categoria || 'su categoría'}`, items: comp.map((c) => ({ rotulo: c.rotulo, valor: c.valor, texto: c.texto, referencia: c.promedio, textoReferencia: c.textoPromedio, tope: c.tope })) },
      { tipo: 'ranking', items: comp.filter((c) => audiencia === 'ct' || c.percentil >= 50).map((c) => ({ rotulo: c.rotulo, puesto: c.puesto, de: c.de, percentil: c.percentil })) },
    ]);
  }

  // Compromiso y salud.
  const k2 = [
    comprom.presentismo != null ? { rotulo: 'Presentismo', valor: `${comprom.presentismo}%`, detalle: `${comprom.presentes} de ${comprom.entrenamientos} entrenamientos` } : null,
    audiencia !== 'directiva' && comprom.wellnessCargados ? { rotulo: 'Wellness cargados', valor: comprom.wellnessCargados, detalle: comprom.readiness != null ? `disposición promedio ${comprom.readiness}` : '' } : null,
    { rotulo: 'Lesiones', valor: comprom.lesiones, detalle: comprom.lesiones ? `${comprom.diasDeBaja} días de baja` : 'ninguna en la temporada' },
    { rotulo: 'Tarjetas', valor: comprom.amarillas + comprom.rojas, detalle: `${comprom.amarillas} amarillas · ${comprom.rojas} rojas` },
  ];
  sumar('compromiso', 'Compromiso y salud', [
    comprom.presentismo != null ? { tipo: 'franja', rotulo: 'Asistencia', valor: `${comprom.presentismo}%`, detalle: `${comprom.presentes} de ${comprom.entrenamientos} entrenamientos` } : null,
    { tipo: 'kpis', items: k2.filter(Boolean).filter((k) => k.rotulo !== 'Presentismo') },
  ]);
  if (audiencia === 'ct' && comprom.wellnessCargados >= 5) {
    sumar('wellness', 'Wellness', [{
      tipo: 'barras', titulo: 'Promedios de la temporada (1 a 5)', escala: 5,
      items: [['Sueño', comprom.sueno], ['Fatiga', comprom.fatiga], ['Ánimo', comprom.animo]]
        .filter(([, v]) => v != null).map(([rotulo, v]) => ({ rotulo, valor: v, texto: String(v) })),
    }]);
  }

  // Para destacar y para trabajar.
  // Lo más fuerte primero, y no más de cuatro: una lista larga no destaca nada.
  const fuertes = comp.filter((c) => c.de >= 3 && c.percentil >= 75 && c.id !== 'min')
    .sort((a, b) => a.puesto - b.puesto || b.percentil - a.percentil).slice(0, 4)
    .map((c) => `${c.rotulo}: ${c.texto} (${c.puesto}º de ${c.de} en su categoría).`);
  const flojos = comp.filter((c) => c.de >= 3 && c.percentil <= 25 && c.id !== 'min').map((c) => (audiencia === 'ct'
    ? `${c.rotulo}: ${c.texto} contra ${c.textoPromedio} de promedio.`
    : `${c.rotulo}: tiene margen para crecer (${c.texto}; el promedio es ${c.textoPromedio}).`));
  if (mejores[0]) fuertes.push(`Su mejor partido: ${mejores[0].rating} contra ${mejores[0].rival} (${fechaCorta(mejores[0].fecha)}).`);
  if (comprom.presentismo != null && comprom.presentismo >= 85) fuertes.push(`Compromiso: ${comprom.presentismo}% de presentismo en los entrenamientos.`);
  sumar('cierre', audiencia === 'directiva' ? 'Para destacar' : 'Para destacar y para seguir creciendo', [
    fuertes.length ? { tipo: 'lista', titulo: 'Lo mejor de su temporada', tono: 'bien', items: fuertes } : null,
    audiencia !== 'directiva' && flojos.length ? { tipo: 'lista', titulo: audiencia === 'ct' ? 'Para trabajar' : 'Para el año que viene', tono: 'trabajo', items: flojos } : null,
  ]);

  sumarFisico(sumar, d);

  return { titulo: `Reporte de ${nombre}`, subtitulo: `Temporada ${temporada}${jugador.categoria ? ` · ${jugador.categoria}` : ''}`, audiencia, secciones };
}
