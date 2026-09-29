import React from 'react';
import Marco from './Marco';
import { Ceja } from './Piezas';
import { iniciales } from './club';

/* PLACA DE CUMPLEAÑOS
 *
 * Sale de la Agenda, desde el cumpleaños del jugador. Es la placa que más se
 * publica en un club y la única que no lleva números: foto, nombre y edad.
 */

export default function PlacaCumple({ datos, formato }) {
  if (!datos?.jugador) return null;
  const { club = {}, jugador, anios, fecha } = datos;
  const esStory = formato?.id === 'story';
  const nombre = [jugador.nombre, jugador.apellido].filter(Boolean).join(' ').toUpperCase();
  const lado = esStory ? 520 : 420;

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <Ceja
          club={club.nombre} escudo={club.escudo} tamano={esStory ? 66 : 58}
          izquierda="CUMPLEAÑOS" resaltado={jugador.categoria}
          derecha={fecha}
        />

        <div className="pl-cu-foto" style={{ width: lado, height: lado, marginTop: esStory ? 110 : 56 }}>
          {jugador.foto
            ? <img src={jugador.foto} alt="" crossOrigin="anonymous" />
            : <span className="ini" style={{ fontSize: lado * 0.42 }}>{iniciales(nombre)}</span>}
        </div>

        <div className="pl-cu-t" style={{ fontSize: esStory ? 150 : 124, marginTop: esStory ? 90 : 50 }}>
          ¡FELIZ CUMPLE!
        </div>

        <div className="pl-cu-n" style={{ fontSize: esStory ? 72 : 60, marginTop: esStory ? 40 : 26 }}>
          {nombre}
        </div>

        {anios > 0 && (
          <div className="pl-cu-a" style={{ marginTop: esStory ? 40 : 26 }}>
            <div style={{ fontSize: esStory ? 30 : 26 }}>{anios} AÑOS{jugador.dorsal ? ` · #${jugador.dorsal}` : ''}</div>
          </div>
        )}

        <div className="pl-cu-m" style={{ fontSize: esStory ? 22 : 19, marginTop: esStory ? 60 : 34 }}>
          DE PARTE DE TODO {club.nombre ? club.nombre : 'EL CLUB'}
        </div>

      </Marco>
    </>
  );
}
