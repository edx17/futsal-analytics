/* CARGA DE ENTRENAMIENTO: ACWR, MONOTONÍA Y STRAIN
 *
 * La app ya guarda, por jugador y por día, el RPE (1 a 10) y los minutos de
 * actividad. De ahí sale todo esto sin pedir un dato nuevo.
 *
 *   carga de la sesión = RPE × minutos            (sRPE, el método de Foster)
 *   carga aguda        = lo de los últimos 7 días
 *   carga crónica      = lo de los últimos 28 días, llevado a semana (÷ 4)
 *   ACWR               = aguda ÷ crónica
 *
 * El ACWR responde "¿cuánto se le pidió esta semana comparado con lo que su
 * cuerpo viene tolerando?". Un salto brusco hacia arriba es el aviso que llega
 * ANTES de la lesión; por eso importa el ratio y no la carga suelta.
 *
 * MONOTONÍA = media diaria ÷ desvío de esos 7 días. Alta significa "todos los
 * días lo mismo", sin picos ni descanso, que también es factor de riesgo.
 * STRAIN = carga semanal × monotonía.
 *
 * DOS DECISIONES QUE CAMBIAN EL NÚMERO, Y VAN EXPLICADAS:
 *
 * 1. Los días sin registro cuentan como CERO, no se saltean. Un día libre es
 *    parte del estímulo: sacarlo de la cuenta infla la media y hunde el desvío,
 *    y la monotonía sale mal justo cuando el jugador descansó bien.
 *
 * 2. Con menos de 28 días de historia el ACWR se informa como insuficiente y
 *    no se muestra un número. La crónica sería un promedio de aire, y un
 *    semáforo verde sobre datos que no existen es peor que no mostrar nada.
 */

export const DIAS_AGUDA = 7;
export const DIAS_CRONICA = 28;

/* Los cortes son los de uso habitual en la literatura de carga. No son una ley
 * de la física: son un semáforo para mirar al jugador, no para decidir por él. */
export const ZONAS = [
  { id: 'baja',      hasta: 0.80, rotulo: 'POR DEBAJO',  color: '#38bdf8', ayuda: 'Viene entrenando menos de lo que tolera. No es riesgo, pero tampoco progresa.' },
  { id: 'optima',    hasta: 1.30, rotulo: 'ÓPTIMA',      color: '#00ff88', ayuda: 'La carga de esta semana acompaña lo que el cuerpo viene tolerando.' },
  { id: 'precaucion',hasta: 1.50, rotulo: 'PRECAUCIÓN',  color: '#fbbf24', ayuda: 'Subió más rápido de lo aconsejable. Conviene mirarlo de cerca.' },
  { id: 'riesgo',    hasta: Infinity, rotulo: 'RIESGO',  color: '#ef4444', ayuda: 'Salto brusco de carga. Es el escenario que más se asocia a lesión.' },
];

export const zonaDe = (acwr) =>
  (acwr == null ? null : ZONAS.find((z) => acwr < z.hasta) || ZONAS[ZONAS.length - 1]);

/* ── fechas, sin librerías ───────────────────────────────────────────────── */

const aDia = (f) => {
  if (!f) return null;
  const s = String(f).slice(0, 10);
  const [a, m, d] = s.split('-').map(Number);
  if (!a || !m || !d) return null;
  return Date.UTC(a, m - 1, d) / 86400000;   // número de día, sin horas ni husos
};

export const cargaDeSesion = (fila) => {
  const rpe = Number(fila?.rpe) || 0;
  const min = Number(fila?.minutos_actividad) || 0;
  return rpe > 0 && min > 0 ? rpe * min : 0;
};

/**
 * La carga día por día de un jugador, hacia atrás desde `hasta`.
 * Devuelve `dias` números; los días sin registro valen 0 a propósito.
 */
export function serieDiaria(filas, jugadorId, hasta, dias) {
  const fin = aDia(hasta);
  if (fin == null) return [];

  const porDia = new Map();
  (filas || []).forEach((f) => {
    if (String(f?.jugador_id) !== String(jugadorId)) return;
    const d = aDia(f.fecha);
    if (d == null || d > fin || d <= fin - dias) return;
    // Dos registros el mismo día se suman: pudo haber doble turno.
    porDia.set(d, (porDia.get(d) || 0) + cargaDeSesion(f));
  });

  const serie = [];
  for (let i = dias - 1; i >= 0; i--) serie.push(porDia.get(fin - i) || 0);
  return serie;
}

const suma = (a) => a.reduce((s, v) => s + v, 0);

const desvio = (a) => {
  if (a.length < 2) return 0;
  const m = suma(a) / a.length;
  return Math.sqrt(suma(a.map((v) => (v - m) ** 2)) / a.length);
};

/**
 * Todas las métricas de carga de un jugador a una fecha dada.
 *
 * `suficiente` dice si hay historia como para que el ACWR signifique algo. Si
 * es false, `acwr` viene en null: la pantalla muestra por qué y no un número.
 */
export function metricasDeCarga(filas, jugadorId, hasta) {
  const cronicaSerie = serieDiaria(filas, jugadorId, hasta, DIAS_CRONICA);
  const agudaSerie = cronicaSerie.slice(-DIAS_AGUDA);

  const aguda = suma(agudaSerie);
  const totalCronica = suma(cronicaSerie);
  const cronica = totalCronica / (DIAS_CRONICA / DIAS_AGUDA);   // llevada a semana

  /* Historia real = días con algo cargado en la ventana larga. Se pide al menos
     una cuarta parte para no calcular sobre tres registros sueltos. */
  const diasConDatos = cronicaSerie.filter((v) => v > 0).length;
  const suficiente = diasConDatos >= DIAS_CRONICA / 4 && cronica > 0;

  const media = aguda / DIAS_AGUDA;
  const sd = desvio(agudaSerie);
  const monotonia = sd > 0 ? media / sd : null;

  return {
    aguda,
    cronica,
    acwr: suficiente ? aguda / cronica : null,
    monotonia,
    strain: monotonia != null ? aguda * monotonia : null,
    diasConDatos,
    suficiente,
    serie: cronicaSerie,
  };
}

/** Lo mismo para todo el plantel, ya ordenado por riesgo primero. */
export function cargaDelPlantel(filas, jugadores, hasta) {
  return (jugadores || [])
    .map((j) => ({ jugador: j, ...metricasDeCarga(filas, j.id, hasta) }))
    .sort((a, b) => {
      if (a.suficiente !== b.suficiente) return a.suficiente ? -1 : 1;
      return (b.acwr ?? -1) - (a.acwr ?? -1);
    });
}
