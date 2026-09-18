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

/* El 30 del pie es el que ya trae `.pl-pie`. Se nombra siempre en vez de
 * agregarlo sólo para la historia: un `paddingBottom` que aparece y desaparece
 * sobre el `padding` abreviado de la hoja hace que React avise en cada cambio
 * de formato, y el aviso tiene razón. */
export function Pie({ club, detalle, esStory, style }) {
  return (
    <div className="pl-pie" style={{ paddingBottom: esStory ? 120 : 30, ...style }}>
      <div className="m">VIRTUAL<i>.CLUB</i></div>
      <div className="sep" />
      <div className="cat">{[club, detalle].filter(Boolean).join(' · ').toUpperCase()}</div>
    </div>
  );
}
