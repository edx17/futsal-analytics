import React from 'react';
import Marco from './Marco';
import { Ceja } from './Piezas';
import { iniciales } from './club';

/* PLACA DEL PLANTEL
 *
 * Sale de Resumen de plantel, con los mismos filtros que tenga puesta la
 * pantalla (categoría, torneo, rueda). Arriba los totales del plantel, en el
 * medio los destacados —los mismos que muestra la pantalla, así nunca dicen
 * otra cosa— y abajo los que más minutos jugaron, con sus números.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PlacaPlantel({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, info = {}, totales = {}, destacados = [], ranking = [] } = datos;
  const esStory = formato?.id === 'story';
  const filas = ranking.slice(0, esStory ? 10 : 6);

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <Ceja
          club={club.nombre} escudo={club.escudo} tamano={esStory ? 66 : 58}
          izquierda="EL PLANTEL" resaltado={info.torneo}
          derecha={[info.rueda, info.categoria].filter(Boolean).join(' · ')}
        />

        <div className="pl-pt-tot" style={{ marginTop: esStory ? 44 : 30 }}>
          <div><b>{num(totales.jugadores)}</b><span>JUGADORES</span></div>
          <div><b style={{ color: 'var(--pl-club)' }}>{num(totales.goles)}</b><span>GOLES</span></div>
          <div><b>{num(totales.asistencias)}</b><span>ASISTENCIAS</span></div>
          <div><b>{num(totales.recuperaciones)}</b><span>RECUPERACIONES</span></div>
        </div>

        {destacados.length > 0 && (
          <div style={{ marginTop: esStory ? 44 : 28 }}>
            <div className="pl-mini" style={{ marginBottom: 12 }}>LOS DESTACADOS</div>
            <div className="pl-pt-dest">
              {destacados.map((d, i) => (
                <div key={i} className="pl-pt-d" style={esStory ? { padding: '16px 22px' } : undefined}>
                  <div className="ft">
                    {d.foto
                      ? <img src={d.foto} alt="" crossOrigin="anonymous" />
                      : <span>{iniciales(d.nombre)}</span>}
                  </div>
                  <div className="tx">
                    <div className="et">{d.etiqueta}</div>
                    <div className="nm">{d.nombre}</div>
                  </div>
                  <div className="vl">{d.valor}<small>{d.unidad}</small></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filas.length > 0 && (
          <div style={{ marginTop: esStory ? 44 : 28 }}>
            <div className="pl-pt-cab">
              <span>#</span><span>MÁS MINUTOS</span><span>PJ</span><span>MIN</span><span>G</span><span>A</span><span>RAT</span>
            </div>
            {filas.map((f, i) => (
              <div key={i} className="pl-pt-f">
                <span className="c">{f.dorsal ?? ''}</span>
                <span className="nm">{f.nombre}</span>
                <span className="c">{num(f.pj)}</span>
                <span className="c">{num(f.min)}</span>
                <span className="c" style={num(f.g) ? { color: 'var(--pl-club)' } : undefined}>{num(f.g)}</span>
                <span className="c">{num(f.a)}</span>
                <span className="c rt">{f.rat ?? '—'}</span>
              </div>
            ))}
          </div>
        )}

      </Marco>
    </>
  );
}
