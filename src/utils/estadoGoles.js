/* Estado del partido en el momento de cada gol.
 *
 * Responde tres preguntas que el reporte de Origen de los Goles no contestaba:
 *   - ¿Cuántas veces abrimos el marcador (1er gol del partido)?
 *   - ¿Cuántos goles nuestros fueron para empatar el partido?
 *   - ¿Cuántos fueron para dar vuelta un resultado que veníamos perdiendo?
 *
 * Para saber cómo estaba el partido antes de cada gol hace falta reconstruir la
 * cronología completa, goles del rival incluidos. Por eso la función descarta
 * los partidos donde los goles cargados no coinciden con el resultado final:
 * si el rival metió 3 y sólo se registraron 2, el estado calculado sería falso
 * y arrastraría el error a todas las categorías.
 */

export const ESTADOS_GOL = {
  apertura: { label: 'ABRIMOS EL MARCADOR', color: '#10b981', ayuda: 'Gol con el partido 0-0. Pusimos el primero.' },
  empate: { label: 'PARA EMPATAR', color: '#f59e0b', ayuda: 'Gol que igualó el partido estando uno abajo.' },
  vuelta: { label: 'PARA DAR VUELTA', color: '#a855f7', ayuda: 'Gol que nos puso arriba después de haber estado perdiendo.' },
  desempate: { label: 'PARA DESEMPATAR', color: '#3b82f6', ayuda: 'Gol que rompió una igualdad sin haber estado nunca abajo.' },
  ampliacion: { label: 'PARA ESTIRAR', color: '#06b6d4', ayuda: 'Gol marcado cuando ya íbamos ganando.' },
  descuento: { label: 'DE DESCUENTO', color: '#ef4444', ayuda: 'Gol marcado perdiendo por dos o más. Acorta, pero no empata.' },
};

export const ORDEN_ESTADOS = ['apertura', 'empate', 'vuelta', 'desempate', 'ampliacion', 'descuento'];

const rangoPeriodo = (p) => (p === 'ST' ? 1 : 0);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/* Los eventos se cargan en vivo, así que el id ya viene en orden de registro.
 * Cuando hay minuto lo usamos igual, que es lo que un humano corrigió a mano. */
export function ordenarGolesDelPartido(goles) {
  const arr = [...goles];
  const todosConMinuto = arr.every((g) => num(g.minuto) !== null);
  if (!todosConMinuto) return arr.sort((a, b) => (num(a.id) || 0) - (num(b.id) || 0));
  return arr.sort((a, b) => {
    const dp = rangoPeriodo(a.periodo) - rangoPeriodo(b.periodo);
    if (dp !== 0) return dp;
    const dm = num(a.minuto) - num(b.minuto);
    if (dm !== 0) return dm;
    const ds = (num(a.segundos) || 0) - (num(b.segundos) || 0);
    if (ds !== 0) return ds;
    return (num(a.id) || 0) - (num(b.id) || 0);
  });
}

/* Clasifica UN gol propio según cómo estaba el marcador justo antes.
 * `veniaAbajo` = si en algún momento previo del partido estuvimos perdiendo. */
export function clasificarGol(gf, gc, veniaAbajo) {
  if (gf === 0 && gc === 0) return 'apertura';
  if (gf > gc) return 'ampliacion';
  if (gf === gc) return veniaAbajo ? 'vuelta' : 'desempate';
  if (gc - gf === 1) return 'empate';
  return 'descuento';
}

/* Recorre un partido gol por gol. Devuelve null si los goles cargados no
 * cierran con el resultado final del partido. */
export function analizarPartido(partido, golesDelPartido) {
  const goles = ordenarGolesDelPartido(golesDelPartido);
  const propios = goles.filter((g) => g.equipo === 'Propio');
  const rivales = goles.filter((g) => g.equipo === 'Rival');

  const finalGF = num(partido?.goles_propios) || 0;
  const finalGC = num(partido?.goles_rival) || 0;
  if (propios.length !== finalGF || rivales.length !== finalGC) return null;

  let gf = 0;
  let gc = 0;
  let veniaAbajo = false;
  let estuvoArriba = false;
  const clasificados = [];

  goles.forEach((g) => {
    if (g.equipo === 'Propio') {
      clasificados.push({ gol: g, estado: clasificarGol(gf, gc, veniaAbajo) });
      gf += 1;
    } else {
      gc += 1;
    }
    if (gc > gf) veniaAbajo = true;
    if (gf > gc) estuvoArriba = true;
  });

  const primero = goles.length > 0 ? goles[0].equipo : null;
  const resultado = finalGF > finalGC ? 'V' : finalGF === finalGC ? 'E' : 'D';

  return {
    id: partido.id,
    clasificados,
    primero, // 'Propio' | 'Rival' | null (0-0)
    resultado,
    veniaAbajo,
    estuvoArriba,
    gf: finalGF,
    gc: finalGC,
  };
}

const registroVacio = () => ({ pj: 0, v: 0, e: 0, d: 0 });
const sumarResultado = (reg, res) => {
  reg.pj += 1;
  if (res === 'V') reg.v += 1;
  else if (res === 'E') reg.e += 1;
  else reg.d += 1;
};

/* `partidos` ya viene filtrado por categoría/torneo y sólo con partidos jugados.
 * `golesPorPartido` es un Map id_partido -> array de goles (propios y rivales). */
export function analizarEstados(partidos, golesPorPartido) {
  const conteo = Object.fromEntries(ORDEN_ESTADOS.map((k) => [k, 0]));
  const abrimos = registroVacio();
  const nosAbrieron = registroVacio();
  let sinGoles = 0;
  let analizados = 0;
  let descartados = 0;
  let remontadas = 0; // estuvimos abajo y terminamos ganando
  let remontados = 0; // estuvimos arriba y no ganamos
  let totalPropios = 0;

  partidos.forEach((p) => {
    const goles = golesPorPartido.get(p.id) || [];
    const r = analizarPartido(p, goles);
    if (!r) { descartados += 1; return; }
    analizados += 1;

    r.clasificados.forEach(({ estado }) => { conteo[estado] += 1; });
    totalPropios += r.clasificados.length;

    if (r.primero === 'Propio') sumarResultado(abrimos, r.resultado);
    else if (r.primero === 'Rival') sumarResultado(nosAbrieron, r.resultado);
    else sinGoles += 1;

    if (r.veniaAbajo && r.resultado === 'V') remontadas += 1;
    if (r.estuvoArriba && r.resultado !== 'V') remontados += 1;
  });

  return {
    conteo,
    totalPropios,
    analizados,
    descartados,
    abrimos,
    nosAbrieron,
    sinGoles,
    remontadas,
    remontados,
  };
}

export const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);
