/* DE LOS PREMIOS A LAS CARTAS
 *
 * premios.js decide A QUIÉN se destaca y devuelve fichas livianas
 * ({ id, rol, nota, pj, goles, asistencias }). Acá esas fichas se completan con
 * lo que sale de la ficha del plantel (nombre, foto, dorsal) para dibujar la
 * carta, para guardarla en el historial y para armar la placa de redes.
 *
 * Funciones puras, sin pantalla ni base de datos, para poder probarlas.
 */

import { ovrDeNota } from './premios';
import { rolDe } from './quinteto';

/** Cómo se llama cada premio y cómo se dibuja. */
export const PREMIOS = {
  POTW: { sigla: 'POTW', titulo: 'JUGADOR DEL PARTIDO', quinteto: false, variante: 'potw' },
  TOTW: { sigla: 'TOTW', titulo: 'QUINTETO DEL PARTIDO', quinteto: true, variante: 'totw' },
  POTM: { sigla: 'POTM', titulo: 'JUGADOR DEL MES', quinteto: false, variante: 'potm' },
  TOTM: { sigla: 'TOTM', titulo: 'QUINTETO DEL MES', quinteto: true, variante: 'totm' },
  TOTY: { sigla: 'TOTY', titulo: 'JUGADOR DE LA TEMPORADA', quinteto: false, variante: 'toty' },
};

export const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** 'YYYY-MM' → 'Octubre 2026'. */
export function etiquetaMes(mes) {
  const [anio, nro] = String(mes || '').split('-').map(Number);
  return anio && nro ? `${NOMBRE_MES[nro - 1]} ${anio}` : '';
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY', sin pasar por Date (en Argentina corre un día). */
export const fechaCorta = (iso) => {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
};

/** Índice de la ficha del plantel por id (texto), para no buscar en lista cada vez. */
export const indicePorId = (jugadores = []) => new Map((jugadores || []).map((j) => [String(j.id), j]));

/**
 * Una ficha de premio + la ficha del jugador = lo que necesita la carta.
 * `destacadoId`: el que dio nombre al premio (el POTW dentro del TOTW), para
 * marcarlo con una estrella.
 */
export function cartaDeFicha(ficha, porId, { destacadoId = null } = {}) {
  const j = porId?.get(String(ficha.id)) || {};
  const nota = Number(ficha.nota);
  return {
    id: String(ficha.id),
    nombre: j.nombre || '',
    apellido: j.apellido || '',
    dorsal: j.dorsal ?? null,
    foto: j.foto || null,
    categoria: j.categoria || '',
    rol: ficha.rol || rolDe(j.posicion),
    nota: Number.isFinite(nota) ? nota : null,
    ovr: Number.isFinite(nota) ? ovrDeNota(nota) : null,
    pj: ficha.pj ?? 1,
    goles: ficha.goles || 0,
    asistencias: ficha.asistencias || 0,
    destacado: destacadoId != null && String(destacadoId) === String(ficha.id),
  };
}

/** Las cartas de un registro de premio (ver registrosDePartido/Mes/Temporada en premios.js). */
export const cartasDeRegistro = (registro, porId) =>
  (registro.jugadores || []).map((f) => cartaDeFicha(f, porId, { destacadoId: registro.destacadoId }));

/**
 * La fila que se guarda en `cartas_destacadas`. Lleva la FOTO de cada carta
 * (nombre, foto, nota…) tal como estaba ese día: si después el jugador cambia
 * de foto o de categoría, el historial sigue mostrando lo que se decidió.
 */
export function registroAFila(registro, porId, { clubId, categoria = 'Todas', torneoId = 'Todos' } = {}) {
  const destacado = Number(registro.destacadoId);
  return {
    club_id: clubId,
    tipo: registro.tipo,
    periodo: String(registro.periodo),
    categoria,
    torneo_id: torneoId,
    fecha_ref: registro.fechaRef || null,
    destacado_id: Number.isFinite(destacado) ? destacado : null,
    jugadores: cartasDeRegistro(registro, porId),
    contexto: registro.contexto || {},
  };
}

/** Lo contrario: una fila del historial → el mismo registro que sale de premios.js, con sus cartas. */
export function filaARegistro(fila) {
  const destacadoId = fila.destacado_id != null ? String(fila.destacado_id) : null;
  return {
    id: fila.id,
    tipo: fila.tipo,
    periodo: fila.periodo,
    fechaRef: fila.fecha_ref,
    destacadoId,
    categoria: fila.categoria,
    contexto: fila.contexto || {},
    cartas: (fila.jugadores || []).map((c) => ({ ...c, destacado: destacadoId != null && String(c.id) === destacadoId })),
  };
}

/**
 * Lo que necesita la placa de redes: título, de qué es, y las cartas.
 * `registro`: { tipo, periodo, fechaRef, contexto } (da igual si viene de
 * premios.js o del historial), `cartas`: las cartas ya armadas.
 */
export function datosDePlaca({ tipo, periodo, fechaRef, contexto = {}, cartas = [], club = {}, categoria = '' }) {
  const meta = PREMIOS[tipo];
  let subtitulo = '';
  let derecha = '';
  let detalle = '';

  if (tipo === 'POTW' || tipo === 'TOTW') {
    const gf = contexto.golesFavor, gc = contexto.golesContra;
    const marcador = Number.isFinite(Number(gf)) && Number.isFinite(Number(gc)) ? ` · ${gf}-${gc}` : '';
    subtitulo = `VS ${String(contexto.rival || 'RIVAL').toUpperCase()}${marcador}`;
    derecha = fechaCorta(contexto.fecha || fechaRef);
  } else if (tipo === 'POTM' || tipo === 'TOTM') {
    subtitulo = etiquetaMes(contexto.mes || periodo).toUpperCase();
    derecha = categoria && categoria !== 'Todas' ? String(categoria).toUpperCase() : '';
    if (contexto.partidos) detalle = `Se jugaron ${contexto.partidos} partidos · mínimo ${contexto.minimo} para entrar`;
  } else if (tipo === 'TOTY') {
    subtitulo = `TEMPORADA ${periodo || String(fechaRef || '').slice(0, 4)}`;
    derecha = categoria && categoria !== 'Todas' ? String(categoria).toUpperCase() : '';
    if (contexto.partidos) detalle = `Jugó al menos ${contexto.minimo} de ${contexto.partidos} partidos del equipo`;
  }

  return { tipo, sigla: meta?.sigla || tipo, titulo: meta?.titulo || '', quinteto: !!meta?.quinteto, subtitulo, derecha, detalle, cartas, club, sinArquero: !!contexto.sinArquero };
}

/* ══════════════════════════════════════════════════════════════════════════
   EL HISTORIAL
   ══════════════════════════════════════════════════════════════════════════ */

/** Una línea que dice de qué es un registro del historial: contra quién, qué mes, qué temporada. */
export function descripcionRegistro(registro) {
  const { tipo, periodo, fechaRef, contexto = {}, categoria } = registro;
  let base = '';
  if (tipo === 'POTW' || tipo === 'TOTW') {
    const gf = contexto.golesFavor, gc = contexto.golesContra;
    const marcador = Number.isFinite(Number(gf)) && Number.isFinite(Number(gc)) ? ` ${gf}-${gc}` : '';
    base = `vs ${String(contexto.rival || 'Rival').toUpperCase()}${marcador} · ${fechaCorta(contexto.fecha || fechaRef)}`;
  } else if (tipo === 'POTM' || tipo === 'TOTM') {
    base = etiquetaMes(contexto.mes || periodo);
  } else if (tipo === 'TOTY') {
    base = `Temporada ${periodo || String(fechaRef || '').slice(0, 4)}`;
  }
  return categoria && categoria !== 'Todas' ? `${base} · ${categoria}` : base;
}

/**
 * Quiénes aparecen más en el historial. `destacado` de cada carta marca al
 * ganador del premio (el jugador del partido, del mes o de la temporada).
 *
 *   individuales: POTW + POTM + TOTY ganados
 *   quintetos:    veces que estuvo en un TOTW o un TOTM
 *
 * Ordena por individuales y, a igualdad, por quintetos.
 */
export function rankingDestacados(registros = []) {
  const por = new Map();
  const ficha = (c) => {
    if (!por.has(c.id)) por.set(c.id, { id: c.id, nombre: c.nombre, apellido: c.apellido, potw: 0, potm: 0, toty: 0, totw: 0, totm: 0 });
    return por.get(c.id);
  };
  registros.forEach((r) => {
    (r.cartas || []).forEach((c) => {
      if (r.tipo === 'TOTW') ficha(c).totw += 1;
      else if (r.tipo === 'TOTM') ficha(c).totm += 1;
      else if (c.destacado) {
        if (r.tipo === 'POTW') ficha(c).potw += 1;
        else if (r.tipo === 'POTM') ficha(c).potm += 1;
        else if (r.tipo === 'TOTY') ficha(c).toty += 1;
      }
    });
  });
  return [...por.values()]
    .map((f) => ({ ...f, individuales: f.potw + f.potm + f.toty, quintetos: f.totw + f.totm }))
    .sort((a, b) => (b.individuales - a.individuales) || (b.quintetos - a.quintetos) || String(a.apellido).localeCompare(String(b.apellido)));
}
