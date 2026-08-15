// ─────────────────────────────────────────────────────────────────────────────
// clipsRival.js — dossier de video de un rival
//
// Un rival aparece en la tabla `partidos` de TRES formas distintas, y no son
// equivalentes. Confundirlas es lo que hacía que el aviso contara 17 partidos
// "sin video" que en realidad nunca jugaste:
//
//   A) ENFRENTAMIENTO  → partido tuyo contra él.
//                        `rival_id` = él, `nombre_propio` = tu club.
//                        Tiene eventos de TomaDatos ⇒ hay CORTES AUTOMÁTICOS.
//
//   B) CRUCE AJENO, él de visitante → Torneos.jsx lo guarda con
//                        `rival_id` = él, `nombre_propio` = el OTRO rival.
//                        No hay eventos ⇒ sólo clips marcados a mano.
//
//   C) CRUCE AJENO, él de local     → `nombre_propio` = él (texto suelto),
//                        `local_rival_id` = él (FK, desde la migración v2).
//                        Ojo: acá `rival_id` apunta al OTRO equipo.
//
// El filtro `club_id` NO separa nada de esto: todo el fixture del torneo se
// carga bajo tu club_id, cruces ajenos incluidos. El criterio real, el mismo
// que ya usás en Inicio.jsx y Torneos.jsx, es: un partido es ajeno cuando su
// `nombre_propio` figura en la tabla `rivales`.
//
// Fuentes de cortes:
//   1. CLIPS MANUALES     → botonera de Videoanalisis (`video_clips`).
//                           Sirven para A, B y C.
//   2. CORTES AUTOMÁTICOS → derivados de `eventos` + los offsets de PT/ST del
//                           partido. Sólo existen para A.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';
import { fetchPaginado, fetchPorLotes, agruparPor, indexarPor } from '../utils/supaPaginado';

/** Colchón hacia atrás y hacia adelante de un corte automático, en segundos. */
export const PREROLL_SEG = 8;
export const POSTROLL_SEG = 4;

/** Colchón extra para el gol: se quiere ver la construcción, no el remate solo. */
export const PREROLL_GOL_SEG = 14;

const ESTADOS_JUGADO = ['Jugado', 'Finalizado'];

// ─────────────────────────────────────────────────────────────────────────────
// Deteccion de esquema
//
// Si se pide una columna que no existe, PostgREST NO devuelve filas vacias:
// devuelve un error 400 y la query entera se cae. Antes eso quedaba tapado por
// un .catch(() => []) y la pantalla aparecia vacia como si no hubiera datos,
// que es lo peor de los dos mundos: no funciona y no se entiende por que.
//
// Ahora se detecta una sola vez que columnas de la migracion v2 estan puestas y
// el modulo se adapta. Sin migracion sigue andando, con menos precision:
//   - sin `partidos.local_rival_id` → los cruces ajenos se resuelven por nombre
//   - sin `video_analisis.categoria` → los videos sueltos no se filtran por categoria
// ─────────────────────────────────────────────────────────────────────────────
let _soporte = null;

export async function detectarSoporte() {
  if (_soporte) return _soporte;
  const [pa, va] = await Promise.all([
    supabase.from('partidos').select('local_rival_id').limit(1),
    supabase.from('video_analisis').select('categoria').limit(1),
  ]);
  _soporte = {
    localRivalId: !pa.error,
    videoCategoria: !va.error,
  };
  if (!_soporte.localRivalId || !_soporte.videoCategoria) {
    console.warn(
      '[clipsRival] Falta correr migracion_video_scouting_v2.sql.',
      'local_rival_id:', _soporte.localRivalId,
      'video_analisis.categoria:', _soporte.videoCategoria
    );
  }
  return _soporte;
}

/** Para tests o para forzar una redeteccion despues de correr la migracion. */
export function resetearSoporte() { _soporte = null; }

export const CONTEXTO_ENFRENTAMIENTO = 'enfrentamiento';
export const CONTEXTO_SCOUTING = 'scouting';

/**
 * Traduce una `accion` de TomaDatos a una etiqueta de video comparable con las
 * de la botonera. Devuelve null si la acción no aporta nada mirándola en video.
 */
export function etiquetaDesdeAccion(accion) {
  if (!accion) return null;
  const a = String(accion);

  if (a === 'Gol' || a.includes('Gol')) return 'GOL';
  if (a.includes('Remate')) return 'REMATE';
  if (a.includes('Penal')) return 'BALÓN PARADO';
  if (a.includes('Córner') || a.includes('Corner')) return 'BALÓN PARADO';
  if (a.includes('Lateral')) return 'BALÓN PARADO';
  if (a.includes('Libre')) return 'BALÓN PARADO';
  if (a.includes('Falta')) return 'FALTA';
  if (a.includes('Recuperación')) return 'RECUPERACIÓN';
  if (a.includes('Pérdida')) return 'PÉRDIDA';
  if (a.includes('Duelo')) return 'DUELO';
  if (a.includes('Tarjeta')) return 'TARJETA';
  if (a.includes('Atajada') || a.includes('Parada')) return 'ATAJADA';

  return null; // cambios, quintetos y demás ruido operativo de la carga en vivo
}

const ACCIONES_EXCLUIDAS = /^(Cambio|Quinteto|Inicio|Fin|Tiempo|Pausa)/i;

/**
 * ¿Este partido es un cruce entre dos terceros del fixture?
 *
 * Criterio (el mismo de Inicio.jsx / Torneos.jsx): es ajeno si el equipo
 * guardado en `nombre_propio` figura en tu tabla de rivales. Desde la migración
 * v2, `local_rival_id` lo resuelve por FK y el nombre queda de respaldo para
 * las filas viejas que no se hayan podido backfillear.
 *
 * NO se usa `condicion === 'Neutral'`: tus propios partidos en cancha neutral
 * (Copa Argentina) también son 'Neutral', y ese fue justamente el bug que ya
 * arreglaste una vez.
 */
export function esCruceAjeno(partido, nombresRivales) {
  if (!partido) return false;
  if (partido.local_rival_id) return true;
  const np = partido.nombre_propio;
  if (!np) return false;
  return nombresRivales instanceof Set ? nombresRivales.has(np) : false;
}

/**
 * Segundo del video en el que ocurre un evento.
 * Devuelve null si el partido no tiene video o el evento no tiene tiempo válido.
 */
export function segundoDeVideo(evento, partido) {
  if (!partido?.video_url) return null;
  if (evento?.minuto == null) return null;

  const offsetPT = Number(partido.video_offset_pt) || 0;
  const offsetST = Number(partido.video_offset_st) || 0;
  const offset = evento.periodo === 'ST' ? offsetST : offsetPT;

  const t = (Number(evento.minuto) || 0) * 60 + (Number(evento.segundos) || 0) + offset;
  return t >= 0 ? t : 0;
}

/**
 * Etiqueta de marcador respetando quién es quién.
 * En un enfrentamiento, `goles_propios` sos vos. En un cruce ajeno,
 * `goles_propios` es el equipo LOCAL (que es otro rival), así que mostrarlo
 * como "propio" sería mentira.
 */
function etiquetaPartido(partido, contexto) {
  if (contexto === CONTEXTO_ENFRENTAMIENTO) {
    return `${partido.goles_propios ?? '-'}-${partido.goles_rival ?? '-'}`;
  }
  const local = partido.nombre_propio || 'LOCAL';
  const visitante = partido.rival || 'VISITANTE';
  return `${local} ${partido.goles_propios ?? '-'}-${partido.goles_rival ?? '-'} ${visitante}`;
}

/** Construye un corte automático a partir de un evento (sólo enfrentamientos). */
function corteDesdeEvento(evento, partido, nombreJugador) {
  const etiqueta = etiquetaDesdeAccion(evento.accion);
  if (!etiqueta) return null;
  if (ACCIONES_EXCLUIDAS.test(String(evento.accion || ''))) return null;

  const t = segundoDeVideo(evento, partido);
  if (t == null) return null;

  const preroll = etiqueta === 'GOL' ? PREROLL_GOL_SEG : PREROLL_SEG;

  return {
    id: `auto:${evento.id}`,
    origen: 'auto',
    contexto: CONTEXTO_ENFRENTAMIENTO,
    etiqueta,
    accion: evento.accion,
    lado: evento.equipo === 'Rival' ? 'Rival' : 'Propio',
    inicio: Math.max(0, t - preroll),
    fin: t + POSTROLL_SEG,
    notas: null,
    protagonista: evento.equipo === 'Rival' ? 'RIVAL' : (nombreJugador || null),

    partido_id: partido.id,
    fecha: partido.fecha,
    categoria: partido.categoria,
    competicion: partido.competicion,
    marcador: etiquetaPartido(partido, CONTEXTO_ENFRENTAMIENTO),
    periodo: evento.periodo,
    minuto: evento.minuto,

    fuente: 'youtube',
    video_url: partido.video_url,
    video_analisis_id: null,
    reproducible: true,
  };
}

/** Normaliza un clip manual de `video_clips` al mismo shape que un corte auto. */
function normalizarClipManual(clip, video, partido, contexto) {
  return {
    id: `real:${clip.id}`,
    clip_id: clip.id,
    origen: 'manual',
    contexto,
    etiqueta: clip.etiqueta || 'OTRO',
    accion: null,
    // La botonera no pide lado, así que no se puede inferir sin inventar.
    lado: null,
    inicio: Number(clip.inicio) || 0,
    fin: Number(clip.fin) || 0,
    notas: clip.notas || null,
    protagonista: null,

    partido_id: partido?.id || null,
    fecha: partido?.fecha || null,
    categoria: partido?.categoria || video?.categoria || clip.categoria || null,
    competicion: partido?.competicion || null,
    marcador: partido ? etiquetaPartido(partido, contexto) : null,
    periodo: null,
    minuto: null,

    fuente: video?.fuente || 'youtube',
    // Para 'upload' esto es un path de bucket privado, NO una URL: no se puede
    // embeber sin firmar, así que la UI manda a Videoanálisis en ese caso.
    video_url: video?.video_url || null,
    video_id: video?.video_id || null,
    video_analisis_id: video?.id || null,
    video_titulo: video?.titulo || null,
    reproducible: (video?.fuente || 'youtube') === 'youtube',
  };
}

/**
 * Carga el dossier de video completo de un rival.
 *
 * @param {object} args
 * @param {string} args.clubId
 * @param {string} args.rivalId
 * @param {string} [args.rivalNombre]  Respaldo para cruces ajenos sin backfill de FK.
 * @param {string} [args.categoria]  UNA categoría (Primera, Tercera...). null = todas.
 *   Es una sola a proposito: el material de Primera y el de Tercera no se mezclan
 *   nunca, ni en la lista ni en los contadores.
 * @param {boolean} [args.incluirAutomaticos=true]
 * @returns {Promise<object>} { clips, partidos, enfrentamientos, scouting, porEtiqueta, stats }
 */
export async function cargarDossierRival({
  clubId,
  rivalId,
  rivalNombre = null,
  categoria = null,
  incluirAutomaticos = true,
}) {
  if (!clubId || !rivalId) return dossierVacio();

  const soporte = await detectarSoporte();

  // ── 0) Nombres de todos los rivales del club ─────────────────────────────
  // Es lo que permite distinguir un partido tuyo de un cruce entre terceros.
  const rivalesClub = await fetchPaginado(() =>
    supabase.from('rivales').select('id, nombre').eq('club_id', clubId).order('id')
  ).catch(() => []);

  const nombresRivales = new Set(rivalesClub.map((r) => r.nombre).filter(Boolean));
  const nombreDelRival =
    rivalNombre || rivalesClub.find((r) => r.id === rivalId)?.nombre || null;

  // ── 1) Todos los partidos donde este rival aparece, de cualquier forma ───
  const camposPartido =
    'id, fecha, categoria, competicion, jornada, rival, rival_id, nombre_propio, condicion, goles_propios, goles_rival, video_url, video_offset_pt, video_offset_st' +
    (soporte.localRivalId ? ', local_rival_id' : '');

  const armarQuery = (columna, valor) => {
    let q = supabase
      .from('partidos')
      .select(camposPartido)
      .eq('club_id', clubId)
      .eq(columna, valor)
      .in('estado', ESTADOS_JUGADO);
    // Filtro duro de categoria: se aplica en la base, no despues en JS, para no
    // traer de gratis los partidos de las otras categorias.
    if (categoria) q = q.eq('categoria', categoria);
    return q.order('fecha', { ascending: false }).order('id', { ascending: false });
  };

  const consultas = [
    // Él como visitante: cubre tus enfrentamientos Y los cruces ajenos de visita
    fetchPaginado(() => armarQuery('rival_id', rivalId)),
  ];

  // Él como local en un cruce ajeno (FK de la migración v2). Sin la migración
  // esta vía no existe y se resuelve sólo por el nombre, más abajo.
  if (soporte.localRivalId) {
    consultas.push(fetchPaginado(() => armarQuery('local_rival_id', rivalId)));
  }

  // Respaldo por nombre, para las filas viejas que el backfill no haya podido
  // enlazar (nombre escrito distinto, rival renombrado, etc.).
  if (nombreDelRival) {
    consultas.push(fetchPaginado(() => armarQuery('nombre_propio', nombreDelRival)));
  }

  // Sin .catch(): si una consulta falla queremos enterarnos, no ver la pantalla
  // vacia sin explicacion. El modal muestra el mensaje.
  const resultados = await Promise.all(consultas);

  // Dedupe: un mismo partido puede volver por más de una consulta.
  const mapaCrudo = new Map();
  resultados.flat().forEach((p) => {
    if (p && !mapaCrudo.has(p.id)) mapaCrudo.set(p.id, p);
  });

  // ── 2) Clasificación: enfrentamiento vs scouting ─────────────────────────
  const enfrentamientos = [];
  const scouting = [];

  mapaCrudo.forEach((p) => {
    if (esCruceAjeno(p, nombresRivales)) {
      // Cruce entre terceros. Sólo entra si ESTE rival juega en él.
      const esVisitante = p.rival_id === rivalId;
      const esLocal =
        p.local_rival_id === rivalId ||
        (!!nombreDelRival && p.nombre_propio === nombreDelRival);
      if (!esVisitante && !esLocal) return;

      p.__rolRival = esLocal ? 'local' : 'visitante';
      p.__contexto = CONTEXTO_SCOUTING;
      scouting.push(p);
    } else {
      // Partido tuyo. Sólo entra si el rival es efectivamente el contrario.
      if (p.rival_id !== rivalId) return;
      p.__rolRival = 'visitante';
      p.__contexto = CONTEXTO_ENFRENTAMIENTO;
      enfrentamientos.push(p);
    }
  });

  const partidos = [...enfrentamientos, ...scouting];
  if (partidos.length === 0) return dossierVacio();

  const indicePartidos = indexarPor(partidos, 'id');

  // ── 3) Videos de esos partidos (+ videos de scouting suelto del rival) ───
  // El join se hace en JS con Maps: el lado embebido de PostgREST no se puede
  // paginar y se recorta sin avisar.
  const idsPartidos = partidos.map((p) => p.id);

  const camposVideo =
    'id, titulo, fuente, video_id, video_url, partido_id, rival_id' +
    (soporte.videoCategoria ? ', categoria' : '');

  const videosDePartidos = await fetchPorLotes(idsPartidos, (lote) =>
    supabase
      .from('video_analisis')
      .select(camposVideo)
      .eq('club_id', clubId)
      .in('partido_id', lote)
      .order('id')
  );

  let videosSueltos = [];
  try {
    let q = supabase
      .from('video_analisis')
      .select(camposVideo)
      .eq('club_id', clubId)
      .eq('rival_id', rivalId)
      .is('partido_id', null);
    // Un video suelto sin categoria cargada se muestra igual: es material viejo
    // que todavia no fue etiquetado, y esconderlo seria peor que mostrarlo.
    if (categoria && soporte.videoCategoria) {
      q = q.or(`categoria.eq.${categoria},categoria.is.null`);
    }
    videosSueltos = await fetchPaginado(() => q.order('id'));
  } catch (e) {
    videosSueltos = []; // todavía no se corrió la migración de `rival_id`
  }

  const videos = [...videosDePartidos, ...videosSueltos];
  const mapaVideos = indexarPor(videos, 'id');

  // ── 4) Clips manuales ────────────────────────────────────────────────────
  const idsVideos = videos.map((v) => v.id);
  const clipsCrudos = await fetchPorLotes(idsVideos, (lote) =>
    supabase
      .from('video_clips')
      .select('id, video_id, etiqueta, inicio, fin, notas, orden, created_at')
      .eq('club_id', clubId)
      .in('video_id', lote)
      .order('id')
  );

  const clipsManuales = clipsCrudos
    .map((c) => {
      const video = mapaVideos.get(c.video_id);
      if (!video) return null; // clip huérfano de un video borrado
      const partido = video.partido_id ? indicePartidos.get(video.partido_id) : null;
      const contexto = partido ? partido.__contexto : CONTEXTO_SCOUTING;
      return normalizarClipManual(c, video, partido, contexto);
    })
    .filter(Boolean)
    // Red de contencion por si un clip quedo con una categoria distinta a la de
    // su video (material migrado a mano). Los que no tienen categoria pasan.
    .filter((c) => !categoria || !c.categoria || c.categoria === categoria);

  // ── 5) Cortes automáticos: SÓLO de enfrentamientos ───────────────────────
  // Un cruce ajeno no tiene eventos cargados (no trackeás partidos que no jugás),
  // así que pedir sus eventos sería una consulta al pedo.
  let cortesAuto = [];
  const enfrentamientosConVideo = enfrentamientos.filter((p) => p.video_url);

  if (incluirAutomaticos && enfrentamientosConVideo.length > 0) {
    const idsConVideo = enfrentamientosConVideo.map((p) => p.id);

    const eventos = await fetchPorLotes(idsConVideo, (lote) =>
      supabase
        .from('eventos')
        .select('id, id_partido, periodo, minuto, segundos, accion, equipo, id_jugador')
        .in('id_partido', lote)
        .order('id')
    );

    const idsJugadores = [...new Set(eventos.map((e) => e.id_jugador).filter(Boolean))];
    let mapaJugadores = new Map();
    if (idsJugadores.length > 0) {
      const jugadores = await fetchPorLotes(idsJugadores, (lote) =>
        supabase.from('jugadores').select('id, nombre, apellido').in('id', lote).order('id')
      ).catch(() => []);
      mapaJugadores = indexarPor(jugadores, 'id');
    }

    cortesAuto = eventos
      .map((ev) => {
        const partido = indicePartidos.get(ev.id_partido);
        if (!partido) return null;
        const j = ev.id_jugador ? mapaJugadores.get(ev.id_jugador) : null;
        const nombre = j ? `${j.apellido || ''} ${j.nombre || ''}`.trim() : null;
        return corteDesdeEvento(ev, partido, nombre);
      })
      .filter(Boolean);
  }

  // ── 6) Unificación y orden ───────────────────────────────────────────────
  const clips = [...clipsManuales, ...cortesAuto].sort((a, b) => {
    const fa = a.fecha || '';
    const fb = b.fecha || '';
    if (fa !== fb) return fb.localeCompare(fa); // partido más reciente primero
    return (a.inicio || 0) - (b.inicio || 0);   // dentro del partido, cronológico
  });

  const scoutingConVideo = scouting.filter((p) => p.video_url);

  return {
    clips,
    partidos,
    enfrentamientos,
    scouting,
    porEtiqueta: agruparPor(clips, 'etiqueta'),
    // Se avisa en la UI si el esquema quedó a medio migrar, en vez de mostrar
    // resultados incompletos sin decir nada.
    faltaMigracion: !soporte.localRivalId || !soporte.videoCategoria,
    stats: {
      totalClips: clips.length,
      manuales: clipsManuales.length,
      automaticos: cortesAuto.length,

      // Enfrentamientos: acá SÍ tiene sentido reclamar video y sincro.
      enfrentamientos: enfrentamientos.length,
      enfrentamientosConVideo: enfrentamientosConVideo.length,
      enfrentamientosSinVideo: enfrentamientos.length - enfrentamientosConVideo.length,
      enfrentamientosSinSincro: enfrentamientosConVideo.filter(
        (p) => !p.video_offset_pt && !p.video_offset_st
      ).length,

      // Scouting: partidos del rival contra terceros. Nunca van a tener eventos,
      // así que no se avisa de "sincro faltante": no aplica.
      scouting: scouting.length,
      scoutingConVideo: scoutingConVideo.length,
      scoutingSinVideo: scouting.length - scoutingConVideo.length,
    },
  };
}

function dossierVacio() {
  return {
    clips: [],
    partidos: [],
    enfrentamientos: [],
    scouting: [],
    porEtiqueta: new Map(),
    faltaMigracion: false,
    stats: {
      totalClips: 0,
      manuales: 0,
      automaticos: 0,
      enfrentamientos: 0,
      enfrentamientosConVideo: 0,
      enfrentamientosSinVideo: 0,
      enfrentamientosSinSincro: 0,
      scouting: 0,
      scoutingConVideo: 0,
      scoutingSinVideo: 0,
    },
  };
}

/** Extrae el ID de YouTube de una URL (o lo devuelve tal cual si ya es un ID). */
export function extraerYoutubeId(url) {
  if (!url) return null;
  const limpio = String(url).trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(limpio)) return limpio;
  const m = limpio.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * URL de embed acotada al corte. YouTube respeta `start` y `end` en segundos,
 * así que el recorte lo hace el reproductor: no hay que tocar el archivo.
 */
export function urlEmbedDeClip(clip, { autoplay = true, mute = false } = {}) {
  const id = extraerYoutubeId(clip?.video_url || clip?.video_id);
  if (!id) return null;
  const params = new URLSearchParams({
    start: String(Math.max(0, Math.floor(clip.inicio || 0))),
    end: String(Math.ceil(clip.fin || 0)),
    rel: '0',
    modestbranding: '1',
  });
  if (autoplay) params.set('autoplay', '1');
  if (mute) params.set('mute', '1');
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

/** mm:ss */
export function fmtTiempo(seg) {
  if (seg == null || isNaN(seg)) return '00:00';
  const s = Math.max(0, Math.floor(seg));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Color por etiqueta, alineado con la paleta de la botonera de Videoanalisis. */
export function colorEtiqueta(etiqueta) {
  switch (etiqueta) {
    case 'GOL':
    case 'OCASIÓN CLARA':
      return '#00ff88';
    case 'REMATE':
    case 'PRESSING ALTO':
    case 'TRANSICIÓN OFE':
      return '#3b82f6';
    case 'PÉRDIDA':
    case 'TRANSICIÓN DEF':
    case 'ERROR DEFENSIVO':
    case 'TARJETA':
      return '#ef4444';
    case 'BALÓN PARADO':
    case 'JUGADA ENSAYADA':
    case 'FALTA':
      return '#f59e0b';
    case 'RECUPERACIÓN':
    case 'ATAJADA':
      return '#a855f7';
    default:
      return '#888';
  }
}