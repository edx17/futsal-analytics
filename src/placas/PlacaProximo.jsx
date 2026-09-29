import React from 'react';
import Marco from './Marco';
import { Ceja, Escudo } from './Piezas';

/* PLACA DE PRÓXIMO PARTIDO / CITACIÓN
 *
 * Sale de Citación, con los mismos datos que el mensaje de WhatsApp: rival,
 * día, hora, sede y la lista de citados. Si todavía no hay nadie tildado, la
 * placa queda como anuncio del partido, sin la lista.
 */

export default function PlacaProximo({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, rival = {}, info = {}, cuando = {}, lugar = {}, citados = [] } = datos;
  const esStory = formato?.id === 'story';
  const esVisitante = info.condicion === 'Visitante';
  const [izq, der] = esVisitante ? [rival, club] : [club, rival];

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <Ceja
          izquierda="PRÓXIMO PARTIDO" resaltado={info.jornada}
          derecha={[info.torneo, info.categoria].filter(Boolean).join(' · ')}
        />

        <div className="pl-marcador" style={{ marginTop: esStory ? 70 : 44 }}>
          <div className="pl-eq">
            <Escudo url={izq.escudo} nombre={izq.nombre} lado={esVisitante ? 'v' : 'l'} />
            <div className="pl-nomeq">{String(izq.nombre || '').toUpperCase()}</div>
          </div>
          <div className="pl-px-vs">VS</div>
          <div className="pl-eq">
            <Escudo url={der.escudo} nombre={der.nombre} lado={esVisitante ? 'l' : 'v'} />
            <div className="pl-nomeq">{String(der.nombre || '').toUpperCase()}</div>
          </div>
        </div>

        <div className="pl-px-cuando" style={{ marginTop: esStory ? 70 : 44 }}>
          <div><span>DÍA</span><b>{String(cuando.dia || '—').toUpperCase()}</b></div>
          <div><span>FECHA</span><b>{cuando.fecha || '—'}</b></div>
          <div><span>HORA</span><b>{cuando.hora || '—'}</b></div>
        </div>

        {(lugar.sede || lugar.direccion || cuando.citacion) && (
          <div className="pl-caja pl-px-lugar" style={{ marginTop: 20 }}>
            {lugar.sede && <b>{lugar.sede}</b>}
            {lugar.direccion && <span>{lugar.direccion}</span>}
            {cuando.citacion && <span style={{ color: 'var(--pl-club)' }}>CITADOS {cuando.citacion}</span>}
          </div>
        )}

        {citados.length > 0 && (
          <div style={{ marginTop: esStory ? 50 : 34 }}>
            <div className="pl-mini" style={{ marginBottom: 12 }}>CITADOS · {citados.length}</div>
            <div className="pl-px-cit">
              {citados.map((c, i) => (
                <div key={i}><i>{c.dorsal ?? ''}</i>{c.nombre}</div>
              ))}
            </div>
          </div>
        )}

      </Marco>
    </>
  );
}
