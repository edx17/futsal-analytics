import React from 'react';

/* LA CANCHA DE FUTSAL VISTA DESDE ARRIBA, A ESCALA
 *
 * 40 × 20 m, como manda el reglamento: línea media, círculo central de 3 m,
 * áreas de 6 m (dos cuartos de círculo con centro en cada palo, unidos por
 * una recta de 3 m), punto penal a 6 m, doble penal a 10 m, arcos de 3 × 2 m,
 * cuartos de círculo de córner y las marcas de la zona de cambios.
 * Las unidades del SVG son metros (con 1,5 m de aire para los arcos).
 * `pelota`: { x, y } en metros; `gol`: 'propio' | 'rival' (se ilumina ese arco).
 */
const L = 40;
const A = 20;
const M = 1.5;
const POSTE = 1.5; // medio arco

const area = (xArco, sentido) => {
  const r = 6;
  const y1 = A / 2 - POSTE;
  const y2 = A / 2 + POSTE;
  const x = xArco + sentido * r;
  // cuarto de círculo desde la línea de fondo hasta el frente, recta y el otro cuarto.
  return `M ${xArco} ${y1 - r} A ${r} ${r} 0 0 ${sentido > 0 ? 1 : 0} ${x} ${y1} L ${x} ${y2} A ${r} ${r} 0 0 ${sentido > 0 ? 1 : 0} ${xArco} ${y2 + r}`;
};

export default function CanchaPlana({ pelota, gol, children }) {
  const linea = { fill: 'none', stroke: 'rgba(255,255,255,.75)', strokeWidth: 0.12 };
  return (
    <svg className="vd-plana" viewBox={`${-M} ${-M} ${L + 2 * M} ${A + 2 * M}`} role="img" aria-label="Cancha de futsal">
      <defs>
        <pattern id="vd-franjas" width="8" height={A} patternUnits="userSpaceOnUse">
          <rect width="4" height={A} fill="#14532d" />
          <rect x="4" width="4" height={A} fill="#166534" />
        </pattern>
        <radialGradient id="vd-luz" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="rgba(255,255,255,.10)" />
          <stop offset="1" stopColor="rgba(0,0,0,.25)" />
        </radialGradient>
      </defs>
      <rect x={-M} y={-M} width={L + 2 * M} height={A + 2 * M} rx="0.6" fill="#0b3b20" />
      <rect x="0" y="0" width={L} height={A} fill="url(#vd-franjas)" />
      <rect x="0" y="0" width={L} height={A} fill="url(#vd-luz)" />

      <rect x="0" y="0" width={L} height={A} {...linea} />
      <line x1={L / 2} y1="0" x2={L / 2} y2={A} {...linea} />
      <circle cx={L / 2} cy={A / 2} r="3" {...linea} />
      <circle cx={L / 2} cy={A / 2} r="0.15" fill="rgba(255,255,255,.85)" />
      <path d={area(0, 1)} {...linea} />
      <path d={area(L, -1)} {...linea} />
      {[6, 10, L - 6, L - 10].map((x) => <circle key={x} cx={x} cy={A / 2} r="0.13" fill="rgba(255,255,255,.85)" />)}
      {[[0, 0, 0.25, 0, 0, 0.25], [L, 0, L - 0.25, 0, L, 0.25], [0, A, 0.25, A, 0, A - 0.25], [L, A, L - 0.25, A, L, A - 0.25]].map(([, , x1, y1, x2, y2], i) => (
        <path key={i} d={`M ${x1} ${y1} A 0.25 0.25 0 0 ${i === 1 || i === 2 ? 0 : 1} ${x2} ${y2}`} {...linea} />
      ))}
      {[L / 2 - 5, L / 2 + 5, L / 2 - 10, L / 2 + 10].map((x) => <line key={x} x1={x} y1={A} x2={x} y2={A + 0.4} {...linea} />)}

      {/* arcos: el de la izquierda es el mío; el de la derecha, el del rival */}
      <rect x={-1} y={A / 2 - POSTE} width="1" height={2 * POSTE} className={`vd-arco${gol === 'rival' ? ' vd-arco-gol' : ''}`} />
      <rect x={L} y={A / 2 - POSTE} width="1" height={2 * POSTE} className={`vd-arco${gol === 'propio' ? ' vd-arco-gol' : ''}`} />

      {pelota && (
        <g className="vd-pelota" style={{ transform: `translate(${pelota.x}px, ${pelota.y}px)` }}>
          <ellipse cx="0.12" cy="0.35" rx="0.45" ry="0.18" fill="rgba(0,0,0,.35)" />
          <circle r="0.42" fill="#fff" stroke="#111" strokeWidth="0.06" />
          <circle r="0.15" fill="#111" />
        </g>
      )}
      {children}
    </svg>
  );
}
