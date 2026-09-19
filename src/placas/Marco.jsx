import React from 'react';
import Ajustado from './Ajustado';
import { Pie } from './Piezas';
import { formatoDe, MARGEN_SUPERIOR } from './formatos';

/* LA ESTRUCTURA QUE COMPARTEN TODAS LAS PLACAS
 *
 *   ┌─ .pl-cont ────────────────┐
 *   │  contenido, que se encoge │  ← Ajustado
 *   │  si no entra              │
 *   ├───────────────────────────┤
 *   │  pie, anclado abajo       │  ← alto fijo, no se lo puede comer nadie
 *   └───────────────────────────┘
 *
 * El margen de arriba sale de acá y es el mismo para las seis: antes cada una
 * traía el suyo y no había razón para que fueran distintos.
 */

export default function Marco({ formato, club, children }) {
  const f = formatoDe(formato?.id);
  const arriba = MARGEN_SUPERIOR[f.id] ?? MARGEN_SUPERIOR.feed;
  const disponible = f.alto - arriba - f.altoPie;

  return (
    <div
      className="pl-cont"
      style={{ paddingTop: arriba, paddingBottom: f.altoPie, '--pl-alto-pie': `${f.altoPie}px` }}
    >
      <Ajustado alto={disponible}>{children}</Ajustado>
      <Pie club={club} />
    </div>
  );
}
