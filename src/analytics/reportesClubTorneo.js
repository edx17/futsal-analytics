/* REPORTES DE CLUB, TORNEO Y COMPARATIVOS (cierre de año)
 *
 * Igual que los de jugador y categoría: funciones puras que devuelven
 * secciones de bloques (ver src/reportes). Usan las mismas cuentas:
 * resultados / rachas / goles de reporteCategoria, la liga de Otras
 * competencias y las métricas del reporte de jugador.
 */

import { esArquero, minimoPartidosDestacado } from './plantel';
import { cuentaParaPresentismo, cuentaComoPresente, diasDeBaja } from '../utils/disponibilidad';
import { nombreCompleto, METRICAS_CAMPO, METRICAS_ARQUERO } from './reporteJugador';
import { resultados, enLaLiga, reporteCategoria } from './reporteCategoria';

const TODAS = ['ct', 'jugador', 'directiva'];
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const fechaCorta = (f) => {
  const [, m, d] = String(f || '').slice(0, 10).split('-');
  return d && m ? `${Number(d)}/${Number(m)}` : '';
};
const efectividadDe = (res) => pct(res.filter((r) => r.res === 'G').length * 3 + res.filter((r) => r.res === 'E').length, res.length * 3);
const gep = (res) => `${res.filter((r) => r.res === 'G').length}-${res.filter((r) => r.res === 'E').length}-${res.filter((r) => r.res === 'P').length}`;

function armador(audiencia) {
  const secciones = [];
  const sumar = (id, titulo, bloques, para = TODAS) => {
    if (!para.includes(audiencia)) return;
    const b = bloques.filter(Boolean);
    if (b.length) secciones.push({ id, titulo, bloques: b });
  };
  return { secciones, sumar };
}

/* ═══ CLUB ═══════════════════════════════════════════════════════════════ */

/**
 * El año del club, todas las categorías juntas.
 * @param {object} d
 *   temporada, club { nombre, escudo }, audiencia, hasta
 *   categorias   [{ categoria, partidos, filas, liga }]  (liga: { partidos, miClub, nombre } o null)
 *   asistencias, lesiones   de la temporada
 */
export function reporteClub(d) {
  const { temporada, club = {}, audiencia = 'ct', categorias = [] } = d;
  const { secciones, sumar } = armador(audiencia);
  const porCat = categorias.map((c) => {
    const res = resultados(c.partidos);
    const liga = c.liga ? enLaLiga(c.liga.partidos, c.liga.miClub) : null;
    const usados = c.filas.filter((f) => f.jugados > 0);
    const goleador = [...usados].filter((f) => !esArquero(f.posicion)).sort((a, b) => b.goles - a.goles)[0] || null;
    const minimo = minimoPartidosDestacado(res.length);
    const figura = [...usados].filter((f) => f.jugados >= minimo && f.ratingCount).sort((a, b) => b.ratingProm - a.ratingProm)[0] || null;
    return { ...c, res, liga, usados, goleador, figura, efectividad: efectividadDe(res),
      gf: res.reduce((s, r) => s + r.gf, 0), gc: res.reduce((s, r) => s + r.gc, 0) };
  }).filter((c) => c.res.length);

  sumar('portada', club.nombre || 'El club', [{ tipo: 'portada', nombre: club.nombre || 'El club', foto: club.escudo || null,
    posicion: '', categoria: `${porCat.length} ${porCat.length === 1 ? 'categoría' : 'categorías'}`, temporada, club: 'Reporte del club', titulo: `Temporada ${temporada}` }]);
  if (!porCat.length) {
    sumar('sin', 'La temporada', [{ tipo: 'texto', texto: `Todavía no hay partidos con resultado en ${temporada}.` }]);
    return { titulo: `Reporte de ${club.nombre || 'el club'}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
  }

  const todos = porCat.flatMap((c) => c.res);
  const idsUsados = new Set(porCat.flatMap((c) => c.usados.map((f) => String(f.id))));
  sumar('numeros', 'El año del club en números', [{ tipo: 'kpis', items: [
    { rotulo: 'Partidos', valor: todos.length, detalle: `${gep(todos)} (G-E-P)` },
    { rotulo: 'Efectividad', valor: `${efectividadDe(todos)}%`, detalle: 'de los puntos en juego, todas las categorías', destacado: true },
    { rotulo: 'Goles a favor', valor: todos.reduce((s, r) => s + r.gf, 0), detalle: `${r1(todos.reduce((s, r) => s + r.gf, 0) / todos.length)} por partido` },
    { rotulo: 'Goles en contra', valor: todos.reduce((s, r) => s + r.gc, 0), detalle: `${r1(todos.reduce((s, r) => s + r.gc, 0) / todos.length)} por partido` },
    { rotulo: 'Jugadores', valor: idsUsados.size, detalle: 'jugaron al menos un partido' },
  ] }]);

  const mejor = [...porCat].sort((a, b) => b.efectividad - a.efectividad)[0];
  sumar('categorias', 'Categoría por categoría', [
    { tipo: 'tabla', columnas: ['Categoría', 'PJ', 'G-E-P', 'Efect.', 'GF-GC', 'Liga'],
      filas: porCat.map((c) => [c.categoria, c.res.length, gep(c.res), `${c.efectividad}%`, `${c.gf}-${c.gc}`, c.liga ? `${c.liga.posicion}º de ${c.liga.de}` : '–']),
      resaltarFila: porCat.indexOf(mejor) },
    { tipo: 'barras', titulo: 'Efectividad por categoría', items: porCat.map((c) => ({ rotulo: c.categoria, valor: c.efectividad, texto: `${c.efectividad}%`, tope: 100 })) },
  ]);

  const enLiga = porCat.filter((c) => c.liga);
  if (enLiga.length) {
    sumar('liga', 'En la liga', [{ tipo: 'lista', tono: 'bien', items: enLiga.map((c) => [
      `${c.categoria}: ${c.liga.posicion}º de ${c.liga.de} en el torneo regular${c.liga.zona ? ` (${c.liga.zona})` : ''}.`,
      ...c.liga.etapas.map((e) => `${c.categoria} · ${e}`),
    ]).flat() }]);
  }

  sumar('figuras', 'Las figuras de cada categoría', [{ tipo: 'tabla', columnas: ['Categoría', 'Goleador', 'Goles', 'Mejor rating', 'Rating'],
    filas: porCat.map((c) => [c.categoria, c.goleador ? nombreCompleto(c.goleador) : '–', c.goleador?.goles ?? '–',
      c.figura ? nombreCompleto(c.figura) : '–', c.figura ? r1(c.figura.ratingProm) : '–']) }]);

  // Cantera: los de otras categorías que jugaron en Primera (o en la categoría mayor del club).
  const mayor = porCat.find((c) => /primera|1ra/i.test(c.categoria)) || null;
  const juveniles = mayor ? mayor.usados.filter((f) => f.categoria && f.categoria !== mayor.categoria) : [];
  if (mayor) {
    sumar('cantera', 'Cantera', [
      { tipo: 'kpis', items: [{ rotulo: `Juveniles en ${mayor.categoria}`, valor: juveniles.length,
        detalle: juveniles.length ? `${Math.round(juveniles.reduce((s, f) => s + f.minutos, 0))} minutos entre todos` : 'ninguno sumó minutos este año', destacado: juveniles.length > 0 }] },
      juveniles.length ? { tipo: 'tabla', columnas: ['Jugador', 'Su categoría', 'PJ', 'Minutos', 'Goles'],
        filas: [...juveniles].sort((a, b) => b.minutos - a.minutos).map((f) => [nombreCompleto(f), f.categoria, f.jugados, Math.round(f.minutos), f.goles || '–']) } : null,
    ]);
  }

  const asist = (d.asistencias || []).filter((a) => cuentaParaPresentismo(a.estado));
  const presentismo = pct(asist.filter((a) => cuentaComoPresente(a.estado)).length, asist.length);
  const les = d.lesiones || [];
  const dias = les.reduce((s, x) => s + (diasDeBaja(x, d.hasta) || 0), 0);
  sumar('compromiso', 'Compromiso y salud', [{ tipo: 'kpis', items: [
    presentismo != null ? { rotulo: 'Presentismo', valor: `${presentismo}%`, detalle: `${asist.length} registros de entrenamiento` } : null,
    { rotulo: 'Lesiones', valor: les.length, detalle: les.length ? `${dias} días de baja en total` : 'ninguna en la temporada' },
    { rotulo: 'Tarjetas', valor: porCat.reduce((s, c) => s + c.filas.reduce((t, f) => t + (f.amarillas || 0) + (f.rojas || 0), 0), 0), detalle: 'amarillas y rojas, todas las categorías' },
  ].filter(Boolean) }]);

  const bien = [];
  if (mejor) bien.push(`${mejor.categoria}, la categoría con mejor efectividad: ${mejor.efectividad}%.`);
  enLiga.filter((c) => c.liga.posicion <= 3).forEach((c) => bien.push(`${c.categoria} terminó ${c.liga.posicion}º en la liga.`));
  enLiga.flatMap((c) => c.liga.etapas.filter((e) => /campe/i.test(e)).map((e) => `${c.categoria} · ${e}`)).forEach((t) => bien.push(t));
  const goleadorClub = porCat.map((c) => c.goleador).filter(Boolean).sort((a, b) => b.goles - a.goles)[0];
  if (goleadorClub) bien.push(`Goleador del club: ${nombreCompleto(goleadorClub)} (${goleadorClub.categoria}), ${goleadorClub.goles} goles.`);
  if (juveniles.length) bien.push(`${juveniles.length} juveniles sumaron minutos en ${mayor.categoria}.`);
  if (presentismo != null && presentismo >= 85) bien.push(`${presentismo}% de presentismo en todo el club.`);
  sumar('cierre', 'Para destacar', [bien.length ? { tipo: 'lista', titulo: 'Lo mejor del año', tono: 'bien', items: bien } : null]);

  return { titulo: `Reporte de ${club.nombre || 'el club'}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
}

/* ═══ TORNEO ═════════════════════════════════════════════════════════════ */

/**
 * El desarrollo de un torneo: lo del reporte de categoría (resultados,
 * rachas, goles, plantel) acotado al torneo, más primera contra segunda
 * rueda y rival por rival.
 * @param {object} d  torneo { nombre, categoria }, temporada, club, audiencia, partidos, eventos, filas,
 *                    rueda (partido) => 1 | 2 | null
 */
export function reporteTorneo(d) {
  const { torneo = {}, rueda = () => null } = d;
  const nombre = torneo.nombre || d.partidos?.[0]?.competicion || 'Torneo';
  const base = reporteCategoria({ ...d, categoria: nombre, liga: null, asistencias: [], lesiones: [] });
  const secciones = base.secciones.filter((s) => s.id !== 'compromiso');
  const portada = secciones.find((s) => s.id === 'portada');
  if (portada) portada.bloques[0] = { ...portada.bloques[0], posicion: torneo.categoria || '', categoria: torneo.categoria || '' };
  const res = resultados(d.partidos || []);
  const extra = [];

  const porRueda = [1, 2].map((n) => res.filter((r) => rueda((d.partidos || []).find((p) => p.id === r.id)) === n));
  if (porRueda[0].length && porRueda[1].length) {
    const k = (lista, n) => ({ rotulo: `${n === 1 ? 'Primera' : 'Segunda'} rueda`, valor: `${efectividadDe(lista)}%`,
      detalle: `${gep(lista)} · goles ${lista.reduce((s, r) => s + r.gf, 0)}-${lista.reduce((s, r) => s + r.gc, 0)}` });
    const [a, b] = porRueda.map(efectividadDe);
    extra.push({ id: 'ruedas', titulo: 'Primera y segunda rueda', bloques: [
      { tipo: 'kpis', items: [k(porRueda[0], 1), k(porRueda[1], 2)] },
      { tipo: 'texto', texto: b > a + 5 ? `Mejoró en la segunda rueda: de ${a}% a ${b}% de efectividad.`
        : a > b + 5 ? `Sumó menos en la segunda rueda: de ${a}% a ${b}% de efectividad.` : `Las dos ruedas fueron parejas (${a}% y ${b}%).` },
    ] });
  }

  const porRival = new Map();
  res.forEach((r) => { if (!porRival.has(r.rival)) porRival.set(r.rival, []); porRival.get(r.rival).push(r); });
  if (porRival.size) {
    extra.push({ id: 'rivales', titulo: 'Rival por rival', bloques: [{ tipo: 'tabla', columnas: ['Rival', 'Resultados', 'Puntos', 'Goles'],
      filas: [...porRival.entries()]
        .map(([rival, l]) => ({ rival, l, pts: l.reduce((s, r) => s + (r.res === 'G' ? 3 : r.res === 'E' ? 1 : 0), 0) }))
        .sort((a, b) => b.pts - a.pts || a.rival.localeCompare(b.rival))
        .map(({ rival, l, pts }) => [rival, l.map((r) => `${r.gf}-${r.gc} (${fechaCorta(r.fecha)})`).join(' · '), `${pts}/${l.length * 3}`,
          `${l.reduce((s, r) => s + r.gf, 0)}-${l.reduce((s, r) => s + r.gc, 0)}`]) }] });
  }

  const i = secciones.findIndex((s) => s.id === 'evolucion');
  secciones.splice(i >= 0 ? i + 1 : secciones.length, 0, ...extra);
  return { ...base, titulo: `Reporte de ${nombre}`, subtitulo: `${torneo.categoria ? `${torneo.categoria} · ` : ''}${d.temporada}`, secciones };
}

/* ═══ COMPARATIVO: JUGADOR CONTRA JUGADOR ════════════════════════════════ */

/**
 * Dos jugadores de la temporada, métrica por métrica.
 * @param {object} d  a, b (filas de procesarPlantel), temporada, club, audiencia
 */
export function reporteComparativo(d) {
  const { a, b, temporada, club = {}, audiencia = 'ct' } = d;
  const { secciones, sumar } = armador(audiencia);
  const nA = nombreCompleto(a); const nB = nombreCompleto(b);
  sumar('portada', `${nA} vs ${nB}`, [{ tipo: 'portada', nombre: `${a.apellido || nA} vs ${b.apellido || nB}`, foto: a.foto || null,
    posicion: [a.posicion, b.posicion].filter(Boolean).join(' / '), categoria: [...new Set([a.categoria, b.categoria].filter(Boolean))].join(' / '),
    temporada, club: club.nombre || '', titulo: `Comparativo · Temporada ${temporada}` }]);

  const arqueros = esArquero(a.posicion) && esArquero(b.posicion);
  const metricas = arqueros ? METRICAS_ARQUERO : METRICAS_CAMPO;
  const filas = [
    { rotulo: 'Partidos', va: a.jugados, vb: b.jugados, fmt: String },
    { rotulo: 'Minutos', va: Math.round(a.minutos), vb: Math.round(b.minutos), fmt: String },
    ...(arqueros ? [] : [{ rotulo: 'Goles', va: a.goles, vb: b.goles, fmt: String }, { rotulo: 'Asistencias', va: a.asistencias, vb: b.asistencias, fmt: String }]),
    ...metricas.map((m) => ({ rotulo: m.rotulo, va: Number(m.valor(a)) || 0, vb: Number(m.valor(b)) || 0, fmt: m.fmt, tope: m.tope })),
  ];
  const gana = (f) => (f.va > f.vb ? 'a' : f.vb > f.va ? 'b' : null);
  sumar('numeros', 'Cara a cara', [{ tipo: 'tabla', columnas: ['', nA, nB],
    filas: filas.map((f) => [f.rotulo, `${f.fmt(f.va)}${gana(f) === 'a' ? ' ◀' : ''}`, `${f.fmt(f.vb)}${gana(f) === 'b' ? ' ◀' : ''}`]) }]);
  sumar('barras', 'Métrica por métrica', [{ tipo: 'barras', titulo: `La barra: ${nA} · la raya: ${nB}`, leyendaReferencia: nB,
    items: metricas.map((m) => {
      const va = Number(m.valor(a)) || 0; const vb = Number(m.valor(b)) || 0;
      return { rotulo: m.rotulo, valor: va, texto: m.fmt(va), referencia: vb, textoReferencia: m.fmt(vb), tope: m.tope ?? Math.max(Math.abs(va), Math.abs(vb), 0.01) };
    }) }]);
  const ganaA = filas.filter((f) => gana(f) === 'a').map((f) => f.rotulo);
  const ganaB = filas.filter((f) => gana(f) === 'b').map((f) => f.rotulo);
  sumar('cierre', 'En resumen', [
    { tipo: 'lista', titulo: nA, tono: 'bien', items: ganaA.length ? [`Mejor en ${ganaA.length} de ${filas.length}: ${ganaA.join(', ').toLowerCase()}.`] : ['No supera en ninguna métrica.'] },
    { tipo: 'lista', titulo: nB, tono: 'bien', items: ganaB.length ? [`Mejor en ${ganaB.length} de ${filas.length}: ${ganaB.join(', ').toLowerCase()}.`] : ['No supera en ninguna métrica.'] },
    !arqueros && esArquero(a.posicion) !== esArquero(b.posicion) ? { tipo: 'texto', texto: 'Uno es arquero y el otro no: la comparación es sólo orientativa.' } : null,
  ]);
  return { titulo: `${nA} vs ${nB}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
}
