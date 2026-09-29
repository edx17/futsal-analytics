import React from 'react';
import Marco from './Marco';
import { Ceja } from './Piezas';
import { iniciales } from './club';

/* PLACA DE FIGURA DEL PARTIDO
 *
 * La placa de partido ya trae a la figura en un recuadro, pero chico: es un
 * dato entre otros. Esta es la que se publica sola, con la foto grande, el
 * nombre y el rating como protagonistas. Los datos son los mismos que arma
 * Resumen para la placa de partido (`datosPlaca.figura`), así las dos nunca
 * muestran figuras distintas.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PlacaFigura({ datos, formato }) {
  if (!datos?.figura) return null;
  const { club = {}, rival = {}, resultado = {}, info = {}, figura } = datos;
  const esStory = formato?.id === 'story';
  const pm = num(figura.plusMinus);

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <Ceja
          club={club.nombre} escudo={club.escudo} tamano={esStory ? 66 : 58}
          izquierda={info.torneo || 'AMISTOSO'} resaltado={info.jornada}
          derecha={info.fecha}
        />

        <div className="pl-fg-foto" style={{ height: esStory ? 900 : 590, marginTop: esStory ? 40 : 30 }}>
          {figura.foto
            ? <img src={figura.foto} alt="" crossOrigin="anonymous" />
            : <span className="ini">{iniciales(figura.nombre)}</span>}
          <div className="velo" />
          <div className="rol">{[figura.dorsal ? `#${figura.dorsal}` : null, figura.rol].filter(Boolean).join(' · ')}</div>
          <div className="nota">{figura.rating}</div>
        </div>

        <div style={{ marginTop: esStory ? 44 : 30 }}>
          <div className="pl-fg-et">{figura.etiqueta || 'FIGURA DEL PARTIDO'}</div>
          <div className="pl-fg-n" style={esStory ? { fontSize: 110 } : undefined}>{figura.nombre}</div>
        </div>

        <div className="pl-fg-g" style={{ marginTop: esStory ? 44 : 30 }}>
          <div><b style={{ color: 'var(--pl-club)' }}>{num(figura.goles)}</b><span>{num(figura.goles) === 1 ? 'GOL' : 'GOLES'}</span></div>
          <div><b>{num(figura.remates)}</b><span>REMATES</span></div>
          <div><b>{num(figura.recuperaciones)}</b><span>RECUP.</span></div>
          <div><b style={{ color: pm > 0 ? 'var(--pl-club)' : pm < 0 ? 'var(--pl-rival)' : undefined }}>{pm > 0 ? `+${pm}` : pm}</b><span>+/−</span></div>
        </div>

        <div className="pl-fg-res" style={{ marginTop: esStory ? 48 : 30 }}>
          VS <b>{String(rival.nombre || 'RIVAL').toUpperCase()}</b>
          <b style={{ color: 'var(--pl-club)' }}>{num(resultado.propios)}-{num(resultado.rival)}</b>
        </div>

      </Marco>
    </>
  );
}
