import React from 'react';
import { Ceja, Escudo, Pie } from './Piezas';

/* PLACA DE CAMPAÑA
 *
 * El recorrido del equipo en el torneo, partido por partido: rival, marcador
 * y el chip del resultado. Arriba, el balance en cuatro números. Es la placa
 * de fin de rueda, la que se publica cuando el torneo cierra una etapa.
 *
 * Los resultados vienen de `resultadosDe`, que ya los resuelve desde nuestro
 * punto de vista (gf/gc propios aunque hayamos jugado de visitante).
 */

const CLASE = { V: 'pl-rV', E: 'pl-rE', D: 'pl-rD' };
const TOPE = { feed: 9, story: 12 };

export default function PlacaCampana({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, info = {}, stats = {}, resultados = [], escudos = {} } = datos;
  const esStory = formato?.id === 'story';

  /* Si no entran todos, se muestran los últimos: es lo que se está comentando. */
  const tope = TOPE[esStory ? 'story' : 'feed'];
  const recortado = resultados.length > tope;
  const visibles = recortado ? resultados.slice(-tope) : resultados;

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <div className="pl-cont" style={esStory ? { paddingTop: 130 } : undefined}>

        <Ceja izquierda="LA CAMPAÑA" resaltado={info.torneo} derecha={info.categoria} />

        <div style={{ marginTop: esStory ? 48 : 28 }}>
          <div style={{ fontSize: esStory ? 70 : 58, fontWeight: 900, letterSpacing: '-.035em', lineHeight: 1 }}>
            {String(club.nombre || 'MI CLUB').toUpperCase()}
          </div>
          {info.puesto && (
            <div className="pl-mini" style={{ marginTop: 12 }}>
              {info.puesto}º {info.equipos ? `DE ${info.equipos}` : ''} · {stats.pts} PUNTOS · {stats.eficacia}% DE EFICACIA
            </div>
          )}
        </div>

        <div className="pl-rec" style={{ marginTop: esStory ? 36 : 24, justifyContent: 'flex-start' }}>
          <div><b>{stats.pj}</b><span>JUGADOS</span></div>
          <div><b style={{ color: 'var(--pl-club)' }}>{stats.pg}</b><span>GANADOS</span></div>
          <div><b style={{ color: 'var(--pl-oro)' }}>{stats.pe}</b><span>EMPATADOS</span></div>
          <div><b style={{ color: 'var(--pl-rival)' }}>{stats.pp}</b><span>PERDIDOS</span></div>
          <div><b>{stats.gf}<span style={{ color: 'var(--pl-tenue)', fontSize: 30 }}>:</span>{stats.gc}</b><span>GOLES</span></div>
        </div>

        <div className="pl-cp" style={{ marginTop: esStory ? 44 : 26, gap: esStory ? 14 : 10 }}>
          {visibles.map((r) => (
            <div className="pl-cp-f" key={r.id}>
              <Escudo url={escudos[r.rival]} nombre={r.rival} className="ec" />
              <div className="nm">
                {String(r.rival).toUpperCase()}
                <span style={{ fontFamily: 'var(--pl-mono)', fontSize: 15, color: 'var(--pl-dim)', marginLeft: 12, letterSpacing: '.12em' }}>
                  {r.condicion === 'Local' ? 'L' : 'V'}
                </span>
              </div>
              <div className="mk">{r.gf} — {r.gc}</div>
              <div className={`rs ${CLASE[r.res]}`}>{r.res === 'V' ? 'GANAMOS' : r.res === 'E' ? 'EMPATE' : 'PERDIMOS'}</div>
            </div>
          ))}
        </div>

        {recortado && (
          <div className="pl-mini" style={{ textAlign: 'center', marginTop: 16 }}>
            ÚLTIMOS {visibles.length} DE {resultados.length} PARTIDOS
          </div>
        )}

        <Pie club={club.nombre} detalle={info.torneo} esStory={esStory} />
      </div>
    </>
  );
}
