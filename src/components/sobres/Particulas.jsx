import React, { useMemo } from 'react';
import { azarFijo } from '../../analytics/aperturas';

/* PARTÍCULAS DE LA APERTURA
 *
 * 'junta':   suben y se acercan al sobre (se carga de energía).
 * 'estalla': salen del centro para todos lados (el clímax).
 * Las posiciones son fijas para cada semilla: no saltan en cada render.
 */
export default function Particulas({ cantidad = 40, colores = ['#ffffff'], modo = 'junta', semilla = 1 }) {
  const lista = useMemo(() => Array.from({ length: cantidad }, (_, i) => {
    const r = (k) => azarFijo(semilla * 97 + i * 13 + k);
    const ang = r(0) * Math.PI * 2;
    const dist = 30 + r(1) * 70; // vw/vh
    return {
      i,
      color: colores[i % colores.length],
      tam: 2 + r(2) * 5,
      delay: r(3) * (modo === 'junta' ? 1.1 : 0.25),
      dur: modo === 'junta' ? 0.9 + r(4) * 0.8 : 0.7 + r(4) * 0.9,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist * 0.75,
    };
  }), [cantidad, colores, modo, semilla]);

  return (
    <div className={`ap-particulas ap-p-${modo}`} aria-hidden="true">
      {lista.map((p) => (
        <i key={p.i} style={{
          background: p.color, width: p.tam, height: p.tam, boxShadow: `0 0 ${p.tam * 2}px ${p.color}`,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--px': `${p.x}vw`, '--py': `${p.y}vh`,
        }} />
      ))}
    </div>
  );
}
