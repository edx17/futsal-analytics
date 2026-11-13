import React from 'react';

/* PRUEBAS · RADAR POR BLOQUE (SVG propio, escala 1 a 5)
 *
 * `ejes`: [{ id, nombre, valor }] (valor null = sin datos, se dibuja en 0).
 * `comparar`: otra serie opcional (por ejemplo, el umbral de incorporar) en línea punteada.
 */
export default function RadarBloques({ ejes = [], comparar = null, color = 'var(--accent, #00e676)', tamano = 300, etiqueta = 'Puntaje por bloque' }) {
  const n = ejes.length;
  if (n < 3) return null;
  const c = tamano / 2;
  const r = c - 64;
  const punto = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const d = (Math.max(0, Math.min(5, Number(v) || 0)) / 5) * r;
    return [c + d * Math.cos(a), c + d * Math.sin(a)];
  };
  const poligono = (valores) => valores.map((v, i) => punto(i, v).join(',')).join(' ');
  const aros = [1, 2, 3, 4, 5];

  return (
    <svg viewBox={`0 0 ${tamano} ${tamano}`} width="100%" style={{ maxWidth: tamano, display: 'block', margin: '0 auto' }} role="img" aria-label={etiqueta}>
      {aros.map((v) => (
        <polygon key={v} points={poligono(ejes.map(() => v))} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={v === 5 ? 1.2 : 0.8} />
      ))}
      {ejes.map((e, i) => {
        const [x, y] = punto(i, 5);
        return <line key={e.id} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,.08)" />;
      })}
      {comparar && <polygon points={poligono(comparar)} fill="none" stroke="#fbbf24" strokeDasharray="4 4" strokeWidth="1.2" />}
      <polygon points={poligono(ejes.map((e) => e.valor))} fill={color} fillOpacity="0.22" stroke={color} strokeWidth="2" />
      {ejes.map((e, i) => {
        const [x, y] = punto(i, e.valor);
        return e.valor != null ? <circle key={e.id} cx={x} cy={y} r="3.5" fill={color} /> : null;
      })}
      {ejes.map((e, i) => {
        const [x, y] = punto(i, 6.15);
        const ancla = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end';
        return (
          <g key={e.id}>
            <text x={x} y={y - 6} textAnchor={ancla} fontSize="10.5" fontWeight="800" fill="var(--text, #fff)">{e.nombre}</text>
            <text x={x} y={y + 8} textAnchor={ancla} fontSize="12" fontWeight="900" fill={color} fontFamily="JetBrains Mono, monospace">
              {e.valor != null ? Number(e.valor).toFixed(1) : '—'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
