import React, { useRef } from 'react';
import { getColorAccion } from '../../utils/helpers';
import { toqueEnCancha, posicionEnCancha } from '../../analytics/canchaTelefono';

/* ══════════════════════════════════════════════════════════════════════════
   CANCHA DE LA TOMA DE DATOS EN EL CELULAR

   Ocupa todo el lugar disponible. Con el teléfono parado la cancha se dibuja
   vertical (mi equipo ataca hacia arriba o hacia abajo); acostado, como en
   la PC. Devuelve cada toque en las coordenadas de la cancha acostada, que
   son las mismas que usa la vista de PC para guardar.
   ══════════════════════════════════════════════════════════════════════════ */

const linea = 'var(--border)';
const punteada = '1px dashed rgba(255,255,255,0.15)';

export default function CanchaTelefono({ vertical, direccionAtaque, eventos, marca, onToque }) {
  const ref = useRef(null);
  const atacaAlFinal = direccionAtaque === 'derecha'; // derecha (PC) = arriba (celular parado)

  const tocar = (e) => {
    const r = ref.current.getBoundingClientRect();
    onToque(toqueEnCancha(e.clientX - r.left, e.clientY - r.top, r.width, r.height, vertical));
  };

  // Del evento guardado (coordenadas de la base) a la pantalla: se da vuelta
  // según hacia dónde ataco, igual que en la vista de PC.
  const aPantalla = (ev) => (atacaAlFinal ? { x: ev.zona_x, y: ev.zona_y } : { x: 100 - ev.zona_x, y: 100 - ev.zona_y });

  const tamano = vertical
    ? { width: 'min(100%, calc((100dvh - 118px) / 2))', aspectRatio: '1 / 2' }
    : { width: 'min(100%, calc((100dvh - 96px) * 2))', aspectRatio: '2 / 1' };

  const area = (alFinal) => {
    const resaltada = alFinal === atacaAlFinal;
    const base = { position: 'absolute', border: `1px solid ${linea}`, pointerEvents: 'none', backgroundColor: resaltada ? 'rgba(0,255,136,0.07)' : 'transparent' };
    if (vertical) {
      return alFinal
        ? { ...base, top: 0, left: '25%', right: '25%', height: '15%', borderTop: 'none', borderRadius: '0 0 50% 50%' }
        : { ...base, bottom: 0, left: '25%', right: '25%', height: '15%', borderBottom: 'none', borderRadius: '50% 50% 0 0' };
    }
    return alFinal
      ? { ...base, right: 0, top: '25%', bottom: '25%', width: '15%', borderRight: 'none', borderRadius: '50% 0 0 50%' }
      : { ...base, left: 0, top: '25%', bottom: '25%', width: '15%', borderLeft: 'none', borderRadius: '0 50% 50% 0' };
  };

  const conPuntos = eventos.filter((e) => e.zona_x !== null && e.zona_x !== undefined);

  return (
    <div
      ref={ref}
      onClick={tocar}
      style={{
        ...tamano, maxHeight: '100%', position: 'relative', cursor: 'crosshair', touchAction: 'manipulation',
        backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)', backgroundSize: '15px 15px',
        border: `2px solid ${linea}`, overflow: 'hidden', boxSizing: 'border-box',
      }}
    >
      {/* flecha de ataque */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '7rem', opacity: 0.06, pointerEvents: 'none' }}>
        {vertical ? (atacaAlFinal ? '⬆️' : '⬇️') : (atacaAlFinal ? '➡️' : '⬅️')}
      </div>

      {/* mitad de cancha y círculo central */}
      {vertical
        ? <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: linea, pointerEvents: 'none' }} />
        : <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: linea, pointerEvents: 'none' }} />}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: vertical ? '30%' : '15%', aspectRatio: '1', border: `1px solid ${linea}`, borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

      {/* áreas: la resaltada es la que ataco */}
      <div style={area(false)} />
      <div style={area(true)} />

      {/* la grilla de 4 zonas y 3 carriles de la vista de PC, rotada */}
      {vertical ? (
        <>
          <div style={{ position: 'absolute', top: '25%', left: 0, right: 0, borderTop: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '75%', left: 0, right: 0, borderTop: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, borderLeft: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, borderLeft: punteada, pointerEvents: 'none' }} />
        </>
      ) : (
        <>
          <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, borderLeft: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: '75%', top: 0, bottom: 0, borderLeft: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, borderTop: punteada, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, borderTop: punteada, pointerEvents: 'none' }} />
        </>
      )}

      {/* eventos: el último, resaltado */}
      {conPuntos.map((ev, i) => {
        const p = aPantalla(ev);
        const { left, top } = posicionEnCancha(p.x, p.y, vertical);
        const ultimo = i === conPuntos.length - 1;
        return (
          <div key={ev.id} style={{
            position: 'absolute', left: `${left}%`, top: `${top}%`, width: ultimo ? 16 : 11, height: ultimo ? 16 : 11,
            background: getColorAccion(ev.accion), border: ultimo ? '2px solid #fff' : '2px solid #000', borderRadius: 2,
            transform: 'translate(-50%, -50%)', opacity: ultimo ? 1 : 0.35, pointerEvents: 'none',
            boxShadow: ultimo ? `0 0 12px ${getColorAccion(ev.accion)}` : 'none',
          }} />
        );
      })}

      {/* el lugar que se está registrando */}
      {marca && (() => {
        const { left, top } = posicionEnCancha(marca.x, marca.y, vertical);
        return <div style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: 26, height: 26, border: '3px solid var(--accent)', borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', boxShadow: '0 0 14px var(--accent)' }} />;
      })()}
    </div>
  );
}
