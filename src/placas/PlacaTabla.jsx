import React from 'react';
import { Ceja, Escudo, Pie } from './Piezas';
import { TOPE, filasVisibles } from './tabla';

/* PLACA DE TABLA DE POSICIONES
 *
 * La tabla del torneo con nuestra fila encendida. Un torneo de 18 equipos no
 * entra en un 4:5 sin quedar ilegible, así que se corta: se muestran los
 * primeros y, si quedamos afuera de ese corte, se abre un hueco y se agrega
 * nuestra fila con los dos vecinos. Un hincha quiere ver la punta y quiere
 * vernos a nosotros; las diez filas del medio no las mira nadie.
 */

export default function PlacaTabla({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, info = {}, tabla = [], clave, modo = 'general' } = datos;
  const esStory = formato?.id === 'story';
  const filas = filasVisibles(tabla, clave, TOPE[esStory ? 'story' : 'feed']);

  /* La tabla trae las columnas de las tres vistas; acá se elige una sola. */
  const col = (t, base) => (modo === 'local' ? t[`${base}L`]
    : modo === 'visitante' ? t[`${base}V`] : t[base]);
  const dif = (t) => (modo === 'local' ? t.difLocal : modo === 'visitante' ? t.difVisita : t.difGeneral);
  const pts = (t) => (modo === 'local' ? t.ptsL : modo === 'visitante' ? t.ptsV : t.pts);
  const rotuloModo = modo === 'local' ? 'SÓLO DE LOCAL' : modo === 'visitante' ? 'SÓLO DE VISITANTE' : 'TABLA GENERAL';

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <div className="pl-cont" style={{ paddingTop: esStory ? 130 : 56 }}>

        <Ceja izquierda="POSICIONES" resaltado={rotuloModo} derecha={info.categoria} />

        <div style={{ marginTop: esStory ? 50 : 30, marginBottom: esStory ? 40 : 26 }}>
          <div style={{ fontSize: esStory ? 64 : 54, fontWeight: 900, letterSpacing: '-.035em', lineHeight: 1.02 }}>
            {String(info.torneo || 'TORNEO').toUpperCase()}
          </div>
          {info.jornada && <div className="pl-mini" style={{ marginTop: 10 }}>{info.jornada}</div>}
        </div>

        <div className="pl-tb-cab">
          <span>#</span><span>EQUIPO</span><span>PJ</span><span>G</span><span>E</span><span>P</span><span>DIF</span><span>PTS</span>
        </div>

        {filas.map((f, i) => f.corte ? (
          <div className="pl-zona" key={`corte-${i}`}><i /> · · · <i /></div>
        ) : (
          <div className={`pl-tb-f${f.t.nombre === clave ? ' mio' : ''}`} key={f.t.nombre}>
            <div className="ps">{f.puesto}</div>
            <div className="eqn">
              <Escudo url={f.t.escudo} nombre={f.t.nombre} className="ec" />
              {/* En la fila propia el nombre sale de `clubes.nombre`: el que
                  trae el partido viene con el sufijo de categoría. */}
              {String(f.t.nombre === clave ? (club.nombre || f.t.nombre) : f.t.nombre).toUpperCase()}
            </div>
            <div className="c">{col(f.t, 'pj')}</div>
            <div className="c">{col(f.t, 'pg')}</div>
            <div className="c">{col(f.t, 'pe')}</div>
            <div className="c">{col(f.t, 'pp')}</div>
            <div className="dg" style={{ color: dif(f.t) > 0 ? 'var(--pl-club)' : dif(f.t) < 0 ? 'var(--pl-rival)' : 'var(--pl-dim)' }}>
              {dif(f.t) > 0 ? `+${dif(f.t)}` : dif(f.t)}
            </div>
            <div className="pt">{pts(f.t)}</div>
          </div>
        ))}

        <Pie club={club.nombre} detalle={info.categoria} esStory={esStory} />
      </div>
    </>
  );
}
