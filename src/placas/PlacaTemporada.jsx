import React from 'react';
import { estiloContenido } from './formatos';
import { Ceja, Escudo, Pie } from './Piezas';

/* PLACA DE TEMPORADA
 *
 * Reemplaza a SeasonReport, que era un lienzo de 1080×1080 exportado a
 * escala 1 —la mitad de resolución que el resto de las placas— y mezclaba
 * datos nuestros con datos del rival que la toma NO registra.
 *
 * Acá el balance manda: jugados, ganados, empatados, perdidos. Los números
 * de juego (recuperaciones, pérdidas, duelos) van en su bloque aparte y sin
 * comparación, porque del rival no se cargan.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dec = (v) => num(v).toFixed(2);

export default function PlacaTemporada({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, info = {}, balance = {}, goles = {}, propio = {},
          goleadores = [], asistidores = [], tiempos = [] } = datos;
  const esStory = formato?.id === 'story';

  const dif = num(goles.gf) - num(goles.gc);

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <div className="pl-cont" style={estiloContenido(formato, esStory ? 120 : 56)}>

        <Ceja izquierda="LA TEMPORADA" resaltado={info.competicion} derecha={info.categoria} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: esStory ? 28 : 28 }}>
          <Escudo url={club.escudo} nombre={club.nombre} lado="l"
                  style={{ width: esStory ? 132 : 108, height: esStory ? 132 : 108, fontSize: esStory ? 44 : 36 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: esStory ? 68 : 56, fontWeight: 900, letterSpacing: '-.035em', lineHeight: 1 }}>
              {String(club.nombre || 'MI CLUB').toUpperCase()}
            </div>
            {info.periodo && <div className="pl-mini" style={{ marginTop: 12 }}>{info.periodo}</div>}
          </div>
        </div>

        <div className="pl-rec" style={{ marginTop: esStory ? 30 : 26, justifyContent: 'flex-start' }}>
          <div><b>{num(balance.pj)}</b><span>JUGADOS</span></div>
          <div><b style={{ color: 'var(--pl-club)' }}>{num(balance.pg)}</b><span>GANADOS</span></div>
          <div><b style={{ color: 'var(--pl-oro)' }}>{num(balance.pe)}</b><span>EMPATADOS</span></div>
          <div><b style={{ color: 'var(--pl-rival)' }}>{num(balance.pp)}</b><span>PERDIDOS</span></div>
        </div>

        <div className="pl-liga" style={{ marginTop: esStory ? 24 : 20 }}>
          <div className="pl-liga-t">LOS GOLES</div>
          <div className="pl-liga-g">
            <Lg n={num(goles.gf)} p={`${dec(goles.xgF)} xG`} l="A FAVOR" color="var(--pl-club)" />
            <Lg n={num(goles.gc)} p={`${dec(goles.xgC)} xG`} l="EN CONTRA" color="var(--pl-rival)" />
            <Lg n={dif > 0 ? `+${dif}` : dif} l="DIFERENCIA" />
            <Lg n={`${num(balance.eficacia)}%`} l="EFICACIA" />
          </div>
        </div>

        <div className="pl-propio" style={{ marginTop: esStory ? 28 : 20 }}>
          <div className="pl-propio-t">NUESTRO JUEGO</div>
          <div className="pl-propio-g">
            <div className="pl-pd">
              <div className="n" style={{ color: 'var(--pl-club)', fontSize: esStory ? 56 : 46 }}>{num(propio.recuperaciones)}</div>
              <div className="l">RECUPERACIONES</div>
            </div>
            <div className="pl-pd">
              <div className="n" style={{ color: 'var(--pl-rival)', fontSize: esStory ? 56 : 46 }}>{num(propio.perdidas)}</div>
              <div className="l">PÉRDIDAS PELIGROSAS</div>
            </div>
            <div className="pl-pd">
              <div className="n" style={{ fontSize: esStory ? 56 : 46 }}>
                {num(propio.duelosPct)}<span style={{ fontSize: 30, color: 'var(--pl-tenue)' }}>%</span>
              </div>
              <div className="l">DUELOS GANADOS</div>
            </div>
          </div>
        </div>

        <div style={{
          marginTop: esStory ? 22 : 20,
          display: 'grid',
          gridTemplateColumns: esStory ? '1fr' : '1fr 1fr',
          gap: esStory ? 18 : 24,
        }}>
          {goleadores.length > 0 && <Lista titulo="GOLEADORES" filas={goleadores} />}
          {asistidores.length > 0 && <Lista titulo="ASISTIDORES" filas={asistidores} />}
        </div>

        {tiempos.length > 0 && (
          <div className="pl-liga" style={{ marginTop: esStory ? 22 : 20, padding: esStory ? '20px 26px' : '16px 26px' }}>
            <div className="pl-liga-t" style={esStory ? undefined : { marginBottom: 12 }}>CÓMO SE REPARTEN LOS GOLES</div>
            <div className="pl-liga-g" style={{ gridTemplateColumns: `repeat(${tiempos.length * 2}, 1fr)` }}>
              {tiempos.map((t) => (
                <React.Fragment key={t.rotulo}>
                  <Lg n={num(t.af)} l={`${t.rotulo} A FAVOR`} color="var(--pl-club)" chico={!esStory} />
                  <Lg n={num(t.ec)} l={`${t.rotulo} EN CONTRA`} color="var(--pl-rival)" chico={!esStory} />
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <Pie club={club.nombre} escudo={club.escudo} detalle={info.categoria} />
      </div>
    </>
  );
}

const Lg = ({ n, p, l, color, chico }) => (
  <div className="pl-lg">
    <div className="n" style={{ ...(color ? { color } : null), ...(chico ? { fontSize: 33 } : null) }}>{n}</div>
    {p && <div className="p">{p}</div>}
    <div className="l" style={chico ? { marginTop: 5 } : undefined}>{l}</div>
  </div>
);

const Lista = ({ titulo, filas }) => (
  <div className="pl-caja">
    <div className="pl-mini" style={{ marginBottom: 14 }}>{titulo}</div>
    {filas.map((f, i) => (
      <div className="pl-gr" key={i}>
        <span style={{ color: 'var(--pl-tenue)', minWidth: 46, display: 'inline-block' }}>
          {f.dorsal ? `#${f.dorsal}` : ''}
        </span>
        <span style={{ flex: 1, color: 'var(--pl-tx)', fontFamily: "'Archivo',sans-serif", fontSize: 26, marginLeft: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {f.nombre}
        </span>
        <span>{f.valor}</span>
      </div>
    ))}
  </div>
);
