/* ============================================================================
   RENDIMIENTO POR DÍA DE LA SEMANA
   ----------------------------------------------------------------------------
   En qué días jugamos y cómo nos fue en cada uno. Un club que rinde distinto
   los sábados que los martes tiene un problema de descanso, de horario o de
   viaje, y eso no se ve en ninguna tabla que ordene por fecha.

   El módulo no consulta nada: recibe los partidos ya filtrados por la pantalla
   —que es la que sabe de qué club, categoría y torneo son— y devuelve los
   números. Así los totales de este bloque no pueden discrepar con el resto de
   Temporada: salen de la misma lista.
============================================================================ */

/* `plural` va escrito a mano porque en castellano los días de lunes a viernes
   NO cambian en plural: "los martes", no "los martess". Agregarle una s al
   nombre, que es lo primero que uno hace, escribe mal cinco de los siete. */
export const DIAS = [
  { n: 1, nombre: 'Lunes',     corto: 'LUN', plural: 'lunes' },
  { n: 2, nombre: 'Martes',    corto: 'MAR', plural: 'martes' },
  { n: 3, nombre: 'Miércoles', corto: 'MIÉ', plural: 'miércoles' },
  { n: 4, nombre: 'Jueves',    corto: 'JUE', plural: 'jueves' },
  { n: 5, nombre: 'Viernes',   corto: 'VIE', plural: 'viernes' },
  { n: 6, nombre: 'Sábado',    corto: 'SÁB', plural: 'sábados' },
  { n: 0, nombre: 'Domingo',   corto: 'DOM', plural: 'domingos' },
];

/* El corte lo define el club: de lunes a jueves es "semana" y el viernes ya
   cuenta como fin de semana. No es el calendario, es cómo se entrena y se
   viaja. */
export const GRUPOS = [
  { id: 'semana', rotulo: 'Días de semana', ayuda: 'Lunes a jueves',   dias: [1, 2, 3, 4] },
  { id: 'finde',  rotulo: 'Fin de semana',  ayuda: 'Viernes a domingo', dias: [5, 6, 0] },
];

/**
 * Qué día de la semana cae una fecha. 0 = domingo … 6 = sábado.
 *
 * Se arma con Date.UTC y se lee con getUTCDay a propósito. `new Date('2026-09-22')`
 * parsea el texto como medianoche UTC y después `getDay()` lo lee en hora
 * local: en Argentina (UTC−3) eso devuelve el día ANTERIOR. Para un bloque que
 * se trata justamente de qué día se jugó, ese error lo arruinaría entero.
 *
 * Acepta 'YYYY-MM-DD' y 'DD/MM/YYYY', que son los dos formatos que aparecen en
 * la base. Devuelve null si no puede leerla.
 */
export function diaDeLaSemana(fecha) {
  if (!fecha) return null;
  const limpio = String(fecha).trim().split('T')[0];
  let a, m, d;

  if (limpio.includes('-')) {
    const p = limpio.split('-');
    if (p.length < 3) return null;
    [a, m, d] = p.map(Number);
  } else if (limpio.includes('/')) {
    const p = limpio.split('/');
    if (p.length < 3) return null;
    // 'DD/MM/YYYY'
    [d, m, a] = p.map(Number);
  } else return null;

  if (!a || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(a, m - 1, d));
  // Rebota si la fecha no existe (31 de febrero y compañía).
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.getUTCDay();
}

/** Victoria, empate o derrota, con los goles como vienen de la base. */
export const resultadoDe = (p) => {
  const gf = Number(p?.goles_propios) || 0;
  const gc = Number(p?.goles_rival) || 0;
  return gf > gc ? 'V' : gf === gc ? 'E' : 'D';
};

const filaVacia = () => ({ pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 });

function acumular(acc, p) {
  const gf = Number(p.goles_propios) || 0;
  const gc = Number(p.goles_rival) || 0;
  acc.pj += 1;
  acc.gf += gf;
  acc.gc += gc;
  const r = resultadoDe(p);
  if (r === 'V') acc.pg += 1; else if (r === 'E') acc.pe += 1; else acc.pp += 1;
  return acc;
}

/* Puntos de fútbol: 3 por ganar, 1 por empatar. La efectividad es qué
   porcentaje de los puntos en juego se sacó, que es lo único que deja
   comparar un día con 12 partidos contra otro con 3. */
const conDerivados = (f) => {
  const pts = f.pg * 3 + f.pe;
  return {
    ...f,
    pts,
    dg: f.gf - f.gc,
    efectividad: f.pj > 0 ? (pts / (f.pj * 3)) * 100 : null,
  };
};

/**
 * Una fila por día de la semana, de lunes a domingo, SIEMPRE las siete.
 *
 * Los días sin partidos vienen igual, en cero: que no hayamos jugado nunca un
 * miércoles es información, y esconder la fila lo tapa.
 */
export function resumenPorDia(partidos = []) {
  const porDia = new Map(DIAS.map((d) => [d.n, filaVacia()]));
  let sinFecha = 0;

  (partidos || []).forEach((p) => {
    const d = diaDeLaSemana(p?.fecha);
    if (d == null) { sinFecha += 1; return; }
    acumular(porDia.get(d), p);
  });

  return {
    filas: DIAS.map((d) => ({ ...d, ...conDerivados(porDia.get(d.n)) })),
    // Los partidos con la fecha ilegible no se reparten en ningún día: se
    // cuentan aparte para que los totales cierren y se vea que faltan.
    sinFecha,
  };
}

/** Lo mismo, agrupado en semana y fin de semana. */
export function resumenPorGrupo(partidos = []) {
  const { filas } = resumenPorDia(partidos);
  const porDia = new Map(filas.map((f) => [f.n, f]));

  return GRUPOS.map((g) => {
    const acc = g.dias.reduce((a, n) => {
      const f = porDia.get(n);
      return { pj: a.pj + f.pj, pg: a.pg + f.pg, pe: a.pe + f.pe, pp: a.pp + f.pp, gf: a.gf + f.gf, gc: a.gc + f.gc };
    }, filaVacia());
    return { ...g, ...conDerivados(acc) };
  });
}

/**
 * El día donde mejor y donde peor rinde el equipo, para poder decirlo en una
 * frase. Sólo mira días con `minimo` partidos o más: coronar al "mejor día"
 * con un solo partido ganado es ruido, no un hallazgo.
 */
export function extremos(filas = [], minimo = 3) {
  const conBase = filas.filter((f) => f.pj >= minimo && f.efectividad != null);
  if (conBase.length < 2) return { mejor: null, peor: null, minimo };
  const ordenadas = [...conBase].sort((a, b) => b.efectividad - a.efectividad || b.pj - a.pj);
  return { mejor: ordenadas[0], peor: ordenadas[ordenadas.length - 1], minimo };
}
