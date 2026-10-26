/* V-DRAFT · LO QUE MUESTRA LA PANTALLA (sin pantalla, para poder probarlo)
 *
 *   - el camino de premios (4 escalones, uno por victoria);
 *   - el podio del ranking (2º, 1º, 3º) y el resto;
 *   - a qué lugar vuela la carta que elegís en el draft.
 */

import { PREMIOS, NOMBRE_SOBRE } from './vdraft';

const ESCALONES = [
  { titulo: 'CUARTOS', trofeo: 'bronce' },
  { titulo: 'SEMIFINAL', trofeo: 'plata' },
  { titulo: 'CAMPEÓN', trofeo: 'oro' },
  { titulo: 'CAMPEÓN DE CAMPEONES', trofeo: 'leyenda' },
];

/** Los 4 escalones del camino: qué ganás si llegás a cada uno. */
export function caminoDePremios() {
  return PREMIOS.map((p, i) => ({
    ...ESCALONES[i],
    victorias: p.victorias,
    vcoins: p.vcoins,
    sobre: p.sobre ? NOMBRE_SOBRE[p.sobre].replace(/\s*\(.*\)$/, '') : null,
  }));
}

/**
 * El ranking en podio: { podio: [2º, 1º, 3º] (los que haya), resto, yo }.
 * Cada uno lleva su `puesto`. `yo` es mi puesto (o null si no jugué).
 */
export function podioDelRanking(ranking = []) {
  const lista = (ranking || []).map((r, i) => ({ ...r, puesto: i + 1 }));
  const [primero, segundo, tercero] = lista;
  return {
    podio: [segundo, primero, tercero].filter(Boolean),
    resto: lista.slice(3),
    yo: lista.find((r) => r.yo)?.puesto ?? null,
  };
}

/**
 * Adónde va la carta que elegís:
 *   { banco: j } en el paso del banco;
 *   { lugar: i } en la cancha. El capitán va al primer lugar de su
 *   puesto; si no hay, al arco si es arquero y si no al lugar 1 (igual que
 *   vdraft_elegir en la base). El resto, al lugar que pide el draft.
 */
export function destinoDeCarta(partida, carta) {
  if (!partida) return null;
  if (partida.paso === 'banco') return { banco: partida.banco?.length || 0 };
  if (partida.paso === 'capitan') {
    const rol = carta?.carta?.rol;
    const i = (partida.lugares || []).findIndex((l) => (l.roles || []).includes(rol));
    return { lugar: i !== -1 ? i : rol === 'ARQ' ? 0 : 1 };
  }
  return { lugar: partida.lugar_actual ?? 0 };
}

/** Cuántos lugares lleva elegidos el draft (de 1 capitán + 4 más + 2 suplentes = 7). */
export function avanceDelDraft(partida) {
  const titulares = (partida?.equipo || []).filter(Boolean).length;
  const banco = partida?.banco?.length || 0;
  return { hechos: titulares + banco, total: 7 };
}
