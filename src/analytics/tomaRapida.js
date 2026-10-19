/* ══════════════════════════════════════════════════════════════════════════
   TOMA DE DATOS SIMPLIFICADA Y POR VOZ

   Las reglas, sin pantalla (las prueban los tests):
     · los modos de carga y cómo se recuerda cuál eligió cada partido,
     · las camisetas del partido (número → jugador convocado),
     · las acciones de la toma simplificada,
     · el intérprete de lo dictado: "7 remate desviado", "remate rival atajado",
       "gol del 10 asistencia del 4", "rival falta".
   ══════════════════════════════════════════════════════════════════════════ */

export const MODOS_TOMA = [
  { id: 'tradicional', nombre: 'TRADICIONAL', ayuda: 'La de siempre: acción, autor, asistencia y contexto del remate.' },
  { id: 'simplificada', nombre: 'SIMPLIFICADA', ayuda: 'Tocás la cancha, la camiseta y la acción. Asistencia sólo en los goles.' },
  { id: 'voz', nombre: 'POR VOZ', ayuda: 'Tocás la cancha y decís, por ejemplo, "7 remate desviado" o "remate rival atajado".' },
];

/* Las acciones de la toma simplificada (las mismas que se guardan en la tradicional). */
export const ACCIONES_RAPIDAS = [
  { accion: 'Remate - Gol', etiqueta: 'GOL', color: '#00ff88', ancho: 2 },
  { accion: 'Remate - Atajado', etiqueta: 'REMATE ATAJADO', color: '#3b82f6' },
  { accion: 'Remate - Desviado', etiqueta: 'REMATE DESVIADO', color: '#9ca3af' },
  { accion: 'Remate - Rebatido', etiqueta: 'REMATE REBATIDO', color: '#a855f7' },
  { accion: 'Falta cometida', etiqueta: 'FALTA', color: '#ec4899' },
  { accion: 'Recuperación', etiqueta: 'RECUPERACIÓN', color: '#eab308' },
  { accion: 'Pérdida', etiqueta: 'PÉRDIDA', color: '#ef4444' },
];

export const etiquetaAccion = (accion) =>
  ACCIONES_RAPIDAS.find((a) => a.accion === accion)?.etiqueta
  || (accion === 'Falta recibida' ? 'FALTA RECIBIDA' : String(accion || '').toUpperCase());

/* ── camisetas ─────────────────────────────────────────────────────────── */

/**
 * Las camisetas del partido: { [jugadorId]: número }. Lo guardado para este
 * partido manda; si no, lo último que se usó en el club para ese jugador; si
 * no, su dorsal.
 */
export function camisetasIniciales(jugadores = [], delPartido = {}, delClub = {}) {
  const res = {};
  jugadores.forEach((j) => {
    const id = String(j.id);
    const n = delPartido[id] ?? delClub[id] ?? j.dorsal;
    if (n !== null && n !== undefined && String(n).trim() !== '') res[id] = String(n).trim();
  });
  return res;
}

/** Números repetidos entre los convocados (no se puede saber de quién es cada uno). */
export function camisetasRepetidas(camisetas = {}) {
  const vistos = {};
  Object.values(camisetas).forEach((n) => { if (n) vistos[n] = (vistos[n] || 0) + 1; });
  return Object.keys(vistos).filter((n) => vistos[n] > 1);
}

/** número → id de jugador (entre los convocados). */
export const jugadorPorCamiseta = (camisetas = {}, numero) => {
  const n = String(numero ?? '').trim();
  if (!n) return null;
  const par = Object.entries(camisetas).find(([, v]) => String(v) === n);
  return par ? par[0] : null;
};

/* ── el intérprete de voz ──────────────────────────────────────────────── */

const UNIDADES = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "el siete", "treinta y uno" → "el 7", "31". */
export function numerosEnPalabras(texto) {
  const palabras = sinTildes(texto).toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < palabras.length; i += 1) {
    const p = palabras[i];
    if (DECENAS[p] !== undefined) {
      if (palabras[i + 1] === 'y' && UNIDADES[palabras[i + 2]] !== undefined && UNIDADES[palabras[i + 2]] < 10) {
        out.push(String(DECENAS[p] + UNIDADES[palabras[i + 2]]));
        i += 2;
      } else out.push(String(DECENAS[p]));
    } else if (UNIDADES[p] !== undefined) out.push(String(UNIDADES[p]));
    else out.push(p);
  }
  return out.join(' ');
}

const tiene = (t, re) => re.test(t);

/**
 * Lo dictado → un evento.
 *
 * @param {string} texto     Lo que reconoció el teléfono.
 * @param {object} camisetas { [jugadorId]: número } del partido.
 * @returns {{ equipo, accion, dorsal, jugadorId, asistenciaDorsal, asistenciaId, completo, falta: string[], texto }}
 *   `falta` dice qué no se entendió: 'accion', 'resultado' (un remate sin
 *   atajado/desviado/rebatido), 'jugador' (un número que no es de nadie).
 */
export function interpretarVoz(texto, camisetas = {}) {
  const t = ` ${numerosEnPalabras(texto)} `;
  const r = { equipo: 'Propio', accion: null, dorsal: null, jugadorId: null, asistenciaDorsal: null, asistenciaId: null, completo: false, falta: [], texto: String(texto || '') };

  if (tiene(t, /\brival(es)?\b|\bellos\b|\bcontra\b/)) r.equipo = 'Rival';

  // Asistencia: "asistencia (de/del) 4", "pase (de/del) 4", "con el 4".
  const asis = t.match(/\b(?:asistencia|asiste|asistio|pase|habilita|habilito)\s+(?:de\s+|del\s+|el\s+|la\s+)*(\d{1,2})\b/);
  if (asis) r.asistenciaDorsal = asis[1];

  // Autor: el primer número que no sea el de la asistencia.
  const numeros = [...t.matchAll(/\b(\d{1,2})\b/g)].map((m) => ({ n: m[1], i: m.index }));
  const autor = numeros.find((x) => !(asis && x.i >= asis.index && x.i <= asis.index + asis[0].length));
  if (autor && r.equipo === 'Propio') r.dorsal = autor.n;

  // Acción
  const esRemate = tiene(t, /\b(remate|remato|tiro|tira|tiro al arco|disparo|patea|pateo|remata)\b/);
  const atajado = tiene(t, /\b(atajad[oa]|ataja|atajo|atajada|arquero|al arco)\b/);
  const desviado = tiene(t, /\b(desviad[oa]|desvia|desvio|afuera|fuera|errado|erro|palo)\b/);
  const rebatido = tiene(t, /\b(rebatid[oa]|rebate|rebatio|bloquead[oa]|bloqueo|tapad[oa]|tapo)\b/);

  if (tiene(t, /\b(gol|golazo|goool|gool)\b/)) r.accion = 'Remate - Gol';
  else if (atajado && (esRemate || !tiene(t, /\bfalta\b/))) r.accion = 'Remate - Atajado';
  else if (desviado && (esRemate || !tiene(t, /\bfalta\b/))) r.accion = 'Remate - Desviado';
  else if (rebatido) r.accion = 'Remate - Rebatido';
  else if (esRemate) r.falta.push('resultado');
  else if (tiene(t, /\bfalta\b|\binfraccion\b/)) {
    r.accion = tiene(t, /\b(recibid[oa]|recibe|recibio|le hacen|le hicieron|le pegan|le pegaron)\b/) ? 'Falta recibida' : 'Falta cometida';
  } else if (tiene(t, /\b(recupera|recupero|recuperacion|recuperada|roba|robo|robada|intercepta|intercepto|intercepcion)\b/)) r.accion = 'Recuperación';
  else if (tiene(t, /\b(perdida|pierde|perdio|perdida de pelota)\b/)) r.accion = 'Pérdida';

  if (!r.accion && !r.falta.includes('resultado')) r.falta.push('accion');

  if (r.equipo === 'Propio') {
    if (r.dorsal) {
      r.jugadorId = jugadorPorCamiseta(camisetas, r.dorsal);
      if (!r.jugadorId) r.falta.push('jugador');
    } else r.falta.push('jugador');
  }
  if (r.asistenciaDorsal && r.equipo === 'Propio') {
    r.asistenciaId = jugadorPorCamiseta(camisetas, r.asistenciaDorsal);
    if (r.asistenciaId === r.jugadorId) r.asistenciaId = null;
  }
  if (r.accion !== 'Remate - Gol') { r.asistenciaDorsal = null; r.asistenciaId = null; }

  r.completo = r.falta.length === 0;
  return r;
}

/**
 * De varias alternativas del reconocedor, la que se entiende completa; si
 * ninguna, la que menos le falta.
 */
export function mejorInterpretacion(alternativas = [], camisetas = {}) {
  const lista = (alternativas || []).filter(Boolean).map((a) => interpretarVoz(a, camisetas));
  if (!lista.length) return interpretarVoz('', camisetas);
  return lista.find((x) => x.completo) || [...lista].sort((a, b) => a.falta.length - b.falta.length)[0];
}

/* ── guardar ───────────────────────────────────────────────────────────── */

/**
 * La falta en el área es penal, como en la toma tradicional. Coordenadas de
 * la base (x = 0 mi arco, x = 100 el arco rival).
 */
export function accionSegunZona(accion, equipo, x, y) {
  const enAreaPropia = x <= 15 && y >= 25 && y <= 75;
  const enAreaRival = x >= 85 && y >= 25 && y <= 75;
  if (equipo === 'Propio') {
    if (accion === 'Falta cometida' && enAreaPropia) return 'Penal en contra';
    if (accion === 'Falta recibida' && enAreaRival) return 'Penal a favor';
  } else {
    if (accion === 'Falta cometida' && enAreaRival) return 'Penal en contra';
    if (accion === 'Falta recibida' && enAreaPropia) return 'Penal a favor';
  }
  return accion;
}

/**
 * Las filas de `eventos` de una acción rápida, con la misma forma que guarda
 * la toma tradicional (un gol con asistencia suma la fila de 'Asistencia').
 */
export function eventosDeAccionRapida({ base, equipo, accion, jugadorId, asistenciaId, x, y }) {
  const final = accionSegunZona(accion, equipo, x, y);
  const esRemate = final.startsWith('Remate');
  const principal = {
    ...base,
    id_jugador: equipo === 'Propio' && jugadorId ? Number(jugadorId) : null,
    accion: final,
    zona_x: x,
    zona_y: y,
    equipo,
  };
  if (esRemate) {
    principal.id_asistencia = equipo === 'Propio' && asistenciaId ? Number(asistenciaId) : null;
    principal.origen_gol = '';
  }
  const filas = [principal];
  if (final === 'Remate - Gol' && equipo === 'Propio' && asistenciaId) {
    filas.push({ ...base, id_jugador: Number(asistenciaId), accion: 'Asistencia', zona_x: x, zona_y: y, equipo: 'Propio' });
  }
  return filas;
}
