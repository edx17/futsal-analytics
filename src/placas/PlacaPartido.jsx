import React from 'react';
import Marco from './Marco';

/* PLACA DE PARTIDO
 *
 * Reemplaza a MatchReport. Dos cambios de fondo respecto de aquella:
 *
 * 1. Las barras son divergentes desde el centro, con la etiqueta en el medio.
 *    Antes eran dos barras separadas que no compartían escala y no se podía
 *    comparar de un vistazo.
 *
 * 2. Recuperaciones, pérdidas y duelos salen del enfrentamiento y pasan a un
 *    bloque propio. La toma de datos NO registra esas acciones del rival
 *    —se verificó sobre partidos reales: 30 duelos propios contra 0 del
 *    rival, porque no se cargan— así que mostrarlas como "24 a 0" publicaba
 *    algo falso. Arriba quedan sólo las métricas que sí se miden de los dos.
 */

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dec = (v) => num(v).toFixed(2);

/* Cada barra ocupa, como mucho, la mitad de la pista. El reparto es
 * proporcional al total, así que las dos mitades son comparables entre sí. */
function reparto(a, b) {
  const A = Math.max(0, num(a)), B = Math.max(0, num(b));
  const t = A + B;
  if (t <= 0) return [0, 0];
  return [(A / t) * 50, (B / t) * 50];
}

const Escudo = ({ url, iniciales, lado }) => (
  <div className={`pl-esc pl-esc-${lado}`}>
    {url ? <img src={url} alt="" crossOrigin="anonymous" /> : iniciales}
  </div>
);

const Fila = ({ etiqueta, a, b, formato = num }) => {
  const [pa, pb] = reparto(a, b);
  return (
    <div className="pl-fila">
      <div className="pl-vL">{formato(a)}</div>
      <div className="pl-pista">
        <div className="pl-mitad pl-mL" /><div className="pl-mitad pl-mV" />
        <div className="pl-bL" style={{ width: `${pa}%` }} />
        <div className="pl-bV" style={{ width: `${pb}%` }} />
        <div className="pl-etq">{etiqueta}</div>
      </div>
      <div className="pl-vV">{formato(b)}</div>
    </div>
  );
};

const iniciales = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

export default function PlacaPartido({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, rival = {}, resultado = {}, info = {}, comparado = {}, propio = {}, figura, goles = [] } = datos;
  const esStory = formato?.id === 'story';

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <div className="pl-ceja">
          <span>{info.torneo || 'AMISTOSO'}{info.jornada ? <b> · {info.jornada}</b> : null}</span>
          <span>{[info.fecha, info.categoria].filter(Boolean).join(' · ')}</span>
        </div>

        <div className="pl-marcador" style={{ marginTop: esStory ? 70 : 44 }}>
          <div className="pl-eq">
            <Escudo url={club.escudo} iniciales={iniciales(club.nombre)} lado="l" />
            <div className="pl-nomeq">{String(club.nombre || 'MI EQUIPO').toUpperCase()}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="pl-cifras" style={esStory ? { fontSize: 168 } : undefined}>
              <span className="pl-gl">{num(resultado.propios)}</span>
              <span className="pl-guion" />
              <span className="pl-gv">{num(resultado.rival)}</span>
            </div>
            {resultado.primerTiempo && <div className="pl-et">ENTRETIEMPO {resultado.primerTiempo}</div>}
          </div>
          <div className="pl-eq">
            <Escudo url={rival.escudo} iniciales={iniciales(rival.nombre)} lado="v" />
            <div className="pl-nomeq">{String(rival.nombre || 'RIVAL').toUpperCase()}</div>
          </div>
        </div>

        {/* Sólo lo que se mide de los dos equipos. */}
        <div className="pl-comp" style={{ marginTop: esStory ? 80 : 46, gap: esStory ? 26 : 20 }}>
          <Fila etiqueta="xG GENERADO" a={comparado.xgPropio} b={comparado.xgRival} formato={dec} />
          <Fila etiqueta="REMATES" a={comparado.rematesPropio} b={comparado.rematesRival} />
          <Fila etiqueta="AL ARCO" a={comparado.alArcoPropio} b={comparado.alArcoRival} />
          <Fila etiqueta="FALTAS" a={comparado.faltasPropio} b={comparado.faltasRival} />
        </div>

        <div className="pl-propio" style={{ marginTop: esStory ? 64 : 40 }}>
          <div className="pl-propio-t">NUESTRO JUEGO</div>
          <div className="pl-propio-g">
            <div className="pl-pd"><div className="n" style={{ color: 'var(--pl-club)' }}>{num(propio.recuperaciones)}</div><div className="l">RECUPERACIONES</div></div>
            <div className="pl-pd"><div className="n" style={{ color: 'var(--pl-rival)' }}>{num(propio.perdidas)}</div><div className="l">PÉRDIDAS</div></div>
            <div className="pl-pd">
              <div className="n">{num(propio.duelosPct)}<span style={{ fontSize: 32, color: 'var(--pl-tenue)' }}>%</span></div>
              <div className="l">DUELOS GANADOS</div>
            </div>
          </div>
        </div>

        {esStory ? (
          <>
            {figura && <BloqueFigura figura={figura} grande style={{ marginTop: 60 }} />}
            {goles.length > 0 && <BloqueGoles goles={goles} style={{ marginTop: 28 }} />}
          </>
        ) : (
          <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: figura && goles.length ? '1fr 1fr' : '1fr', gap: 26 }}>
            {figura && <BloqueFigura figura={figura} />}
            {goles.length > 0 && <BloqueGoles goles={goles} />}
          </div>
        )}

      </Marco>
    </>
  );
}

const BloqueFigura = ({ figura, grande, style }) => (
  <div className="pl-caja pl-mvp" style={style}>
    <div className="pl-mini">FIGURA DEL PARTIDO</div>
    <div className="pl-mvp-n" style={grande ? { fontSize: 58 } : undefined}>{figura.nombre}</div>
    <div className="pl-mini">{[figura.dorsal ? `#${figura.dorsal}` : null, figura.rol].filter(Boolean).join(' · ')}</div>
    <div className="pl-chip" style={grande ? { fontSize: 44 } : undefined}>{figura.rating}</div>
    <div className="pl-mvp-d" style={grande ? { gap: 44 } : undefined}>
      {figura.goles > 0 && <div>{figura.goles === 1 ? 'GOL' : 'GOLES'}<b>{figura.goles}</b></div>}
      <div>REMATES<b>{figura.remates}</b></div>
      <div>RECUP.<b>{figura.recuperaciones}</b></div>
      <div>+/−<b>{figura.plusMinus > 0 ? `+${figura.plusMinus}` : figura.plusMinus}</b></div>
    </div>
  </div>
);

const BloqueGoles = ({ goles, style }) => (
  <div className="pl-caja" style={style}>
    <div className="pl-mini" style={{ marginBottom: 14 }}>GOLES</div>
    {goles.map((g, i) => (
      <div className="pl-gr" key={i}>{g.nombre}<span>{g.minutos}</span></div>
    ))}
  </div>
);
