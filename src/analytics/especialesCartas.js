/* LAS FAMILIAS DE CARTAS ESPECIALES: CÓMO SE LLAMAN Y CÓMO SE VEN
 *
 * Toda la identidad visual vive acá; CartaEspecial.jsx sólo la dibuja.
 *
 *   Goleadores (1ª rueda y serie)  negro, rojo y dorado · silueta "hoja" con muesca · insignia balón en hexágono · tajos rojos
 *   Goleador del mes               cobre y naranja     · silueta de arco          · balón + cinta     · abanico de rayos
 *   Asistidores (mes y 1ª rueda)   azul eléctrico y plata · octógono              · doble flecha     · trazas de circuito y la trayectoria de un pase
 *   Presencia (mes y 1ª rueda)     acero, grafito y esmeralda · chaflanes y remaches · tilde en octógono · acero cepillado
 *   MVP 1ª rueda                   negro y dorado      · corona                    · corona            · filigrana y laureles
 *   Recuperadores (serie)          grafito, verde azulado y plata · escudo        · escudo con flecha · malla hexagonal
 *   Héroes del club                sepia y oro viejo   · retrato antiguo (esquinas cóncavas, foto en arco) · laurel con estrella · papel envejecido
 *                                  y ornamentos en las esquinas. Son ex jugadores: no hay estadísticas, van sus rasgos.
 *   Halloween (evento)             violeta, negro y naranja · alas de murciélago arriba · calabaza tallada · telarañas,
 *                                  luna y gotas verdes. Van los seis atributos del jugador.
 *
 * Rareza en los sobres: cada tipo nuevo cae en una de las rarezas que YA
 * existen, así que los pesos del sorteo y las V-Coins por repetida no cambian
 * (ver RAREZAS en sobres.js). Lo único que cambia es cuántas cartas hay dentro
 * de esa rareza, y eso pasa sólo si el staff las publica.
 */

const n = (v) => (v === null || v === undefined || v === '' ? '—' : v);
const nota1 = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v).toFixed(1) : '—');
const plural = (v, uno, varios) => (Number(v) === 1 ? uno : varios);

export const FAMILIAS = {
  goleador: {
    forma: 'hoja', textura: 'vetas', adorno: 'filo', insignia: 'balon', serie: false, stat: 'goles', titulo: 'GOLEADOR',
    colores: {
      fondo: ['#2a0306', '#0d0d0d', '#000000'], luz: '#ff2a2a', detalle: '#e11d2a', metal: ['#fff2b8', '#d4a83a', '#8a6414', '#f5d77a'],
      filo: '#f5d77a', texto: '#fff7e0', suave: 'rgba(255,240,200,.72)', media: '#f5d77a', fundido: 'rgba(8,2,2,.96)', contraluz: 'rgba(225,29,42,.35)',
      cinta: '#b91c1c', cintaTexto: '#fff3cf', insigniaFondo: '#120304', medallaFondo: '#120304', medallaTexto: '#f5d77a',
    },
    etiqueta: (v) => plural(v, 'GOL', 'GOLES'),
    secundarios: (c) => [['PJ', n(c.pj)], ['G/PJ', c.pj ? (c.goles / c.pj).toFixed(2) : '—'], ['NOTA', nota1(c.nota)]],
  },
  goleadorMes: {
    forma: 'arco', textura: 'rayos', adorno: 'llama', insignia: 'balonMes', serie: false, stat: 'goles', titulo: 'GOLEADOR DEL MES',
    colores: {
      fondo: ['#e07a2e', '#9a3f12', '#3a1406'], luz: '#ffb15c', detalle: '#ffcf8a', metal: ['#ffd9b0', '#c56a2c', '#7a3a12', '#f0a46a'],
      filo: '#ffd2a6', texto: '#fff4ea', suave: 'rgba(255,236,220,.78)', media: '#fff1e0', fundido: 'rgba(58,20,6,.96)', contraluz: 'rgba(255,140,40,.35)',
      cinta: '#ff7a1a', cintaTexto: '#2a0e02', insigniaFondo: '#4a1a06', medallaFondo: '#4a1a06', medallaTexto: '#ffd2a6',
    },
    etiqueta: (v) => plural(v, 'GOL', 'GOLES'),
    secundarios: (c) => [['PJ', n(c.pj)], ['ASIST', n(c.asistencias)], ['NOTA', nota1(c.nota)]],
  },
  asistidor: {
    forma: 'octo', textura: 'circuito', adorno: 'pase', insignia: 'pase', serie: false, stat: 'asistencias', titulo: 'ASISTIDOR',
    colores: {
      fondo: ['#1d4ed8', '#0b1d5c', '#040a24'], luz: '#3b82f6', detalle: '#7dd3fc', metal: ['#ffffff', '#c3ccd8', '#7b8794', '#e8eef5'],
      filo: '#e2e8f0', texto: '#f0f6ff', suave: 'rgba(220,235,255,.78)', media: '#ffffff', fundido: 'rgba(4,10,36,.96)', contraluz: 'rgba(59,130,246,.4)',
      cinta: '#e2e8f0', cintaTexto: '#0b1d5c', insigniaFondo: '#071440', medallaFondo: '#071440', medallaTexto: '#e2e8f0',
    },
    etiqueta: (v) => plural(v, 'ASISTENCIA', 'ASISTENCIAS'),
    secundarios: (c) => [['PJ', n(c.pj)], ['GOLES', n(c.goles)], ['NOTA', nota1(c.nota)]],
  },
  presencia: {
    forma: 'chaflan', textura: 'acero', adorno: 'remaches', insignia: 'presente', serie: false, stat: 'pj', titulo: 'PRESENTE',
    colores: {
      fondo: ['#5b6670', '#2a3036', '#111417'], luz: '#10b981', detalle: '#34d399', metal: ['#f1f5f9', '#94a3b8', '#475569', '#cbd5e1'],
      filo: '#cbd5e1', texto: '#f1f5f9', suave: 'rgba(226,232,240,.75)', media: '#6ee7b7', fundido: 'rgba(17,20,23,.96)', contraluz: 'rgba(16,185,129,.3)',
      cinta: '#059669', cintaTexto: '#ecfdf5', insigniaFondo: '#14181c', medallaFondo: '#14181c', medallaTexto: '#6ee7b7',
    },
    etiqueta: (v, e) => (e.partidos ? `DE ${e.partidos} PARTIDOS` : plural(v, 'PARTIDO', 'PARTIDOS')),
    secundarios: (c) => [['NOTA', nota1(c.nota)], ['GOLES', n(c.goles)], ['ASIST', n(c.asistencias)]],
  },
  mvp: {
    forma: 'corona', textura: 'filigrana', adorno: 'laureles', insignia: 'corona', serie: false, stat: 'mvp', titulo: 'MVP',
    colores: {
      fondo: ['#1a1408', '#070605', '#000000'], luz: '#e7c766', detalle: '#e7c766', metal: ['#fff6cf', '#e7c766', '#8a6a1c', '#f7e3a1'],
      filo: '#f7e3a1', texto: '#fff8e1', suave: 'rgba(255,240,200,.72)', media: '#f7e3a1', fundido: 'rgba(0,0,0,.96)', contraluz: 'rgba(231,199,102,.3)',
      cinta: '#e7c766', cintaTexto: '#1a1408', insigniaFondo: '#0d0a04', medallaFondo: '#0d0a04', medallaTexto: '#f7e3a1',
    },
    etiqueta: (v) => (Number(v) === 1 ? 'VEZ FIGURA' : 'VECES FIGURA'),
    secundarios: (c) => [['PJ', n(c.pj)], ['NOTA', nota1(c.nota)], ['G+A', (Number(c.goles) || 0) + (Number(c.asistencias) || 0)]],
  },
  recuperador: {
    forma: 'escudo', textura: 'malla', adorno: 'bisel', insignia: 'escudo', serie: true, stat: 'rec', titulo: 'RECUPERADOR',
    colores: {
      fondo: ['#1f3a3d', '#1c2124', '#0b0e10'], luz: '#14b8a6', detalle: '#2dd4bf', metal: ['#f8fafc', '#aab4be', '#5d6873', '#dfe5ea'],
      filo: '#dfe5ea', texto: '#effaf8', suave: 'rgba(220,240,238,.75)', media: '#99f6e4', fundido: 'rgba(11,14,16,.96)', contraluz: 'rgba(20,184,166,.32)',
      cinta: '#0f766e', cintaTexto: '#f0fdfa', insigniaFondo: '#0b1214', medallaFondo: '#0b1214', medallaTexto: '#e2e8f0',
    },
    etiqueta: (v) => plural(v, 'RECUPERACIÓN', 'RECUPERACIONES'),
    etiquetaCorta: 'RECUP.',
    secundarios: (c) => [['PJ', n(c.pj)], ['REC/PJ', c.pj && c.rec != null ? (c.rec / c.pj).toFixed(1) : '—'], ['NOTA', nota1(c.nota)]],
  },
};
/* Héroes: figuras que ya no están en el club. Sin datos de partidos: la carta
   muestra sus rasgos (los carga el superusuario), y si fue capitán, la "C". */
FAMILIAS.heroe = {
  forma: 'retrato', textura: 'papel', adorno: 'ornamento', insignia: 'laurel', serie: false, stat: null, titulo: 'HÉROE DEL CLUB', rasgos: true,
  colores: {
    fondo: ['#7a5733', '#4a321b', '#20140a'], luz: '#f0d29a', detalle: '#c99a5b', metal: ['#fbefd2', '#d2a865', '#7c5627', '#ecd29b'],
    filo: '#ecd29b', texto: '#fbf1dc', suave: 'rgba(251,241,220,.78)', media: '#fbefd2', fundido: 'rgba(32,20,10,.96)', contraluz: 'rgba(240,210,154,.28)',
    cinta: '#7c5627', cintaTexto: '#fbefd2', insigniaFondo: '#2a1a0c', medallaFondo: '#2a1a0c', medallaTexto: '#fbefd2',
  },
  etiqueta: () => '',
  secundarios: () => [],
};

/* Halloween: la versión de noche de brujas de una carta. Violeta y negro con
   naranja de calabaza; muestra los seis atributos del jugador (no un premio). */
FAMILIAS.halloween = {
  forma: 'murcielago', textura: 'telarana', adorno: 'goteo', insignia: 'calabaza', serie: false, stat: null, titulo: 'HALLOWEEN', atributos: true,
  colores: {
    fondo: ['#3b1257', '#170722', '#050208'], luz: '#ff7a00', detalle: '#c4b5fd', metal: ['#ffe0b8', '#ff8a1f', '#8a3300', '#ffb35c'],
    filo: '#ffb35c', texto: '#fff3e6', suave: 'rgba(255,236,214,.75)', media: '#ffb35c', fundido: 'rgba(12,4,18,.97)', contraluz: 'rgba(255,122,0,.4)',
    cinta: '#ff7a00', cintaTexto: '#1a0800', insigniaFondo: '#14061c', medallaFondo: '#14061c', medallaTexto: '#ffb35c', goteo: '#a3e635',
  },
  etiqueta: () => '',
  secundarios: () => [],
};

/* TOTY (Team of the Year): azul profundo con destellos, un ala de cristales
   azules con filo dorado que cruza la carta, y el marco dorado con la cresta
   arriba y las puntas abajo. Muestra los seis atributos. */
FAMILIAS.toty = {
  forma: 'trofeo', textura: 'cristales', adorno: 'cresta', insignia: 'ninguna', serie: false, stat: null, titulo: 'TEAM OF THE YEAR', atributos: true,
  colores: {
    fondo: ['#1838c4', '#0b1c78', '#040a33'], luz: '#3d6bff', detalle: '#e9c46a', metal: ['#fff3c4', '#e2b54f', '#8a6418', '#f8dc8a'],
    filo: '#f3d27a', texto: '#ffffff', suave: 'rgba(225,232,255,.8)', media: '#f5d77a', fundido: 'rgba(6,14,64,.97)', contraluz: 'rgba(61,107,255,.45)',
    cinta: '#e9c46a', cintaTexto: '#071451', insigniaFondo: '#071451', medallaFondo: '#071451', medallaTexto: '#f5d77a',
    cristal: ['#5f86ff', '#2342d8', '#0c1f8f'], estrellas: '#cfe0ff',
  },
  etiqueta: () => '',
  secundarios: () => [],
};

/* TOTY ICONS · COPA FUTURO DE ORO: la misma silueta que la TOTY, en mármol
   blanco con vetas doradas y cristales azules en las esquinas; letras azul
   noche. Para los de inferiores que juegan la Copa Futuro de Oro. */
FAMILIAS.icono = {
  ...FAMILIAS.toty,
  textura: 'marmol', adorno: 'cristalesIcono', titulo: 'COPA FUTURO DE ORO',
  colores: {
    fondo: ['#ffffff', '#efe9dd', '#d9d1c1'], luz: '#ffffff', detalle: '#c99a36', metal: ['#fff3c4', '#e2b54f', '#8a6418', '#f8dc8a'],
    filo: '#c99a36', texto: '#0b1a52', suave: 'rgba(11,26,82,.7)', media: '#0b1a52', fundido: 'rgba(238,232,220,.98)', contraluz: 'rgba(255,255,255,.35)',
    cinta: '#0b1a52', cintaTexto: '#f5d77a', insigniaFondo: '#0b1a52', medallaFondo: '#0b1a52', medallaTexto: '#f5d77a',
    cristal: ['#7aa0ff', '#2a4fe0', '#0e2196'], estrellas: '#c99a36',
  },
};

// La serie de goleadores es la familia goleador, con distintivo de puesto.
FAMILIAS.goleadorSerie = { ...FAMILIAS.goleador, serie: true, titulo: 'GOLEADORES' };

/* LA SEGUNDA RUEDA: la misma forma, textura e insignia de cada familia de la
   1ª rueda, en otro tono (para distinguirlas en la colección):
     Goleador   bordó y platino (en vez de rojo y dorado)
     Asistidor  violeta eléctrico y plata (en vez de azul)
     Presencia  acero y ámbar (en vez de esmeralda)
     MVP        negro y platino helado (en vez de dorado)
     Recuperador grafito e índigo (en vez de verde azulado) */
const enOtroTono = (base, colores) => ({ ...base, colores: { ...base.colores, ...colores } });
const PLATINO = ['#ffffff', '#cfd6df', '#7d8794', '#eef2f6'];
FAMILIAS.goleador2 = enOtroTono(FAMILIAS.goleador, {
  fondo: ['#3a0614', '#120508', '#000000'], luz: '#ff4d6d', detalle: '#be123c', metal: PLATINO,
  filo: '#e5e9ef', media: '#eef2f6', contraluz: 'rgba(190,18,60,.38)', cinta: '#9f1239', cintaTexto: '#fff1f2',
  insigniaFondo: '#16040a', medallaFondo: '#16040a', medallaTexto: '#eef2f6',
});
FAMILIAS.goleadorSerie2 = { ...FAMILIAS.goleador2, serie: true, titulo: 'GOLEADORES' };
FAMILIAS.asistidor2 = enOtroTono(FAMILIAS.asistidor, {
  fondo: ['#6d28d9', '#2e1065', '#12052e'], luz: '#a855f7', detalle: '#d8b4fe', fundido: 'rgba(18,5,46,.96)',
  contraluz: 'rgba(168,85,247,.42)', cintaTexto: '#2e1065', insigniaFondo: '#1e0a45', medallaFondo: '#1e0a45',
});
FAMILIAS.presencia2 = enOtroTono(FAMILIAS.presencia, {
  luz: '#f59e0b', detalle: '#fbbf24', media: '#fcd34d', contraluz: 'rgba(245,158,11,.3)', cinta: '#b45309', cintaTexto: '#fffbeb',
  medallaTexto: '#fcd34d',
});
FAMILIAS.mvp2 = enOtroTono(FAMILIAS.mvp, {
  fondo: ['#0f1a24', '#05080b', '#000000'], luz: '#bae6fd', detalle: '#e0f2fe', metal: PLATINO, filo: '#eef2f6', texto: '#f8fbff',
  suave: 'rgba(225,240,255,.74)', media: '#e0f2fe', contraluz: 'rgba(186,230,253,.3)', cinta: '#cbd5e1', cintaTexto: '#0f1a24',
  insigniaFondo: '#070c10', medallaFondo: '#070c10', medallaTexto: '#e0f2fe',
});
FAMILIAS.recuperador2 = enOtroTono(FAMILIAS.recuperador, {
  fondo: ['#262a5c', '#1a1c2e', '#0a0b14'], luz: '#6366f1', detalle: '#a5b4fc', media: '#c7d2fe', contraluz: 'rgba(99,102,241,.34)',
  cinta: '#4338ca', cintaTexto: '#eef2ff', insigniaFondo: '#0d0e1c', medallaFondo: '#0d0e1c',
});

/* Cada tipo: su sigla, su título, su familia y la rareza (existente) con la que va a los sobres. */
export const ESPECIALES = {
  GOLM: { sigla: 'GOL MES', titulo: 'GOLEADOR DEL MES', familia: 'goleadorMes', rareza: 'totm', periodo: 'mes' },
  ASIM: { sigla: 'ASI MES', titulo: 'ASISTIDOR DEL MES', familia: 'asistidor', rareza: 'totm', periodo: 'mes' },
  PREM: { sigla: 'PRE MES', titulo: 'PRESENTE DEL MES', familia: 'presencia', rareza: 'totm', periodo: 'mes' },
  GOLR: { sigla: 'GOL 1R', titulo: 'GOLEADOR · 1ª RUEDA', familia: 'goleador', rareza: 'potm', periodo: 'rueda' },
  ASIR: { sigla: 'ASI 1R', titulo: 'ASISTIDOR · 1ª RUEDA', familia: 'asistidor', rareza: 'potm', periodo: 'rueda' },
  PRER: { sigla: 'PRE 1R', titulo: 'PRESENCIA · 1ª RUEDA', familia: 'presencia', rareza: 'potm', periodo: 'rueda' },
  MVPR: { sigla: 'MVP 1R', titulo: 'MVP · 1ª RUEDA', familia: 'mvp', rareza: 'potm', periodo: 'rueda' },
  SGOL: { sigla: 'GOLEADORES', titulo: 'SERIE GOLEADORES', familia: 'goleadorSerie', rareza: 'totw', periodo: 'rueda', serie: true },
  SREC: { sigla: 'RECUPERADORES', titulo: 'SERIE RECUPERADORES', familia: 'recuperador', rareza: 'totw', periodo: 'rueda', serie: true },
  // La segunda rueda: los mismos premios y rarezas, en otro tono.
  GOLR2: { sigla: 'GOL 2R', titulo: 'GOLEADOR · 2ª RUEDA', familia: 'goleador2', rareza: 'potm', periodo: 'rueda' },
  ASIR2: { sigla: 'ASI 2R', titulo: 'ASISTIDOR · 2ª RUEDA', familia: 'asistidor2', rareza: 'potm', periodo: 'rueda' },
  PRER2: { sigla: 'PRE 2R', titulo: 'PRESENCIA · 2ª RUEDA', familia: 'presencia2', rareza: 'potm', periodo: 'rueda' },
  MVPR2: { sigla: 'MVP 2R', titulo: 'MVP · 2ª RUEDA', familia: 'mvp2', rareza: 'potm', periodo: 'rueda' },
  SGOL2: { sigla: 'GOLEADORES 2R', titulo: 'SERIE GOLEADORES · 2ª RUEDA', familia: 'goleadorSerie2', rareza: 'totw', periodo: 'rueda', serie: true },
  SREC2: { sigla: 'RECUPERADORES 2R', titulo: 'SERIE RECUPERADORES · 2ª RUEDA', familia: 'recuperador2', rareza: 'totw', periodo: 'rueda', serie: true },
  // Los crea el superusuario (Modo GOD · HÉROES); van con la rareza más alta y, por defecto, sólo en su evento.
  HERO: { sigla: 'HÉROE', titulo: 'HÉROE DEL CLUB', familia: 'heroe', rareza: 'toty', periodo: null },
  // Edición de evento: la crea el superusuario para el evento de Halloween.
  HALW: { sigla: 'HALLOWEEN', titulo: 'HALLOWEEN', familia: 'halloween', rareza: 'potm', periodo: null },
  // Edición de evento: los de inferiores de la Copa Futuro de Oro (diseño TOTY Icons).
  CFOR: { sigla: 'COPA FUTURO', titulo: 'COPA FUTURO DE ORO', familia: 'icono', rareza: 'toty', periodo: null },
};

/* Premios que no son especiales (su lógica es la de MySquad) pero se dibujan
   con una familia de CartaEspecial: la TOTY. */
const FAMILIA_DE_PREMIO = { TOTY: 'toty' };
export const conDisenoEspecial = (tipo) => !!familiaDe(tipo);

export const esEspecial = (tipo) => !!ESPECIALES[String(tipo || '').toUpperCase()];
export const familiaDe = (tipo) => {
  const t = String(tipo || '').toUpperCase();
  return ESPECIALES[t]?.familia || FAMILIA_DE_PREMIO[t] || null;
};

/** '3º' o '3º · EMPATE'. */
export const textoPuesto = (puesto, empate = false) => (puesto ? `${puesto}º${empate ? ' · EMPATE' : ''}` : '');
