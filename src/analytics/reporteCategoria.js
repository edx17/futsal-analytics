/* REPORTE DE CATEGORÍA (cierre de año)
 *
 * Como el de jugador: una función pura que devuelve secciones de bloques
 * (ver reporteJugador.js y src/reportes). Arma la temporada de una categoría:
 * resultados, rachas, cuándo y cómo llegan los goles, el plantel, la liga y
 * el compromiso del grupo.
 *
 * AUDIENCIAS: ct (todo, con lo que hay que trabajar), jugador (el plantel y
 * las familias: en positivo) y directiva (el resumen).
 */

import { relojDelPartido } from './engine';
import { calcularXGEvento } from './xg';
import { esArquero, mismoId, minimoPartidosDestacado } from './plantel';
import { tablaPosiciones, soloRegular, etapasDe, esMiEquipo, zonasDe } from './liga';
import { cuentaParaPresentismo, cuentaComoPresente, diasDeBaja } from '../utils/disponibilidad';
import { nombreCompleto } from './reporteJugador';

const TODAS = ['ct', 'jugador', 'directiva'];
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
const esGol = (ev) => ev?.accion === 'Gol' || ev?.accion === 'Remate - Gol';
const esRival = (ev) => ev?.equipo === 'Rival' || ev?.is_rival;
const fechaCorta = (f) => {
  const [, m, d] = String(f || '').slice(0, 10).split('-');
  return d && m ? `${Number(d)}/${Number(m)}` : '';
};

/** Los partidos jugados (con resultado), en orden, con G/E/P y la diferencia. */
export function resultados(partidos = []) {
  return [...partidos]
    .filter((p) => Number.isFinite(Number(p.goles_propios)) && Number.isFinite(Number(p.goles_rival))
      && p.goles_propios !== null && p.goles_rival !== null)
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
    .map((p) => {
      const gf = Number(p.goles_propios); const gc = Number(p.goles_rival);
      // Un empate definido por penales sigue siendo empate en los números.
      return { id: p.id, fecha: String(p.fecha || '').slice(0, 10), rival: p.rival || 'Rival', condicion: p.condicion || '', competicion: p.competicion || '',
        gf, gc, dg: gf - gc, res: gf > gc ? 'G' : gf < gc ? 'P' : 'E' };
    });
}

/** La racha más larga que cumple `cumple` (con desde y hasta). */
export function rachaMasLarga(lista, cumple) {
  let mejor = { n: 0 }; let actual = { n: 0 };
  lista.forEach((r) => {
    if (cumple(r)) { actual = { n: actual.n + 1, desde: actual.n ? actual.desde : r.fecha, hasta: r.fecha }; if (actual.n > mejor.n) mejor = actual; }
    else actual = { n: 0 };
  });
  return mejor;
}

/** Los goles por tramo de 10 minutos y por origen, a favor y en contra. */
export function golesDelEquipo(partidos = [], eventos = []) {
  const ids = new Set(partidos.map((p) => p.id));
  const porPartido = new Map();
  eventos.forEach((ev) => {
    if (!ids.has(ev.id_partido)) return;
    if (!porPartido.has(ev.id_partido)) porPartido.set(ev.id_partido, []);
    porPartido.get(ev.id_partido).push(ev);
  });
  const TRAMOS = ['0-10', '10-20', '20-30', '30-40', 'Alargue'];
  const tramos = TRAMOS.map((t) => ({ tramo: t, favor: 0, contra: 0 }));
  const origen = { favor: {}, contra: {} };
  let xgFavor = 0; let xgContra = 0;
  porPartido.forEach((evs) => {
    const reloj = relojDelPartido(evs);
    evs.forEach((ev) => {
      if (String(ev.accion || '').startsWith('Remate')) {
        const x = calcularXGEvento(ev) || 0;
        if (esRival(ev)) xgContra += x; else xgFavor += x;
      }
      if (!esGol(ev)) return;
      const lado = esRival(ev) ? 'contra' : 'favor';
      const m = reloj(ev);
      tramos[Math.min(4, Math.max(0, Math.floor(m / 10)))][lado] += 1;
      const o = String(ev.origen_gol || 'No especificado').split('|')[0].trim() || 'No especificado';
      origen[lado][o] = (origen[lado][o] || 0) + 1;
    });
  });
  const lista = (obj) => Object.entries(obj).map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n);
  return {
    tramos: tramos.filter((t) => t.tramo !== 'Alargue' || t.favor || t.contra),
    origenFavor: lista(origen.favor), origenContra: lista(origen.contra),
    xgFavor: r1(xgFavor), xgContra: r1(xgContra), conEventos: porPartido.size,
  };
}

/**
 * Cómo le fue en la liga (Otras competencias): su posición en la tabla del
 * regular (en su zona si hay) y hasta dónde llegó en cada etapa.
 */
export function enLaLiga(partidosLiga = [], miClub = '') {
  if (!partidosLiga.length || !miClub) return null;
  const regular = soloRegular(partidosLiga);
  const zonas = zonasDe(regular);
  const zona = zonas.find((z) => [...z.equipos].some((e) => esMiEquipo(e, miClub))) || null;
  const tabla = tablaPosiciones(zona ? zona.partidos : regular);
  const mia = tabla.find((t) => esMiEquipo(t.equipo, miClub));
  if (!mia) return null;
  const etapas = etapasDe(partidosLiga).map((e) => {
    const cruces = e.cuadro.flatMap((f) => f.cruces.filter((c) => c.equipos.some((q) => esMiEquipo(q, miClub))).map((c) => ({ ...c, fase: f.fase })));
    const ultimo = cruces.at(-1);
    const enTabla = e.tablas.map((t) => ({ grupo: t.grupo, fila: t.filas.find((f) => esMiEquipo(f.equipo, miClub)), de: t.filas.length })).find((t) => t.fila);
    if (!ultimo && !enTabla) return null;
    let texto;
    if (ultimo) {
      const paso = ultimo.pasa && esMiEquipo(ultimo.pasa, miClub);
      const quedo = ultimo.pasa && !paso;
      texto = /^final$/i.test(ultimo.fase) && paso ? `${e.nombre}: ¡campeón!`
        : quedo ? `${e.nombre}: llegó a ${ultimo.fase.toLowerCase()}`
          : `${e.nombre}: en ${ultimo.fase.toLowerCase()}`;
    } else {
      texto = `${e.nombre}: ${enTabla.fila.pos}º de ${enTabla.de}${enTabla.grupo ? ` (${enTabla.grupo})` : ''}`;
    }
    return texto;
  }).filter(Boolean);
  return { posicion: mia.pos, de: tabla.length, fila: mia, tabla, zona: zona?.zona || null, etapas };
}

/**
 * El reporte de la categoría.
 * @param {object} d
 *   categoria, temporada, club { nombre, escudo }, audiencia
 *   partidos, eventos           los de la categoría en la temporada
 *   filas                       procesarPlantel de la categoría (campo + arqueros)
 *   asistencias, lesiones       de la temporada (se filtran por los jugadores de la categoría)
 *   liga                        { partidos, miClub, nombre } o null
 *   hasta                       fecha de corte para los días de baja
 */
export function reporteCategoria(d) {
  const { categoria, temporada, club = {}, audiencia = 'ct', partidos = [], eventos = [], filas = [], liga = null } = d;
  const res = resultados(partidos);
  const secciones = [];
  const sumar = (id, titulo, bloques, para = TODAS) => {
    if (!para.includes(audiencia)) return;
    const b = bloques.filter(Boolean);
    if (b.length) secciones.push({ id, titulo, bloques: b });
  };

  sumar('portada', categoria, [{ tipo: 'portada', nombre: categoria, posicion: '', categoria: club.nombre || '', foto: club.escudo || null,
    temporada, club: club.nombre || '', titulo: `Temporada ${temporada}`, escudo: null }]);

  if (!res.length) {
    sumar('sin', 'La temporada', [{ tipo: 'texto', texto: `${categoria} todavía no tiene partidos con resultado en ${temporada}.` }]);
    return { titulo: `Reporte de ${categoria}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
  }

  // ── Los números ───────────────────────────────────────────────────────
  const g = res.filter((r) => r.res === 'G').length;
  const e = res.filter((r) => r.res === 'E').length;
  const p = res.filter((r) => r.res === 'P').length;
  const gf = res.reduce((s, r) => s + r.gf, 0);
  const gc = res.reduce((s, r) => s + r.gc, 0);
  const vallas = res.filter((r) => r.gc === 0).length;
  const efectividad = pct(g * 3 + e, res.length * 3);
  sumar('numeros', 'La temporada en números', [{ tipo: 'kpis', items: [
    { rotulo: 'Partidos', valor: res.length, detalle: `${g} G · ${e} E · ${p} P` },
    { rotulo: 'Efectividad', valor: `${efectividad}%`, detalle: 'de los puntos en juego', destacado: true },
    { rotulo: 'Goles a favor', valor: gf, detalle: `${r1(gf / res.length)} por partido` },
    { rotulo: 'Goles en contra', valor: gc, detalle: `${r1(gc / res.length)} por partido` },
    { rotulo: 'Diferencia', valor: (gf - gc > 0 ? '+' : '') + (gf - gc), detalle: 'goles a favor − en contra' },
    { rotulo: 'Vallas invictas', valor: vallas, detalle: vallas === 1 ? 'partido sin goles en contra' : 'partidos sin goles en contra' },
  ] }]);

  // ── Partido a partido y rachas ────────────────────────────────────────
  const tope = Math.max(3, ...res.map((r) => Math.abs(r.dg)));
  const ganadora = rachaMasLarga(res, (r) => r.res === 'G');
  const invicta = rachaMasLarga(res, (r) => r.res !== 'P');
  const sinGanar = rachaMasLarga(res, (r) => r.res !== 'G');
  const localia = (cond) => {
    const l = res.filter((r) => (cond === 'Local' ? /local/i.test(r.condicion) : /visit/i.test(r.condicion)));
    return l.length ? { n: l.length, efectividad: pct(l.filter((r) => r.res === 'G').length * 3 + l.filter((r) => r.res === 'E').length, l.length * 3) } : null;
  };
  const local = localia('Local'); const visit = localia('Visitante');
  const mitad = Math.floor(res.length / 2);
  const ef = (l) => pct(l.filter((r) => r.res === 'G').length * 3 + l.filter((r) => r.res === 'E').length, l.length * 3);
  const tendencia = res.length >= 6
    ? (() => {
      const a = ef(res.slice(0, mitad)); const b = ef(res.slice(mitad));
      if (b - a >= 10) return `El equipo creció en el año: ${a}% de efectividad en la primera mitad y ${b}% en la segunda.`;
      if (a - b >= 10) return `El equipo arrancó mejor de lo que terminó: ${a}% de efectividad en la primera mitad y ${b}% en la segunda.`;
      return `Fue parejo todo el año: ${a}% y ${b}% de efectividad en cada mitad.`;
    })() : null;
  sumar('evolucion', 'Partido a partido', [
    { tipo: 'serie', titulo: 'Diferencia de gol de cada partido', puntos: res.map((r) => ({ x: fechaCorta(r.fecha), y: r.dg, rival: `${r.rival} (${r.gf}-${r.gc})`, resultado: r.res })),
      min: -tope, max: tope, referencia: 0, etiquetaReferencia: 'empate', marcarGoles: false },
    tendencia ? { tipo: 'texto', texto: tendencia } : null,
    { tipo: 'kpis', items: [
      ganadora.n ? { rotulo: 'Racha ganadora', valor: ganadora.n, detalle: `partidos seguidos (${fechaCorta(ganadora.desde)} a ${fechaCorta(ganadora.hasta)})` } : null,
      invicta.n ? { rotulo: 'Racha invicta', valor: invicta.n, detalle: `sin perder (${fechaCorta(invicta.desde)} a ${fechaCorta(invicta.hasta)})` } : null,
      audiencia === 'ct' && sinGanar.n >= 2 ? { rotulo: 'Racha sin ganar', valor: sinGanar.n, detalle: `(${fechaCorta(sinGanar.desde)} a ${fechaCorta(sinGanar.hasta)})` } : null,
      local ? { rotulo: 'De local', valor: `${local.efectividad}%`, detalle: `efectividad en ${local.n} partidos` } : null,
      visit ? { rotulo: 'De visitante', valor: `${visit.efectividad}%`, detalle: `efectividad en ${visit.n} partidos` } : null,
    ].filter(Boolean) },
  ]);

  // ── Los goles ─────────────────────────────────────────────────────────
  const goles = golesDelEquipo(partidos, eventos);
  if (goles.conEventos) {
    const topeTramo = Math.max(1, ...goles.tramos.map((t) => Math.max(t.favor, t.contra)));
    sumar('goles', 'Cuándo y cómo llegan los goles', [
      { tipo: 'barras', titulo: 'Goles a favor por tramo del partido (la raya: en contra)',
        items: goles.tramos.map((t) => ({ rotulo: `Minutos ${t.tramo}`, valor: t.favor, texto: String(t.favor), referencia: t.contra, textoReferencia: String(t.contra), tope: topeTramo })),
        leyendaReferencia: 'goles en contra' },
      goles.origenFavor.length ? { tipo: 'barras', titulo: 'Cómo hicimos los goles', items: goles.origenFavor.slice(0, 6).map((o) => ({ rotulo: o.nombre, valor: o.n, texto: String(o.n) })) } : null,
      audiencia !== 'jugador' && goles.origenContra.length ? { tipo: 'barras', titulo: 'Cómo nos hicieron los goles', items: goles.origenContra.slice(0, 6).map((o) => ({ rotulo: o.nombre, valor: o.n, texto: String(o.n) })) } : null,
      { tipo: 'kpis', items: [
        { rotulo: 'xG a favor', valor: goles.xgFavor, detalle: `${gf} goles hechos` },
        { rotulo: 'xG en contra', valor: goles.xgContra, detalle: `${gc} goles recibidos` },
      ] },
    ], audiencia === 'directiva' ? [] : TODAS);
  }

  // ── El plantel ────────────────────────────────────────────────────────
  const minimo = minimoPartidosDestacado(res.length);
  const top = (lista, valor, n = 5) => [...lista].filter((f) => valor(f) > 0).sort((a, b) => valor(b) - valor(a)).slice(0, n);
  const campo = filas.filter((f) => !esArquero(f.posicion) && f.jugados > 0);
  const arqueros = filas.filter((f) => esArquero(f.posicion) && f.jugados > 0);
  const goleadores = top(campo, (f) => f.goles);
  const asistidores = top(campo, (f) => f.asistencias);
  const rating = top(campo.filter((f) => f.jugados >= minimo), (f) => f.ratingProm);
  const minutos = top(filas.filter((f) => f.jugados > 0), (f) => f.minutos);
  const otras = filas.filter((f) => f.jugados > 0 && f.categoria && f.categoria !== categoria);
  sumar('plantel', 'El plantel', [
    { tipo: 'kpis', items: [
      { rotulo: 'Jugadores usados', valor: filas.filter((f) => f.jugados > 0).length, detalle: otras.length ? `${otras.length} de otras categorías` : 'todos de la categoría' },
      goleadores[0] ? { rotulo: 'Goleador', valor: goleadores[0].goles, detalle: nombreCompleto(goleadores[0]), destacado: true } : null,
      asistidores[0] ? { rotulo: 'Asistidor', valor: asistidores[0].asistencias, detalle: nombreCompleto(asistidores[0]) } : null,
      rating[0] ? { rotulo: 'Mejor rating', valor: r1(rating[0].ratingProm), detalle: `${nombreCompleto(rating[0])} (${rating[0].jugados} PJ)` } : null,
    ].filter(Boolean) },
    goleadores.length ? { tipo: 'tabla', titulo: 'Goleadores', columnas: ['Jugador', 'PJ', 'Goles', 'Por partido'],
      filas: goleadores.map((f) => [nombreCompleto(f), f.jugados, f.goles, f.gPorPJ.toFixed(2)]), resaltarColumna: 2 } : null,
    { tipo: 'tabla', titulo: 'Los que más jugaron', columnas: ['Jugador', 'PJ', 'Minutos', 'Rating'],
      filas: minutos.map((f) => [nombreCompleto(f), f.jugados, Math.round(f.minutos), f.ratingCount ? r1(f.ratingProm) : '–']), resaltarColumna: 2 },
    arqueros.length ? { tipo: 'tabla', titulo: 'Arqueros', columnas: ['Arquero', 'PJ', 'Atajadas', '% atajadas', 'Goles evitados'],
      filas: arqueros.sort((a, b) => b.jugados - a.jugados).map((f) => [nombreCompleto(f), f.jugados, f.atajadas, `${Math.round(f.pctAtajadas)}%`, (f.golesEvitables > 0 ? '+' : '') + r1(f.golesEvitables)]) } : null,
  ]);

  // ── La liga ───────────────────────────────────────────────────────────
  const l = liga ? enLaLiga(liga.partidos, liga.miClub) : null;
  if (l) {
    const desde = Math.max(0, l.posicion - 4);
    sumar('liga', liga.nombre || 'En la liga', [
      { tipo: 'kpis', items: [
        { rotulo: 'Posición', valor: `${l.posicion}º`, detalle: `de ${l.de}${l.zona ? ` · ${l.zona}` : ''}`, destacado: true },
        { rotulo: 'Puntos', valor: l.fila.pts, detalle: `${l.fila.pg} G · ${l.fila.pe} E · ${l.fila.pp} P` },
        { rotulo: 'Goles', valor: `${l.fila.gf}-${l.fila.gc}`, detalle: `diferencia ${l.fila.dg > 0 ? '+' : ''}${l.fila.dg}` },
      ] },
      { tipo: 'tabla', titulo: 'La tabla del torneo regular', columnas: ['#', 'Equipo', 'PJ', 'Pts', 'DG'],
        filas: l.tabla.slice(desde, desde + 8).map((t) => [t.pos, t.equipo, t.pj, t.pts, (t.dg > 0 ? '+' : '') + t.dg]),
        resaltarFila: l.posicion - 1 - desde },
      l.etapas.length ? { tipo: 'lista', titulo: 'Después del regular', tono: 'bien', items: l.etapas } : null,
    ]);
  }

  // ── Compromiso y salud ────────────────────────────────────────────────
  const ids = new Set(filas.filter((f) => f.categoria === categoria).map((f) => String(f.id)));
  const asist = (d.asistencias || []).filter((a) => ids.has(String(a.jugador_id)) && cuentaParaPresentismo(a.estado));
  const presentismo = pct(asist.filter((a) => cuentaComoPresente(a.estado)).length, asist.length);
  const les = (d.lesiones || []).filter((x) => ids.has(String(x.jugador_id)));
  const dias = les.reduce((s, x) => s + (diasDeBaja(x, d.hasta) || 0), 0);
  const amarillas = filas.reduce((s, f) => s + (f.amarillas || 0), 0);
  const rojas = filas.reduce((s, f) => s + (f.rojas || 0), 0);
  const porJugador = [...ids].map((id) => {
    const a = asist.filter((x) => mismoId(x.jugador_id, id));
    return { id, pres: pct(a.filter((x) => cuentaComoPresente(x.estado)).length, a.length), n: a.length };
  }).filter((x) => x.n >= 5 && x.pres === 100);
  sumar('compromiso', 'Compromiso y salud', [{ tipo: 'kpis', items: [
    presentismo != null ? { rotulo: 'Presentismo', valor: `${presentismo}%`, detalle: `en ${asist.length} registros de entrenamiento` } : null,
    porJugador.length ? { rotulo: 'Presentismo perfecto', valor: porJugador.length, detalle: porJugador.length === 1 ? 'jugador al 100%' : 'jugadores al 100%' } : null,
    { rotulo: 'Lesiones', valor: les.length, detalle: les.length ? `${dias} días de baja en total` : 'ninguna en la temporada' },
    { rotulo: 'Tarjetas', valor: amarillas + rojas, detalle: `${amarillas} amarillas · ${rojas} rojas` },
  ].filter(Boolean) }]);

  // ── Para destacar ─────────────────────────────────────────────────────
  const bien = [];
  if (efectividad >= 60) bien.push(`Un año ganador: ${efectividad}% de efectividad (${g} triunfos en ${res.length} partidos).`);
  if (l && l.posicion <= 3) bien.push(`Terminó ${l.posicion}º en la tabla del torneo regular.`);
  l?.etapas.filter((t) => /campe/i.test(t)).forEach((t) => bien.push(t));
  if (ganadora.n >= 3) bien.push(`${ganadora.n} triunfos seguidos entre el ${fechaCorta(ganadora.desde)} y el ${fechaCorta(ganadora.hasta)}.`);
  if (vallas >= 3) bien.push(`${vallas} vallas invictas.`);
  if (goleadores[0]) bien.push(`${nombreCompleto(goleadores[0])}, goleador con ${goleadores[0].goles} goles.`);
  if (presentismo != null && presentismo >= 85) bien.push(`Grupo comprometido: ${presentismo}% de presentismo.`);
  const trabajar = [];
  if (goles.conEventos) {
    const peor = [...goles.tramos].sort((a, b) => (b.contra - b.favor) - (a.contra - a.favor))[0];
    if (peor && peor.contra > peor.favor) trabajar.push(`Entre los minutos ${peor.tramo} recibió más de lo que hizo (${peor.favor} a favor, ${peor.contra} en contra).`);
    const o = goles.origenContra[0];
    if (o && o.nombre !== 'No especificado' && gc > 0 && o.n / gc >= 0.25) trabajar.push(`El ${pct(o.n, gc)}% de los goles en contra llegó por ${o.nombre.toLowerCase()}.`);
    if (goles.xgFavor > 0 && gf < goles.xgFavor - 3) trabajar.push(`Definición: hizo ${gf} goles con ${goles.xgFavor} de xG.`);
  }
  if (visit && local && local.efectividad - visit.efectividad >= 20) trabajar.push(`De visitante sumó bastante menos: ${visit.efectividad}% contra ${local.efectividad}% de local.`);
  sumar('cierre', audiencia === 'directiva' ? 'Para destacar' : 'Para destacar y para seguir creciendo', [
    bien.length ? { tipo: 'lista', titulo: 'Lo mejor del año', tono: 'bien', items: bien } : null,
    audiencia === 'ct' && trabajar.length ? { tipo: 'lista', titulo: 'Para trabajar', tono: 'trabajo', items: trabajar } : null,
    audiencia === 'jugador' && trabajar.length ? { tipo: 'lista', titulo: 'El desafío del año que viene', tono: 'trabajo', items: trabajar.slice(0, 2) } : null,
  ]);

  return { titulo: `Reporte de ${categoria}`, subtitulo: `Temporada ${temporada}`, audiencia, secciones };
}
