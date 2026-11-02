import React from 'react';
import { Bloque } from './Bloques';
import { AUDIENCIAS } from '../analytics/reporteJugador';

/* EL DOCUMENTO DE UN REPORTE: en pantalla y, con `paraImprimir`, la copia
   que se imprime como PDF (ver src/pages/Reportes.jsx y reportes.css).
   Las secciones van numeradas (01, 02…); la portada no lleva número. */
export default function DocumentoReporte({ reporte, paraImprimir = false }) {
  const pie = `${reporte.titulo} · ${reporte.subtitulo} · para ${AUDIENCIAS.find((a) => a.id === reporte.audiencia)?.nombre.toLowerCase()} · VirtualClub`;
  const cuerpo = (
    <div className="rp-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {reporte.secciones.map((s, n) => (
        <section key={s.id} className={`rp-seccion${s.id === 'portada' ? ' rp-seccion-portada' : ''}`}>
          {s.id !== 'portada' && <h2 className="rp-seccion-titulo"><span className="rp-seccion-num">{String(n).padStart(2, '0')}</span>{s.titulo}</h2>}
          {s.bloques.map((b, k) => <Bloque key={`${s.id}-${k}`} b={b} />)}
        </section>
      ))}
      {!paraImprimir && <p className="rp-pie">{pie}</p>}
    </div>
  );
  if (!paraImprimir) return cuerpo;
  /* En el PDF, el logo arriba y el pie abajo se repiten en cada hoja (fijos);
     el thead y el tfoot vacíos, que el navegador repite en cada hoja, les
     guardan el lugar para que no tapen el reporte. */
  return (
    <>
      <div className="rp-hoja-cabeza"><img src="/android-chrome-192x192.png" alt="VF" /></div>
      <div className="rp-hoja-pie">{pie}</div>
      <table className="rp-hoja">
        <thead><tr><td><div className="rp-hoja-lugar-cabeza" /></td></tr></thead>
        <tfoot><tr><td><div className="rp-hoja-lugar-pie" /></td></tr></tfoot>
        <tbody><tr><td>{cuerpo}</td></tr></tbody>
      </table>
    </>
  );
}
