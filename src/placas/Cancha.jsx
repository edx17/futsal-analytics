import React from 'react';
import { LARGO_M, ANCHO_M } from './medidas';

/* CANCHA DE FUTSAL REGLAMENTARIA
 *
 * El viewBox está EN METROS (40 × 20), así que cada coordenada del dibujo es
 * literalmente una medida de la cancha y no hay que convertir nada:
 *
 *   · Superficie      40 × 20 m
 *   · Arco            3 m de ancho  → postes en y = 8,5 y y = 11,5
 *   · Área penal      cuartos de círculo de 6 m de radio trazados desde cada
 *                     poste, unidos por una recta paralela a la línea de meta
 *   · Círculo central 3 m de radio
 *   · Penal           a 6 m · Doble penal a 10 m
 *   · Córner          arco de 25 cm
 *
 * Es la misma geometría que dibuja el motor de la pizarra (tactica/pizarra.js).
 * Antes las placas dibujaban un área con `border-radius`, que no es la forma
 * real y se notaba.
 */

export default function Cancha({
  color = 'rgba(255,255,255,.32)',
  fondo = '#0A100D',
  grosor = 0.16,
  mitad = false,          // sólo el campo de ataque
  children,               // lo que se dibuja encima, también en metros
  style,
  className = '',
}) {
  const x0 = mitad ? LARGO_M / 2 : 0;
  const ancho = mitad ? LARGO_M / 2 : LARGO_M;

  const area = (izq) => (izq
    ? 'M 0,2.5 A 6,6 0 0 1 6,8.5 L 6,11.5 A 6,6 0 0 1 0,17.5'
    : 'M 40,2.5 A 6,6 0 0 0 34,8.5 L 34,11.5 A 6,6 0 0 0 40,17.5');

  return (
    <svg
      className={className}
      style={style}
      viewBox={`${x0} 0 ${ancho} ${ANCHO_M}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={x0} y="0" width={ancho} height={ANCHO_M} fill={fondo} />

      {children}

      <g fill="none" stroke={color} strokeWidth={grosor}>
        <rect x={x0 + grosor / 2} y={grosor / 2}
              width={ancho - grosor} height={ANCHO_M - grosor} />
        {!mitad && <line x1="20" y1="0" x2="20" y2={ANCHO_M} />}
        {!mitad && <circle cx="20" cy="10" r="3" />}
        {mitad && <path d="M 20,7 A 3,3 0 0 1 20,13" />}
        {!mitad && <path d={area(true)} />}
        <path d={area(false)} />
        {!mitad && <>
          <path d="M 0,.25 A .25,.25 0 0 0 .25,0" />
          <path d="M 0,19.75 A .25,.25 0 0 1 .25,20" />
        </>}
        <path d="M 39.75,0 A .25,.25 0 0 0 40,.25" />
        <path d="M 39.75,20 A .25,.25 0 0 1 40,19.75" />
      </g>

      {/* Penales y doble penales */}
      <g fill={color}>
        {!mitad && <>
          <circle cx="20" cy="10" r=".15" />
          <circle cx="6" cy="10" r=".15" />
          <circle cx="10" cy="10" r=".15" />
        </>}
        <circle cx="34" cy="10" r=".15" />
        <circle cx="30" cy="10" r=".15" />
      </g>

      {/* Arcos, apenas fuera de la línea de meta */}
      <g stroke={color} strokeWidth={grosor * 1.8} fill="none">
        {!mitad && <path d="M -.32,8.5 L -.32,11.5" />}
        <path d="M 40.32,8.5 L 40.32,11.5" />
      </g>
    </svg>
  );
}
