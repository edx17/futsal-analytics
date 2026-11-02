import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bloque } from './Bloques';

/* MODO PRESENTACIÓN
 *
 * El mismo reporte, una sección por diapositiva y a pantalla completa: para
 * mostrarlo en una reunión, en un televisor o en la cena de fin de año.
 * Flechas del teclado, espacio, deslizar con el dedo o tocar los costados.
 * Escape sale.
 */
/* Los bloques que ocupan una pantalla entera. Una sección con más de uno se
   parte en varias diapositivas (con el mismo título), para que nada quede
   cortado; el texto y las listas acompañan al gráfico anterior. */
const GRANDES = new Set(['serie', 'barras', 'tabla', 'ranking']);

function diapositivas(secciones = []) {
  return secciones.flatMap((s) => {
    const grandes = s.bloques.filter((b) => GRANDES.has(b.tipo)).length;
    if (grandes <= 1) return [s];
    const partes = [];
    s.bloques.forEach((b) => {
      if (GRANDES.has(b.tipo) || !partes.length) partes.push({ ...s, id: `${s.id}-${partes.length}`, bloques: [b] });
      else partes[partes.length - 1].bloques.push(b);
    });
    return partes;
  });
}

export default function Presentacion({ reporte, onCerrar }) {
  const [i, setI] = useState(0);
  const raiz = useRef(null);
  const diapos = diapositivas(reporte.secciones);
  const total = diapos.length;
  const ir = useCallback((d) => setI((x) => Math.max(0, Math.min(total - 1, x + d))), [total]);
  const toque = useRef(null);

  useEffect(() => {
    const tecla = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); ir(1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); ir(-1); }
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', tecla);
    raiz.current?.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('keydown', tecla);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [ir, onCerrar]);

  const s = diapos[i];
  return (
    <div ref={raiz} className="rp-presentacion"
      onTouchStart={(e) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (toque.current ?? 0);
        if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
      }}>
      <div className="rp-diapo" key={s.id}>
        {s.id !== 'portada' && <h2 className="rp-diapo-titulo">{s.titulo}</h2>}
        <div className="rp-diapo-cuerpo">
          {s.bloques.map((b, k) => <Bloque key={`${s.id}-${k}`} b={b} grande />)}
        </div>
      </div>
      <button type="button" className="rp-zona rp-zona-izq" aria-label="Anterior" onClick={() => ir(-1)} />
      <button type="button" className="rp-zona rp-zona-der" aria-label="Siguiente" onClick={() => ir(1)} />
      <div className="rp-diapo-pie">
        <span>{reporte.titulo}</span>
        <span className="rp-puntos">{diapos.map((x, k) => <i key={x.id} className={k === i ? 'activo' : ''} />)}</span>
        <span>{i + 1} / {total}</span>
        <button type="button" className="rp-salir" onClick={onCerrar}>SALIR</button>
      </div>
    </div>
  );
}
