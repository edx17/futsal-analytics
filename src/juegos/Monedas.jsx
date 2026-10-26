import React from 'react';
import { pseudoAzar } from '../analytics/vdraft';

/* Las V-Coins de un premio, cayendo (estilos en pages/vdraft.css: .vd-monedas-caen). */
export default function Monedas({ n, semilla = 1 }) {
  return (
    <div className="vd-monedas-caen" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const r = (k) => pseudoAzar(semilla * 17 + i * 11 + k);
        return (
          <i key={i} style={{ left: `${4 + r(0) * 92}%`, animationDuration: `${1.6 + r(1) * 1.4}s`, animationDelay: `${0.4 + r(2) * 1.6}s`, '--tam': `${22 + r(3) * 14}px` }}>V</i>
        );
      })}
    </div>
  );
}
