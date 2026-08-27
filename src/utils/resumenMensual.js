/**
 * Resumen mensual de asistencias visto desde el plantel, no desde el jugador.
 *
 * La vista mensual contestaba "cómo viene Pérez". Esto contesta la otra
 * pregunta, que es la que sirve para planificar: qué día del mes se cayó la
 * asistencia. Para eso hay que agrupar por fecha, no por jugador.
 *
 * Las fechas se manejan como texto 'YYYY-MM-DD' de punta a punta. Nada de
 * new Date(iso): eso interpreta el string como UTC y en Argentina (UTC-3)
 * corre todo un día para atrás.
 */

// 'presente' y 'tarde' cuentan como que el jugador estuvo, igual que en el
// resto de la pantalla. 'justificado' es una ausencia con motivo: no suma.
export const ESTUVO = new Set(['presente', 'tarde']);

export const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

/* Semáforo de cinco pasos, de rojo a verde.

   Una rampa rojo→verde común no la ve igual todo el mundo, y en escala de
   grises no se ve en absoluto: los tonos del medio tienen casi la misma
   claridad. Por eso esta rampa ADEMÁS aclara en cada paso — la claridad va
   de 0.055 a 0.698 sin retroceder nunca — así el orden se lee aunque el
   color no se distinga. Cada celda lleva además el número de presentes, que
   es el dato de verdad; el color es refuerzo.

   Los colores no dependen del tema claro/oscuro: acá el color ES el dato.
   Por eso cada paso trae su color de texto, elegido por contraste medido
   (el más bajo de los cinco da 5.02). */
export const ESCALA = [
  { hasta: 49,  fondo: '#7f1d1d', texto: '#ffffff', etiqueta: 'Menos del 50%' },
  { hasta: 69,  fondo: '#b45309', texto: '#ffffff', etiqueta: '50 a 69%' },
  { hasta: 84,  fondo: '#ca8a04', texto: '#0f172a', etiqueta: '70 a 84%' },
  { hasta: 94,  fondo: '#84cc16', texto: '#0f172a', etiqueta: '85 a 94%' },
  { hasta: 100, fondo: '#86efac', texto: '#0f172a', etiqueta: '95% o más' },
];

const pasoDe = (porcentaje) =>
  ESCALA.find((e) => porcentaje <= e.hasta) || ESCALA[ESCALA.length - 1];

export const colorDe = (porcentaje) => pasoDe(porcentaje).fondo;
export const textoDe = (porcentaje) => pasoDe(porcentaje).texto;

const dosDigitos = (n) => String(n).padStart(2, '0');
export const claveMes = (iso) => (iso || '').substring(0, 7);

/** Día de la semana con lunes = 0, calculado sin construir Date desde el ISO. */
function diaSemanaLunes(anio, mes, dia) {
  const d = new Date(anio, mes - 1, dia); // constructor local: no hay corrimiento
  return (d.getDay() + 6) % 7;
}

export function diasDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

/** Mueve un 'YYYY-MM-DD' n meses, manteniendo el día si existe en el destino. */
export function moverMes(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const total = (a * 12 + (m - 1)) + n;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(d, diasDelMes(anio, mes));
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/**
 * Agrupa el historial por fecha dentro de un mes y arma la grilla del
 * calendario, con las semanas empezando en lunes.
 *
 * Devuelve null si el mes no tiene ni un registro, para que la pantalla
 * muestre el cartel de "sin datos" en vez de un calendario vacío.
 */
export function resumirMesPorDia(historial = [], mesISO) {
  const [anio, mes] = mesISO.split('-').map(Number);
  if (!anio || !mes) return null;

  const porFecha = new Map();
  for (const h of historial) {
    if (claveMes(h.fecha) !== mesISO) continue;
    if (!porFecha.has(h.fecha)) {
      porFecha.set(h.fecha, { fecha: h.fecha, total: 0, presentes: 0, tarde: 0, ausentes: 0, justificados: 0 });
    }
    const d = porFecha.get(h.fecha);
    d.total++;
    if (h.estado === 'tarde') d.tarde++;
    if (h.estado === 'ausente') d.ausentes++;
    if (h.estado === 'justificado') d.justificados++;
    if (ESTUVO.has(h.estado)) d.presentes++;
  }
  if (porFecha.size === 0) return null;

  for (const d of porFecha.values()) {
    d.porcentaje = d.total > 0 ? Math.round((d.presentes / d.total) * 100) : 0;
    d.color = colorDe(d.porcentaje);
    d.colorTexto = textoDe(d.porcentaje);
  }

  const cantidad = diasDelMes(anio, mes);
  const celdas = [];
  // Huecos hasta el primer día, para que el 1 caiga en su columna real.
  for (let i = 0; i < diaSemanaLunes(anio, mes, 1); i++) celdas.push(null);
  for (let dia = 1; dia <= cantidad; dia++) {
    const fecha = `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
    celdas.push({ dia, fecha, datos: porFecha.get(fecha) || null });
  }
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

  const conDatos = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  /* El "peor día" se ordena por cantidad de presentes, no por porcentaje: un
     día con 4 de 5 (80%) no es peor que uno con 12 de 20 (60%) si lo que
     importa es cuánta gente hubo en la cancha. Empate: gana el de peor %. */
  const peor = conDatos.reduce((a, b) =>
    b.presentes < a.presentes || (b.presentes === a.presentes && b.porcentaje < a.porcentaje) ? b : a);
  const mejor = conDatos.reduce((a, b) =>
    b.presentes > a.presentes || (b.presentes === a.presentes && b.porcentaje > a.porcentaje) ? b : a);

  const sumaRegistros = conDatos.reduce((s, d) => s + d.total, 0);
  const sumaPresentes = conDatos.reduce((s, d) => s + d.presentes, 0);

  return {
    mesISO, semanas, dias: conDatos,
    diasConDatos: conDatos.length,
    promedio: sumaRegistros > 0 ? Math.round((sumaPresentes / sumaRegistros) * 100) : 0,
    promedioPresentes: conDatos.length > 0 ? Math.round(sumaPresentes / conDatos.length) : 0,
    peor, mejor,
  };
}
