/**
 * PLANES Y PRECIOS
 *
 * Una sola fuente de verdad para lo que se cobra. La usa el landing para
 * mostrar los precios y —cuando se active el control de límites— la app para
 * saber hasta cuántas categorías puede cargar cada club.
 *
 * El valor que escala es la CATEGORÍA (Primera, Tercera, Cuarta…): un club de
 * una sola división no paga lo mismo que uno con seis, y las seis cuestan seis
 * veces más en datos. Es el único límite: ningún plan esconde funciones, para
 * que el plan más barato no sea una versión mutilada del producto.
 */

export const WHATSAPP_NUMERO = '5491167182751';           // formato internacional, sin + ni 0 ni 15
export const WHATSAPP_MOSTRAR = '+54 9 11 6718-2751';

export const whatsappLink = (mensaje = 'Hola! Quiero probar Virtual.Club en mi club.') =>
  `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;

export const DIAS_TRIAL = 30;

/* `limiteCategorias: null` = sin límite. */
export const PLANES = [
  {
    id: 'dt',
    nombre: 'DT',
    bajada: 'Un entrenador, un equipo.',
    limiteCategorias: 1,
    precio: { ars: 30000, usd: 25, usdAnual: 250 },
    para: 'El técnico que maneja una sola categoría, la escuelita o el equipo único.',
    incluye: [
      '1 categoría',
      'Jugadores y cuerpo técnico ilimitados',
      'Citación, presentismo y enfermería',
      'Análisis de partido, video y reportes',
      'Acceso de los jugadores (kiosco y wellness)',
    ],
  },
  {
    id: 'ct',
    nombre: 'CT',
    bajada: 'El cuerpo técnico completo.',
    limiteCategorias: 3,
    destacado: true,
    precio: { ars: 40000, usd: 30, usdAnual: 300 },
    para: 'El club que maneja primera y las formativas de abajo.',
    incluye: [
      'Hasta 3 categorías',
      'Todo lo del plan DT',
      'Comparación entre categorías',
      'Soporte prioritario por WhatsApp',
    ],
  },
  {
    id: 'club',
    nombre: 'CLUB',
    bajada: 'Toda la institución.',
    limiteCategorias: null,
    precio: { ars: 60000, usd: 40, usdAnual: 400 },
    para: 'El club con todas las divisiones, masculino y femenino.',
    incluye: [
      'Categorías ilimitadas',
      'Todo lo del plan CT',
      'Tesorería y sponsors',
      'Acompañamiento en la puesta en marcha',
    ],
  },
];

export const planPorId = (id) => PLANES.find(p => p.id === String(id || '').toLowerCase()) || null;

/** Cuántas categorías permite un plan. Un id desconocido no bloquea a nadie. */
export const limiteDelPlan = (id) => {
  const plan = planPorId(id);
  return plan ? plan.limiteCategorias : null;
};

export const formatARS = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

/* El anual sólo se ofrece en dólares: atar un precio en pesos por doce meses
   es regalar plata con la inflación argentina. */
export const ahorroAnual = (plan) => {
  const mensualAnualizado = plan.precio.usd * 12;
  return Math.round((1 - plan.precio.usdAnual / mensualAnualizado) * 100);
};

/** Las categorías distintas que tiene cargadas un club, normalizadas. */
export const categoriasDe = (jugadores = []) => {
  const set = new Set();
  jugadores.forEach(j => {
    const c = String(j?.categoria || '').trim().toLowerCase();
    if (c) set.add(c);
  });
  return [...set];
};
