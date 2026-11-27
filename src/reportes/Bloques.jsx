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

const FotoPortada = ({ src, nombre }) => (src
  ? <img className="rp-foto" src={src} alt="" />
  : <div className="rp-foto rp-foto-vacia">{(nombre || '?').slice(0, 1)}</div>);

/* El nombre en dos líneas (tapa de revista): el apellido, o la última
   palabra, abajo y en naranja. En el comparativo, cada jugador en su línea. */
function lineasDelNombre(nombre = '') {
  const t = String(nombre).trim();
  const vs = t.split(/\s+vs\s+/i);
  if (vs.length === 2) return [vs[0], `vs ${vs[1]}`];
  const p = t.split(/\s+/);
  return p.length > 1 ? [p.slice(0, -1).join(' '), p[p.length - 1]] : [t];
}

/* `foto2` / `nombre2`: el comparativo, con las dos fotos (una a cada lado).
   El dorsal va gigante de fondo, recortado por el borde. */
function Portada({ b, grande }) {
  const doble = 'foto2' in b;
  return (
    <div className={`rp-portada${grande ? ' rp-grande' : ''}${doble ? ' rp-portada-doble' : ''}`}>
      {b.dorsal != null && !doble && <div className="rp-portada-fondo" aria-hidden="true">{b.dorsal}</div>}
      <FotoPortada src={b.foto} nombre={b.inicial || b.nombre} />
      <div className="rp-portada-texto">
        <div className="rp-rotulo">{[b.club, b.titulo].filter(Boolean).join(' · ')}</div>
        <h1 className="rp-nombre">
          {b.dorsal != null && doble && <span className="rp-dorsal">{b.dorsal}</span>}
          {lineasDelNombre(b.nombre).map((l) => <span key={l} className="rp-nombre-linea">{l}</span>)}
        </h1>
        <div className="rp-sub">{[b.dorsal != null && !doble ? `#${b.dorsal}` : null, b.posicion, b.categoria].filter(Boolean).join(' · ')}</div>
      </div>
      {doble ? <FotoPortada src={b.foto2} nombre={b.nombre2} /> : b.escudo && <img className="rp-escudo" src={b.escudo} alt="" />}
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
          {k.detalle && <div className={`rp-kpi-detalle${k.tono ? ` rp-tono-${k.tono}` : ''}`}>{k.detalle}</div>}
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
  const W = 640; const H = grande ? 260 : 200; const P = { l: 34, r: 10, t: 14, b: 32 };
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
            <text x={P.l - 6} y={y(m) + 4} textAnchor="end" className="rp-eje-texto">{Math.round(m) > 0 && b.referencia === 0 ? '+' : ''}{Math.round(m)}</text>
          </g>
        ))}
        {b.promedio != null && <line x1={P.l} x2={W - P.r} y1={y(b.promedio)} y2={y(b.promedio)} className="rp-promedio" />}
        {b.referencia != null && <line x1={P.l} x2={W - P.r} y1={y(b.referencia)} y2={y(b.referencia)} className="rp-promedio" />}
        <path d={linea} className="rp-linea" />
        {pts.map((p, i) => (
          <g key={`${p.x}-${i}`}>
            <circle cx={x(i)} cy={y(p.y)} r={p.goles ? 5 : 3.5} className={`rp-punto rp-punto-${p.resultado || 'n'}${p.goles ? ' rp-punto-gol' : ''}`}>
              <title>{`${p.x} vs ${p.rival}: ${p.y > 0 && b.referencia === 0 ? '+' : ''}${p.y}${p.goles ? ` · ${p.goles} gol${p.goles > 1 ? 'es' : ''}` : ''}`}</title>
            </circle>
            {i % cada === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className={`rp-eje-texto${(i / cada) % 2 ? ' rp-eje-alterna' : ''}`}>{p.x}</text>}
          </g>
        ))}
      </svg>
      <div className="rp-leyenda">
        <span><i className="rp-punto-G" /> ganado</span><span><i className="rp-punto-E" /> empatado</span><span><i className="rp-punto-P" /> perdido</span>
        {b.promedio != null && <span><i className="rp-raya" /> su promedio ({b.promedio})</span>}
        {b.referencia != null && <span><i className="rp-raya" /> {b.etiquetaReferencia || 'referencia'}</span>}
        {b.marcarGoles !== false && <span>punto grande: hizo gol</span>}
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
            {i.referencia != null && <div className="rp-barra-ref" style={{ left: `${Math.min(100, (Math.abs(i.referencia) / (i.tope || tope)) * 100)}%` }} title={`${b.leyendaReferencia || 'Promedio'}: ${i.textoReferencia}`} />}
          </div>
          <div className="rp-barra-texto">{i.texto}{i.textoReferencia != null && <small> / {i.textoReferencia}</small>}</div>
        </div>
      ))}
      {items.some((i) => i.referencia != null) && <div className="rp-leyenda"><span><i className="rp-raya-v" /> {b.leyendaReferencia || 'promedio de la categoría'}</span></div>}
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
  const fuerte = (k, n) => (b.resaltarUltima && k === n - 1) || b.resaltarColumna === k;
  return (
    <div>
      {b.titulo && <div className="rp-bloque-titulo">{b.titulo}</div>}
      <div className="rp-tabla-caja">
        <table className="rp-tabla">
          <thead><tr>{b.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {b.filas.map((f, i) => (
              <tr key={i} className={b.resaltarFila === i ? 'rp-tr-propia' : ''}>
                {f.map((v, k) => {
                  // Una celda puede ser { v, fuerte }: el ganador de la fila en el comparativo.
                  const celda = v && typeof v === 'object' && !React.isValidElement(v) ? v : { v };
                  return <td key={b.columnas[k] || k} className={fuerte(k, f.length) || celda.fuerte ? 'rp-td-fuerte' : ''}>{celda.v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

/* Ficha técnica: datos generales en una fila (puesto, perfil, nacimiento, condición). */
function Ficha({ b }) {
  return (
    <div className="rp-ficha">
      {b.titulo && <div className="rp-bloque-titulo">{b.titulo}</div>}
      <dl className="rp-ficha-grilla">
        {b.items.map((i) => <div key={i.rotulo}><dt>{i.rotulo}</dt><dd>{i.valor}</dd></div>)}
      </dl>
    </div>
  );
}

/* Un dato que tiene que verse sí o sí (la asistencia): franja de lado a lado. */
const Franja = ({ b }) => (
  <div className="rp-franja">
    <span className="rp-franja-rotulo">{b.rotulo}</span>
    <span className="rp-franja-valor">{b.valor}</span>
    {b.detalle && <span className="rp-franja-detalle">{b.detalle}</span>}
  </div>
);

/* La devolución de cada área. `vacio`: cuadro con renglones para escribir a mano. */
function Devolucion({ b }) {
  return (
    <div className="rp-devolucion">
      {b.items.map((a) => (
        <div key={a.titulo} className={`rp-area${a.vacio ? ' rp-area-vacia' : ''}`}>
          <div className="rp-area-titulo">{a.titulo}</div>
          {a.vacio
            ? <div className="rp-renglones" aria-hidden="true">{Array.from({ length: 6 }, (_, k) => <span key={k} />)}</div>
            : <div className="rp-area-texto">{a.texto.split(/\n+/).map((t, k) => <p key={k}>{t}</p>)}</div>}
          {a.autor && <div className="rp-area-autor">{a.autor}</div>}
        </div>
      ))}
    </div>
  );
}

const Staff = ({ b }) => (
  <dl className="rp-staff">
    {b.items.map((x, k) => <div key={`${x.cargo}-${x.nombre}-${k}`}>{x.cargo && <dt>{x.cargo}</dt>}<dd>{x.nombre}</dd></div>)}
  </dl>
);

const TIPOS = { portada: Portada, kpis: Kpis, serie: Serie, barras: Barras, ranking: Ranking, tabla: Tabla, lista: Lista, texto: Texto, ficha: Ficha, franja: Franja, devolucion: Devolucion, staff: Staff };
