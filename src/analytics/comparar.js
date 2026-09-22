/* QUÉ SE COMPARA, Y CÓMO
 *
 * La lista de métricas vive acá y no en la pantalla, para poder probarla.
 *
 * LO IMPORTANTE ES `por40`. Comparar totales entre un jugador de 600 minutos y
 * uno de 120 no dice nada: el primero gana todo por haber jugado más. Las
 * métricas de volumen —goles, remates, recuperaciones— se pueden ver por cada
 * 40 minutos, que es lo que dura un partido de futsal, y ahí sí se comparan
 * rendimientos y no oportunidades.
 *
 * Las que ya son promedios o porcentajes (rating, %duelos) no se normalizan:
 * dividirlas otra vez no significaría nada.
 */

export const DUR_PARTIDO = 40;

const pct = (gan, tot) => (tot > 0 ? (gan / tot) * 100 : null);

/* mejor: 'alto' gana el número más grande, 'bajo' el más chico, null empata. */
export const METRICAS = [
  { k: 'jugados',   t: 'PARTIDOS JUGADOS', mejor: 'alto', por40: false, dec: 0 },
  { k: 'minutos',   t: 'MINUTOS',          mejor: 'alto', por40: false, dec: 0 },
  { k: 'ratingProm',t: 'RATING',           mejor: 'alto', por40: false, dec: 2 },
  { k: 'goles',     t: 'GOLES',            mejor: 'alto', por40: true,  dec: 0 },
  { k: 'asistencias', t: 'ASISTENCIAS',    mejor: 'alto', por40: true,  dec: 0 },
  { k: 'xg',        t: 'xG GENERADO',      mejor: 'alto', por40: true,  dec: 2 },
  { k: 'remates',   t: 'REMATES',          mejor: 'alto', por40: true,  dec: 0 },
  { k: 'rec',       t: 'RECUPERACIONES',   mejor: 'alto', por40: true,  dec: 0 },
  { k: 'perd',      t: 'PÉRDIDAS',         mejor: 'bajo', por40: true,  dec: 0 },
  { k: 'duelOfePct',t: 'DUELOS OFENSIVOS', mejor: 'alto', por40: false, dec: 0, sufijo: '%' },
  { k: 'duelDefPct',t: 'DUELOS DEFENSIVOS',mejor: 'alto', por40: false, dec: 0, sufijo: '%' },
  { k: 'faltasCom', t: 'FALTAS COMETIDAS', mejor: 'bajo', por40: true,  dec: 0 },
  { k: 'amarillas', t: 'AMARILLAS',        mejor: 'bajo', por40: false, dec: 0 },
];

/* Los porcentajes de duelo no vienen calculados en la fila: se arman acá. */
export function conPorcentajes(fila) {
  if (!fila) return null;
  return {
    ...fila,
    duelOfePct: pct(fila.duelOfeGan, fila.duelOfeTot),
    duelDefPct: pct(fila.duelDefGan, fila.duelDefTot),
  };
}

/**
 * El valor de una métrica para un jugador, ya normalizado si corresponde.
 * Devuelve null cuando el dato no existe o no se puede normalizar (sin
 * minutos no hay "por 40"), para que la pantalla muestre un guión y no un 0
 * que parezca un resultado.
 */
export function valorDe(fila, metrica, normalizar) {
  if (!fila) return null;
  const bruto = fila[metrica.k];
  if (bruto == null || Number.isNaN(Number(bruto))) return null;
  if (!normalizar || !metrica.por40) return Number(bruto);
  const min = Number(fila.minutos) || 0;
  if (min <= 0) return null;
  return (Number(bruto) * DUR_PARTIDO) / min;
}

/** Quién gana esta métrica: 'a', 'b' o null si empatan o falta un dato. */
export function ganador(va, vb, metrica) {
  if (va == null || vb == null) return null;
  if (va === vb) return null;
  const aEsMayor = va > vb;
  return metrica.mejor === 'bajo' ? (aEsMayor ? 'b' : 'a') : (aEsMayor ? 'a' : 'b');
}

/**
 * Cuánto de la barra se lleva cada uno. Se reparte sobre el total para que las
 * dos mitades sean comparables entre sí, igual que en la placa de partido.
 * Con los dos en cero, la barra queda vacía en vez de partida al medio.
 */
export function reparto(va, vb) {
  const a = Math.max(0, Number(va) || 0);
  const b = Math.max(0, Number(vb) || 0);
  const t = a + b;
  if (t <= 0) return [0, 0];
  return [(a / t) * 100, (b / t) * 100];
}

/** El resumen de la comparación: cuántas métricas gana cada uno. */
export function resumen(filaA, filaB, normalizar) {
  let a = 0, b = 0, empates = 0;
  METRICAS.forEach((m) => {
    const g = ganador(valorDe(filaA, m, normalizar), valorDe(filaB, m, normalizar), m);
    if (g === 'a') a++; else if (g === 'b') b++; else empates++;
  });
  return { a, b, empates };
}
