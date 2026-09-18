import React from 'react';
import { iniciales } from './club';

/* Las tres piezas que repiten todas las placas: la ceja de arriba, un escudo
 * redondo con iniciales de respaldo, y el pie con la marca y el club. */

export function Ceja({ izquierda, derecha, resaltado }) {
  return (
    <div className="pl-ceja">
      <span>{izquierda}{resaltado ? <b> · {resaltado}</b> : null}</span>
      <span>{derecha}</span>
    </div>
  );
}

export function Escudo({ url, nombre, lado = 'l', className = 'pl-esc', style }) {
  return (
    <div className={`${className} ${className === 'pl-esc' ? `pl-esc-${lado}` : ''}`.trim()} style={style}>
      {url ? <img src={url} alt="" crossOrigin="anonymous" /> : iniciales(nombre)}
    </div>
  );
}

export function Pie({ club, detalle, esStory, style }) {
  return (
    <div className="pl-pie" style={{ ...(esStory ? { paddingBottom: 120 } : null), ...style }}>
      <div className="m">VIRTUAL<i>.CLUB</i></div>
      <div className="sep" />
      <div className="cat">{[club, detalle].filter(Boolean).join(' · ').toUpperCase()}</div>
    </div>
  );
}
