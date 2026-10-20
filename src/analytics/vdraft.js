import { FORMACIONES } from './quinteto';
import { nombreZona } from './liga';

/* V-DRAFT
 *
 * Un draft con las cartas del club y un torneo de cuatro partidos contra
 * equipos reales de la liga (Primera D, C, B y A). Todo corre en la base
 * (migración 20261020120000_vdraft.sql): las ofertas, la simulación y los
 * premios. Esto es el espejo en JS para mostrar las reglas; si se cambia un
 * número, hay que cambiarlo en los dos lados.
 */

export const COSTO_PARTIDA = 100;

export const FORMACIONES_DRAFT = ['2-2', '1-2-1', '3-1', '4-0'].map((id) => FORMACIONES[id]);

/* Lo que se gana según los partidos ganados. Perdés y se termina. */
export const PREMIOS = [
  { victorias: 1, vcoins: 25, sobre: null },
  { victorias: 2, vcoins: 75, sobre: null },
  { victorias: 3, vcoins: 150, sobre: 'premio' },
  { victorias: 4, vcoins: 300, sobre: 'premio_especial' },
];

export const NOMBRE_SOBRE = {
  premio: 'SOBRE DE CAMPEÓN (3 cartas)',
  premio_especial: 'SOBRE ESPECIAL (5 cartas especiales)',
};

export const RONDAS = ['CUARTOS DE FINAL', 'SEMIFINAL', 'FINAL', 'CAMPEÓN DE CAMPEONES'];

export const premioPorVictorias = (v) => PREMIOS.find((p) => p.victorias === Math.min(4, v)) || { victorias: 0, vcoins: 0, sobre: null };

/** Lo que pide el draft ahora mismo, para el título de la pantalla.
 *  Igual que la base: capitán especial, arquero (2 comunes y 2 especiales),
 *  lugares de campo con cartas comunes y el último, "comodín", con 1 especial. */
export function pasoDelDraft(partida) {
  if (!partida || partida.estado !== 'draft') return null;
  if (partida.paso === 'capitan') return { titulo: 'ELEGÍ TU CAPITÁN', ayuda: 'Una de estas cartas especiales. Va al lugar de su puesto.' };
  if (partida.paso === 'banco') {
    return { titulo: `SUPLENTE ${(partida.banco?.length || 0) + 1} DE 2`, ayuda: 'Cartas comunes. Entran entre partido y partido si cambiás.' };
  }
  const roles = partida.lugares?.[partida.lugar_actual]?.roles || [];
  const vacios = (partida.equipo || []).filter((c) => !c).length;
  const faltan = `Te ${vacios === 1 ? 'falta 1 lugar' : `faltan ${vacios} lugares`} en la cancha.`;
  if (partida.lugar_actual === 0) return { titulo: 'ELEGÍ TU ARQUERO', ayuda: `Hay comunes y especiales. ${faltan}` };
  if (vacios === 1) return { titulo: `COMODÍN · ${roles.join(' / ')}`, ayuda: 'El último lugar: una de las 4 cartas es especial.' };
  return { titulo: `ELEGÍ ${roles.join(' / ')}`, ayuda: `Cartas comunes (bronce, plata u oro). ${faltan}` };
}

/**
 * Química y fuerza del equipo (igual que _vdraft_fuerza en la base):
 * +20 por jugador en su puesto, +8 fuera de puesto; un arquero que no está en
 * el arco (o un jugador de campo en el arco) resta 6 de fuerza.
 * fuerza = media + (química - 80) / 5.
 */
export function fuerzaDelEquipo(equipo = [], lugares = []) {
  let quimica = 0;
  let suma = 0;
  let n = 0;
  let arqMal = false;
  equipo.forEach((c, i) => {
    if (!c) return;
    const rol = c.carta?.rol;
    suma += Number(c.carta?.ovr ?? 60);
    n += 1;
    if ((lugares[i]?.roles || []).includes(rol)) quimica += 20;
    else if (i === 0 || rol === 'ARQ') arqMal = true;
    else quimica += 8;
  });
  if (!n) return { media: 0, quimica: 0, fuerza: 0 };
  const media = suma / n;
  const r1 = (x) => Math.round(x * 10) / 10;
  return { media: r1(media), quimica, fuerza: r1(media + (quimica - 80) / 5 - (arqMal ? 6 : 0)) };
}

/** "3-2" o "2-2 (4-3 pen.)". */
export function marcador(p) {
  if (!p) return '';
  const base = `${p.goles_propios}-${p.goles_rival}`;
  return p.penales ? `${base} (${p.penales} pen.)` : base;
}

/** El texto del puesto del rival en su tabla: "1° de 19 · Zona 1". */
export function puestoRival(r) {
  if (!r?.puesto) return `Primera ${r?.division || ''}`.trim();
  const zona = r.zona ? ` · ${nombreZona(r.zona)}` : '';
  return `${r.puesto}° de ${r.de}${zona} · Primera ${r.division}`;
}

/**
 * Las líneas de química de la cancha (como en MySquad): verde si los dos
 * juegan en su puesto, amarilla si uno solo, roja si ninguno.
 */
export function lineasDraft(equipo = [], formacion) {
  const enPuesto = (i) => (formacion.lugares[i]?.roles || []).includes(equipo[i]?.carta?.rol);
  return formacion.enlaces
    .filter(([i, j]) => equipo[i] && equipo[j])
    .map(([i, j]) => {
      const n = Number(enPuesto(i)) + Number(enPuesto(j));
      return { i, j, color: n === 2 ? 'verde' : n === 1 ? 'amarilla' : 'roja' };
    });
}

/* Un número "al azar" pero fijo para cada semilla: así la pelota y los
   papelitos se mueven distinto en cada partido sin ensuciar el render. */
export const pseudoAzar = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Dónde anda la pelota en un minuto (cancha de 40×20 m; ataco hacia la derecha). */
export function pelotaEn(minuto, goles = [], semilla = 0) {
  const gol = goles.find((g) => g.minuto === minuto);
  if (gol) return { x: gol.equipo === 'propio' ? 40.6 : -0.6, y: 10 + (pseudoAzar(semilla + minuto) - 0.5) * 2, gol: gol.equipo };
  return { x: 4 + pseudoAzar(semilla + minuto * 3) * 32, y: 2.5 + pseudoAzar(semilla + minuto * 7 + 1) * 15, gol: null };
}
