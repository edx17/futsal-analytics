import React from 'react';
import Cancha from './Cancha';
import { aMetros } from './medidas';
import { Ceja, Pie } from './Piezas';
import { ESTADOS_GOL, ORDEN_ESTADOS, pct } from '../utils/estadoGoles';

/* PLACA DE ORIGEN DE LOS GOLES
 *
 * El titular es el dato que más se repite en la charla del vestuario: cuántas
 * veces abrimos el marcador, y qué pasó cuando lo abrimos. Abajo, cada gol
 * marcado como una burbuja del tamaño de su xG sobre una cancha de 40 × 20 m
 * de verdad: da la referencia de DÓNDE se hacen, que era lo que faltaba y
 * dejaba la placa con aire abajo.
 *
 * El bloque de liga usa la tabla del torneo, que se calcula con los mismos
 * cruces que muestra Torneos/Fixture.
 */

const RADIO_MIN = 0.42;   // metros
const RADIO_MAX = 1.15;

/* Un gol de xG bajo (un cañonazo de 12 m) y uno de xG alto (un mano a mano)
 * tienen que verse distinto sin que el chico desaparezca. */
const radioDe = (xg) => {
  const v = Math.max(0, Math.min(1, Number(xg) || 0));
  return RADIO_MIN + Math.sqrt(v) * (RADIO_MAX - RADIO_MIN);
};

export default function PlacaGoles({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, info = {}, estado = {}, goles = [], liga = null } = datos;
  const esStory = formato?.id === 'story';

  const conteo = estado.conteo || {};
  const analizados = estado.analizados || 0;
  const abrimos = estado.abrimos || { pj: 0, v: 0, e: 0, d: 0 };
  const nosAbrieron = estado.nosAbrieron || { pj: 0, v: 0, e: 0, d: 0 };
  const maxEstado = Math.max(1, ...ORDEN_ESTADOS.map((k) => conteo[k] || 0));
  const conMapa = goles.filter((g) => g.x != null && g.y != null);

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <div className="pl-cont" style={{ paddingTop: esStory ? 120 : 56 }}>

        <Ceja
          izquierda="ORIGEN DE LOS GOLES"
          resaltado={info.torneo}
          derecha={[info.categoria, analizados ? `${analizados} PARTIDOS` : null].filter(Boolean).join(' · ')}
        />

        <div className="pl-hero" style={{ marginTop: esStory ? 78 : 30 }}>
          <div className="k" style={{ fontSize: esStory ? 230 : 152 }}>
            {abrimos.pj}<small>/{analizados}</small>
          </div>
          <div className="t" style={{ fontSize: esStory ? 26 : 20 }}>
            ABRIMOS EL MARCADOR · {pct(abrimos.pj, analizados)}% DE LOS PARTIDOS
          </div>
        </div>

        <div className="pl-rec" style={{ marginTop: esStory ? 34 : 18 }}>
          <div><b style={{ color: 'var(--pl-club)' }}>{abrimos.v}</b><span>GANADOS</span></div>
          <div><b style={{ color: 'var(--pl-oro)' }}>{abrimos.e}</b><span>EMPATADOS</span></div>
          <div><b style={{ color: 'var(--pl-rival)' }}>{abrimos.d}</b><span>PERDIDOS</span></div>
        </div>
        <div className="pl-mini" style={{ textAlign: 'center', marginTop: 12 }}>
          CUANDO PUSIMOS EL PRIMERO
        </div>

        {conMapa.length > 0 && (
          <div className="pl-cancha" style={{ marginTop: esStory ? 36 : 20 }}>
            <Cancha style={{ width: esStory ? 880 : 740 }}>
              {conMapa.map((g, i) => {
                const { x, y } = aMetros(g.x, g.y);
                const r = radioDe(g.xg);
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={r} fill="rgba(var(--pl-club-rgb),.22)" />
                    <circle cx={x} cy={y} r={r} fill="none"
                            stroke="var(--pl-club)" strokeWidth=".12" />
                    <circle cx={x} cy={y} r=".13" fill="var(--pl-club)" />
                  </g>
                );
              })}
            </Cancha>
            <div className="pin">
              DÓNDE LOS HICIMOS · {conMapa.length} GOLES · EL TAMAÑO ES EL xG
            </div>
          </div>
        )}

        <div className="pl-lista" style={{ marginTop: esStory ? 46 : 22 }}>
          {ORDEN_ESTADOS.filter((k) => (conteo[k] || 0) > 0).map((k) => (
            <div className="pl-li" key={k}>
              <div className="lb" style={{ color: ESTADOS_GOL[k].color }}>{ESTADOS_GOL[k].label}</div>
              <div className="vv">{conteo[k]}</div>
              <div className="pista">
                <div className="fill" style={{
                  width: `${((conteo[k] || 0) / maxEstado) * 100}%`,
                  background: ESTADOS_GOL[k].color,
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* En la historia entra más: el reverso del titular (qué pasó cuando el
            que abrió fue el rival) y las remontadas. En el feed no, porque el
            alto es el que es y prefiero que respire. */}
        {esStory && (
          <>
            <div className="pl-rec" style={{ marginTop: 30 }}>
              <div><b style={{ color: 'var(--pl-club)' }}>{nosAbrieron.v}</b><span>GANADOS</span></div>
              <div><b style={{ color: 'var(--pl-oro)' }}>{nosAbrieron.e}</b><span>EMPATADOS</span></div>
              <div><b style={{ color: 'var(--pl-rival)' }}>{nosAbrieron.d}</b><span>PERDIDOS</span></div>
            </div>
            <div className="pl-mini" style={{ textAlign: 'center', marginTop: 12 }}>
              CUANDO EL PRIMERO LO PUSO EL RIVAL ({nosAbrieron.pj} {nosAbrieron.pj === 1 ? 'PARTIDO' : 'PARTIDOS'})
            </div>
          </>
        )}

        {liga && (
          <div className="pl-liga" style={{ marginTop: esStory ? 44 : 20 }}>
            <div className="pl-liga-t">DÓNDE NOS DEJA ESO EN EL TORNEO</div>
            <div className="pl-liga-g">
              <Lg n={liga.puesto ? `${liga.puesto}º` : '—'} p={liga.equipos ? `de ${liga.equipos}` : null} l="EN LA TABLA" />
              <Lg n={liga.gf} p={liga.puestoGF ? `${liga.puestoGF}º` : null} l="GOLES A FAVOR" />
              <Lg n={liga.gc} p={liga.puestoGC ? `${liga.puestoGC}º` : null} l="GOLES EN CONTRA" />
              <Lg n={liga.dif > 0 ? `+${liga.dif}` : liga.dif} p={liga.puestoDif ? `${liga.puestoDif}º` : null} l="DIFERENCIA" />
            </div>
          </div>
        )}

        {esStory && (estado.remontadas > 0 || estado.remontados > 0) && (
          <div className="pl-mini" style={{ textAlign: 'center', marginTop: 26 }}>
            {estado.remontadas} {estado.remontadas === 1 ? 'REMONTADA' : 'REMONTADAS'}
            {'  ·  '}
            {estado.remontados} {estado.remontados === 1 ? 'VEZ NOS REMONTARON' : 'VECES NOS REMONTARON'}
          </div>
        )}

        <Pie club={club.nombre} detalle={info.categoria} esStory={esStory} />
      </div>
    </>
  );
}

const Lg = ({ n, p, l }) => (
  <div className="pl-lg">
    <div className="n">{n}</div>
    {p && <div className="p">{p}</div>}
    <div className="l">{l}</div>
  </div>
);
