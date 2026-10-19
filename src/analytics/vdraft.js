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

/** Lo que pide el draft ahora mismo, para el título de la pantalla. */
export function pasoDelDraft(partida) {
  if (!partida || partida.estado !== 'draft') return null;
  if (partida.paso === 'capitan') return { titulo: 'ELEGÍ TU CAPITÁN', ayuda: 'Una de estas cartas especiales. Va al lugar de su puesto.' };
  if (partida.paso === 'banco') {
    return { titulo: `SUPLENTE ${(partida.banco?.length || 0) + 1} DE 2`, ayuda: 'Entran entre partido y partido si cambiás.' };
  }
  const roles = partida.lugares?.[partida.lugar_actual]?.roles || [];
  const vacios = (partida.equipo || []).filter((c) => !c).length;
  return { titulo: `ELEGÍ ${roles.join(' / ')}`, ayuda: `Te ${vacios === 1 ? 'falta 1 lugar' : `faltan ${vacios} lugares`} en la cancha.` };
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
