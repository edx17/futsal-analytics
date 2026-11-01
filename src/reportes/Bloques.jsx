import React from 'react';

/* LOS BLOQUES DE UN REPORTE
 *
 * Todos los reportes (jugador, categoría, club, torneo, comparativos) se
 * arman con estas mismas piezas. Cada bloque es un objeto { tipo, ... } que
 * sale de una función pura (src/analytics/reporte*.js); acá sólo se dibuja.
 * `grande`: la versión para el modo presentación.
 */

export function Bloque({ b, grande = false }) {
  const C = TIPOS[b.tipo];
  return C ? <C b={b} grande={grande} /> : null;
}

function Portada({ b, grande }) {
  return (
    <div className={`rp-portada${grande ? ' rp-grande' : ''}`}>
      {b.foto ? <img className="rp-foto" src={b.foto} alt="" /> : <div className="rp-foto rp-foto-vacia">{(b.nombre || '?').slice(0, 1)}</div>}
      <div className="rp-portada-texto">
        <div className="rp-rotulo">{[b.club, b.titulo].filter(Boolean).join(' · ')}</div>
        <h1 className="rp-nombre">{b.dorsal != null && <span className="rp-dorsal">{b.dorsal}</span>}{b.nombre}</h1>
        <div className="rp-sub">{[b.posicion, b.categoria].filter(Boolean).join(' · ')}</div>
      </div>
      {b.escudo && <img className="rp-escudo" src={b.escudo} alt="" />}
    </div>
  );
}

function Kpis({ b }) {
  return (
    <div className="rp-kpis">
      {b.items.map((k) => (
        <div key={k.rotulo} className={`rp-kpi${k.destacado ? ' rp-kpi-destacado' : ''}`}>
          <div className="rp-kpi-rotulo">{k.rotulo}</div>
          <div className="rp-kpi-valor">{k.valor}</div>
          {k.detalle && <div className="rp-kpi-detalle">{k.detalle}</div>}
        </div>
      ))}
    </div>
  );
}

/* Una serie en línea (el rating partido a partido), en SVG: sale igual en
   pantalla, en el PDF y en la presentación. */
function Serie({ b, grande }) {
  const pts = b.puntos || [];
  if (pts.length < 2) return null;
  const W = 640; const H = grande ? 260 : 200; const P = { l: 30, r: 10, t: 14, b: 26 };
  const min = b.min ?? Math.min(...pts.map((p) => p.y)); const max = b.max ?? Math.max(...pts.map((p) => p.y));
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (pts.length - 1);
  const y = (v) => P.t + (1 - (v - min) / (max - min || 1)) * (H - P.t - P.b);
  const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const marcas = [min, (min + max) / 2, max];
  const cada = Math.ceil(pts.length / 10);
  return (
    <figure className="rp-serie">
      {b.titulo && <figcaption className="rp-bloque-titulo">{b.titulo}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={b.titulo || 'Serie'}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={P.l} x2={W - P.r} y1={y(m)} y2={y(m)} className="rp-eje" />
            <text x={P.l - 6} y={y(m) + 4} textAnchor="end" className="rp-eje-texto">{Math.round(m)}</text>
          </g>
        ))}
        {b.promedio != null && <line x1={P.l} x2={W - P.r} y1={y(b.promedio)} y2={y(b.promedio)} className="rp-promedio" />}
        <path d={linea} className="rp-linea" />
        {pts.map((p, i) => (
          <g key={`${p.x}-${i}`}>
            <circle cx={x(i)} cy={y(p.y)} r={p.goles ? 5 : 3.5} className={`rp-punto rp-punto-${p.resultado || 'n'}`}>
              <title>{`${p.x} vs ${p.rival}: ${p.y}${p.goles ? ` · ${p.goles} gol${p.goles > 1 ? 'es' : ''}` : ''}`}</title>
            </circle>
            {i % cada === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className="rp-eje-texto">{p.x}</text>}
          </g>
        ))}
      </svg>
      <div className="rp-leyenda">
        <span><i className="rp-punto-G" /> ganado</span><span><i className="rp-punto-E" /> empatado</span><span><i className="rp-punto-P" /> perdido</span>
        {b.promedio != null && <span><i className="rp-raya" /> su promedio ({b.promedio})</span>}
        <span>punto grande: hizo gol</span>
      </div>
    </figure>
  );
}

function Barras({ b }) {
  const items = b.items || [];
  const tope = b.escala || Math.max(...items.map((i) => Math.max(Math.abs(i.valor), Math.abs(i.referencia ?? 0))), 1);
  return (
    <div className="rp-barras">
      {b.titulo && <div className="rp-bloque-titulo">{b.titulo}</div>}
      {items.map((i) => (
        <div key={i.rotulo} className="rp-barra">
          <div className="rp-barra-rotulo">{i.rotulo}</div>
          <div className="rp-barra-pista">
            <div className="rp-barra-valor" style={{ width: `${Math.min(100, Math.max(2, (Math.abs(i.valor) / (i.tope || tope)) * 100))}%` }} />
            {i.referencia != null && <div className="rp-barra-ref" style={{ left: `${Math.min(100, (Math.abs(i.referencia) / (i.tope || tope)) * 100)}%` }} title={`Promedio: ${i.textoReferencia}`} />}
          </div>
          <div className="rp-barra-texto">{i.texto}{i.textoReferencia != null && <small> / {i.textoReferencia}</small>}</div>
        </div>
      ))}
      {items.some((i) => i.referencia != null) && <div className="rp-leyenda"><span><i className="rp-raya-v" /> promedio de la categoría</span></div>}
    </div>
  );
}

function Ranking({ b }) {
  if (!b.items?.length) return null;
  return (
    <div className="rp-ranking">
      {b.items.map((i) => (
        <div key={i.rotulo} className={`rp-rank${i.puesto <= 3 ? ' rp-rank-podio' : ''}`}>
          <span className="rp-rank-puesto">{i.puesto}º</span>
          <span className="rp-rank-rotulo">{i.rotulo}</span>
          <span className="rp-rank-de">de {i.de}</span>
        </div>
      ))}
    </div>
  );
}

function Tabla({ b }) {
  return (
    <div className="rp-tabla-caja">
      <table className="rp-tabla">
        <thead><tr>{b.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {b.filas.map((f, i) => (
            <tr key={i}>{f.map((v, k) => <td key={b.columnas[k]} className={b.resaltarUltima && k === f.length - 1 ? 'rp-td-fuerte' : ''}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lista({ b }) {
  return (
    <div className={`rp-lista rp-lista-${b.tono || 'neutro'}`}>
      {b.titulo && <div className="rp-bloque-titulo">{b.titulo}</div>}
      <ul>{b.items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

const Texto = ({ b }) => <p className="rp-texto">{b.texto}</p>;

const TIPOS = { portada: Portada, kpis: Kpis, serie: Serie, barras: Barras, ranking: Ranking, tabla: Tabla, lista: Lista, texto: Texto };
