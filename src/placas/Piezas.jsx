import React from 'react';
import { iniciales } from './club';

/* Las tres piezas que repiten todas las placas: la ceja de arriba, un escudo
 * redondo con iniciales de respaldo, y el pie con la marca y el club. */

/* La ceja de arriba. Con `club` le antepone el escudo: es el lugar donde las
 * placas que no lo muestran en otro lado dejan claro de qué club son. Las que
 * ya lo tienen grande —partido y temporada— no lo repiten acá. */
export function Ceja({ izquierda, derecha, resaltado, club, escudo, tamano = 62 }) {
  const texto = <span>{izquierda}{resaltado ? <b> · {resaltado}</b> : null}</span>;

  return (
    <div className="pl-ceja">
      {club ? (
        <div className="pl-ceja-esc">
          <Escudo url={escudo} nombre={club} className="pl-escudo"
                  style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.34) }} />
          {texto}
        </div>
      ) : texto}
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

/* El pie va anclado abajo con alto fijo (ver `.pl-pie` en la hoja), así que ya
 * no necesita que la placa le pase paddings distintos por formato. Lleva el
 * escudo del club: es la firma que aparece en todas las placas por igual. */
export function Pie({ club, detalle, escudo, style }) {
  return (
    <div className="pl-pie" style={style}>
      <div className="m">VIRTUAL<i>.CLUB</i></div>
      <div className="sep" />
      <Escudo url={escudo} nombre={club} className="pl-escudo esc" />
      <div className="cat">{[club, detalle].filter(Boolean).join(' · ').toUpperCase()}</div>
    </div>
  );
}
