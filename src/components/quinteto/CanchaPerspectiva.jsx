import React, { useEffect, useMemo, useRef, useState } from 'react';
import CartaJugador from './CartaJugador';
import { LIENZO, proyectar, dibujoCancha } from './perspectiva';

/* LA CANCHA CON LAS CARTAS PARADAS ENCIMA
 *
 * El dibujo es un SVG en un lienzo fijo (840 de ancho) que se estira al ancho
 * disponible. Las cartas son HTML encima, cada una parada sobre su punto de la
 * cancha y más chica cuanto más al fondo está. La escala sale del ancho real
 * del contenedor, así en el celular entra todo sin desarmarse.
 */

const COLOR_LINEA = { verde: '#00ff88', amarilla: '#fbbf24', roja: '#ef4444' };
const ALTO_TOTAL = 640; // 610 de cancha + aire abajo para el chip del arquero

export default function CanchaPerspectiva({ formacion, alineacion = [], lineas = [], seleccionado = null, onElegir }) {
  const ref = useRef(null);
  const [escala, setEscala] = useState(1);
  const dibujo = useMemo(() => dibujoCancha(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    /* En pantallas angostas las cartas a escala quedan ilegibles: se
       agrandan un poco más que la cancha (entran igual, hay aire entre ellas). */
    const medir = () => {
      const e = el.clientWidth / LIENZO.ancho || 1;
      setEscala(el.clientWidth < 600 ? e * 1.35 : e);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const puntos = formacion.lugares.map((l) => proyectar(l.u, l.v));
  // De atrás para adelante: las de adelante tapan a las del fondo.
  const orden = formacion.lugares.map((l, i) => i).sort((a, b) => formacion.lugares[a].v - formacion.lugares[b].v);

  return (
    <div className="mq-cancha" ref={ref}>
      <svg viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`} preserveAspectRatio="none">
        <polygon points={dibujo.pasto} fill="#2f3a35" />
        {dibujo.franjas.map((f, i) => <polygon key={i} points={f} fill="rgba(255,255,255,.035)" />)}
        {dibujo.lineas.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth={i === 0 ? 2.5 : 2} strokeLinejoin="round" />)}
        {dibujo.arcos.map((d, i) => <path key={i} d={d} fill="none" stroke="rgba(255,255,255,.5)" strokeWidth={2.5} />)}
        {dibujo.puntos.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={3 * p.esc} ry={2 * p.esc} fill="rgba(255,255,255,.45)" />)}

        {lineas.map((l) => (
          <line key={`${l.i}-${l.j}`} x1={puntos[l.i].x} y1={puntos[l.i].y} x2={puntos[l.j].x} y2={puntos[l.j].y}
            stroke={COLOR_LINEA[l.color]} strokeWidth={3} strokeOpacity={0.85} strokeLinecap="round" />
        ))}
        {puntos.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={46 * p.esc} ry={11 * p.esc} fill="rgba(0,0,0,.45)" />)}
      </svg>

      {orden.map((i) => {
        const p = puntos[i];
        const lugar = formacion.lugares[i];
        const s = escala * (0.74 + 0.26 * lugar.v);
        const style = {
          left: `${(p.x / LIENZO.ancho) * 100}%`,
          top: `${(p.y / ALTO_TOTAL) * 100}%`,
          transform: `translate(-50%, calc(-100% - 10px)) scale(${s})`,
          zIndex: 10 + Math.round(lugar.v * 10),
        };
        const carta = alineacion[i];
        return carta
          ? <CartaJugador key={i} carta={carta} style={style} seleccionada={seleccionado === i} onClick={() => onElegir?.(i)} />
          : (
            <div key={i} className={`mq-vacio${seleccionado === i ? ' mq-sel' : ''}`} style={style} onClick={() => onElegir?.(i)}>
              {lugar.rol}
            </div>
          );
      })}

      <div className="mq-formacion-tag">{formacion.id}</div>
    </div>
  );
}
