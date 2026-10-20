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
// La serie de goleadores es la familia goleador, con distintivo de puesto.
FAMILIAS.goleadorSerie = { ...FAMILIAS.goleador, serie: true, titulo: 'GOLEADORES' };

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
};

export const esEspecial = (tipo) => !!ESPECIALES[String(tipo || '').toUpperCase()];
export const familiaDe = (tipo) => ESPECIALES[String(tipo || '').toUpperCase()]?.familia || null;

/** '3º' o '3º · EMPATE'. */
export const textoPuesto = (puesto, empate = false) => (puesto ? `${puesto}º${empate ? ' · EMPATE' : ''}` : '');
