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

/* ══════════════════════════════════════════════════════════════════════════
   CÓMO COBRAR
   Dos vías a propósito, porque los clubes pagan de las dos formas:

   · TRANSFERENCIA → sin comisión. Es la que conviene y por eso va primero.
   · LINK DE MERCADO PAGO → tarjeta y cuotas, con la comisión de MP.

   Los links son FIJOS y REUTILIZABLES: se crean una vez por plan y ciclo
   desde el panel de MP, y los paga quien sea las veces que sea. No hay que
   generar uno por club ni por mes.

   Todo lo que esté vacío simplemente no se muestra: la pantalla se adapta a
   lo que haya cargado y nunca queda un botón que no lleva a ningún lado.
   ══════════════════════════════════════════════════════════════════════════ */

export const COBRO = {
  transferencia: {
    alias: '',            // ej: 'virtual.club.mp'
    cbu: '',              // opcional
    titular: '',          // nombre que figura en la cuenta
  },
  // Link de pago de MP por plan y ciclo. Se pegan tal cual salen del panel.
  mercadopago: {
    dt:   { mensual: '', anual: '' },
    ct:   { mensual: '', anual: '' },
    club: { mensual: '', anual: '' },
  },
};

export const hayTransferencia = () => !!(COBRO.transferencia.alias || COBRO.transferencia.cbu);
export const linkMP = (planId, ciclo = 'mensual') =>
  COBRO.mercadopago?.[String(planId || '').toLowerCase()]?.[ciclo] || '';

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

/* ══════════════════════════════════════════════════════════════════════════
   QUÉ PUEDE HACER CADA CLUB
   ══════════════════════════════════════════════════════════════════════════ */

/** Los clubes que ya usaban la app antes de que tuviera precio. No pagan. */
export const esFundador = (club) => club?.socio_fundador === true;

/**
 * Cuántas categorías distintas puede cargar este club.
 * `null` = sin límite. El orden importa: fundador gana sobre todo, después el
 * override manual del club, y recién al final el límite del plan.
 */
export function limiteDelClub(club) {
  if (!club) return null;
  if (esFundador(club)) return null;
  if (club.limite_categorias != null && club.limite_categorias !== '') return Number(club.limite_categorias);
  return limiteDelPlan(club.plan_actual);
}

/**
 * ¿Puede sumar un jugador en `categoriaNueva`?
 *
 * Sólo molesta cuando la categoría es realmente nueva para el club: mover
 * jugadores entre las que ya tiene nunca se bloquea, y un club que ya está
 * por encima del tope puede seguir trabajando con lo que tiene cargado.
 */
export function puedeUsarCategoria({ club, categoriasActuales = [], categoriaNueva }) {
  const limite = limiteDelClub(club);
  const nueva = String(categoriaNueva || '').trim().toLowerCase();
  if (!nueva) return { permitido: true };

  const actuales = categoriasActuales.map(c => String(c || '').trim().toLowerCase()).filter(Boolean);
  if (actuales.includes(nueva)) return { permitido: true };          // ya la usa
  if (limite == null) return { permitido: true };                    // sin tope
  if (actuales.length < limite) return { permitido: true };

  const plan = planPorId(club?.plan_actual);
  return {
    permitido: false,
    limite,
    motivo: `Tu plan ${plan ? plan.nombre : 'actual'} permite ${limite} ${limite === 1 ? 'categoría' : 'categorías'} `
      + `y ya tenés ${actuales.length} (${actuales.join(', ')}). Para sumar "${String(categoriaNueva).trim()}" hay que pasar al plan siguiente.`,
  };
}

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

/* ══════════════════════════════════════════════════════════════════════════
   RENOVACIONES
   El cobro es a mano: el club escribe, se arregla el pago y se le extiende el
   vencimiento desde ADM SUSCRIPCIONES. Estas dos funciones son para que esa
   parte no dependa de contar días en la cabeza.
   ══════════════════════════════════════════════════════════════════════════ */

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Nueva fecha de vencimiento al renovar.
 *
 * Si la suscripción todavía está vigente, se SUMA a lo que le queda; si ya
 * venció, arranca de hoy. Renovar tres días antes no puede costarle al club
 * los días que le sobraban.
 */
export function renovar(vencimientoActual, { meses = 0, anios = 0 } = {}) {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);

  let base = hoy;
  if (vencimientoActual) {
    const actual = new Date(`${String(vencimientoActual).split('T')[0]}T12:00:00`);
    if (!Number.isNaN(actual.getTime()) && actual > hoy) base = actual;
  }

  const salida = new Date(base);
  salida.setMonth(salida.getMonth() + Number(meses || 0));
  salida.setFullYear(salida.getFullYear() + Number(anios || 0));
  return aISO(salida);
}

/** Cuánto hay que cobrarle a un club por un ciclo, en pesos y en dólares. */
export function precioDe(planId, ciclo = 'mensual') {
  const plan = planPorId(planId);
  if (!plan) return null;
  return ciclo === 'anual'
    ? { usd: plan.precio.usdAnual, ars: null, etiqueta: `USD ${plan.precio.usdAnual} / año` }
    : { usd: plan.precio.usd, ars: plan.precio.ars, etiqueta: `${formatARS(plan.precio.ars)} o USD ${plan.precio.usd} / mes` };
}

/** Las categorías distintas que tiene cargadas un club, normalizadas. */
export const categoriasDe = (jugadores = []) => {
  const set = new Set();
  jugadores.forEach(j => {
    const c = String(j?.categoria || '').trim().toLowerCase();
    if (c) set.add(c);
  });
  return [...set];
};
