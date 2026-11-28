import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bloque } from './Bloques';
import { AUDIENCIAS } from '../analytics/reporteJugador';
import { paginar } from './paginar';

/* EL DOCUMENTO DE UN REPORTE: en pantalla y, con `paraImprimir`, la copia
   que se imprime como PDF (ver src/pages/Reportes.jsx y reportes.css).
   Las secciones van numeradas (01, 02…); la portada no lleva número.

   PDF: la app arma las hojas A4 (HojasA4): mide cada sección en papel,
   decide qué va en cada hoja (paginar.js) y achica o muestra más filas para
   que no queden huecos ni nada cortado. Mientras mide (o si un reporte no se
   puede paginar así), se imprime como antes y corta el navegador. */

const esLarga = (s) => s.larga || s.bloques.some((b) => (b.tipo === 'tabla' && (b.filas || []).length > 12) || (b.tipo === 'lista' && (b.items || []).length > 10));
const pieDe = (reporte) => `${reporte.titulo} · ${reporte.subtitulo} · para ${AUDIENCIAS.find((a) => a.id === reporte.audiencia)?.nombre.toLowerCase()} · VirtualClub`;

/* Una sección. `filas`: cuántas filas mostrar de su tabla variable (filasMin). */
function Seccion({ s, n, filas = null }) {
  return (
    <section className={`rp-seccion rp-seccion-${s.id}${esLarga(s) ? ' rp-seccion-larga' : ''}`} data-seccion={s.id}>
      {s.id !== 'portada' && <h2 className="rp-seccion-titulo"><span className="rp-seccion-num">{String(n).padStart(2, '0')}</span>{s.titulo}</h2>}
      {s.bloques.map((b, k) => <Bloque key={`${s.id}-${k}`} b={filas != null && b.filasMin ? { ...b, filas: b.filas.slice(0, filas) } : b} />)}
    </section>
  );
}

export default function DocumentoReporte({ reporte, paraImprimir = false }) {
  if (paraImprimir) return <HojasA4 reporte={reporte} />;
  return (
    <div className="rp-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {reporte.secciones.map((s, n) => <Seccion key={s.id} s={s} n={n} />)}
      <p className="rp-pie">{pieDe(reporte)}</p>
    </div>
  );
}

const SEPARACION = 12;   // px entre secciones dentro de una hoja

function Hoja({ pie, children, medir = null }) {
  return (
    <div className="rp-hoja-a4">
      <div className="rp-hoja-a4-cabeza"><img src="/android-chrome-192x192.png" alt="VF" /></div>
      <div className="rp-hoja-a4-cuerpo" ref={medir} style={{ gap: SEPARACION }}>{children}</div>
      <div className="rp-hoja-a4-pie">{pie}</div>
    </div>
  );
}

/* Verifica las hojas armadas (fuera de la pantalla): si alguna se pasa, la achica un poco más. */
function verificarHojas(prueba, vigente, setPlan) {
  if (!prueba) return;
  const cuerpos = [...prueba.querySelectorAll('.rp-hoja-a4-cuerpo')];
  let cambio = false;
  const hojas = vigente.hojas.map((hoja, i) => {
    const c = cuerpos[i];
    if (!c || c.scrollHeight <= c.clientHeight + 1) return hoja;
    cambio = true;
    const f = (c.clientHeight / c.scrollHeight) * 0.98;
    return hoja.map((x) => ({ ...x, escala: Math.max(0.5, Math.round(x.escala * f * 1000) / 1000) }));
  });
  // Si después de varias vueltas sigue sin entrar, se imprime como antes.
  if (cambio && vigente.vueltas >= 4) { setPlan({ ...vigente, hojas: null, listo: true }); return; }
  setPlan({ ...vigente, hojas, listo: !cambio, vueltas: vigente.vueltas + 1 });
}

function HojasA4({ reporte }) {
  const pie = pieDe(reporte);
  const cuerpoRef = useRef(null);
  const seccionesRef = useRef(null);
  const pruebaRef = useRef(null);
  /* { reporte, hojas, listo, vueltas }: primero se mide y se pagina; después se
     arman las hojas fuera de la pantalla y se verifica que nada se salga (al
     achicar, el texto se reacomoda y la altura no es exacta). Si algo se sale,
     esa hoja se achica un poco más y se vuelve a verificar. */
  const [plan, setPlan] = useState(null);
  const vigente = plan && plan.reporte === reporte ? plan : null;

  // 1. Medir y paginar. Se rehace si cambia el reporte.
  useLayoutEffect(() => {
    let vivo = true;
    const medir = () => {
      if (!vivo || !cuerpoRef.current || !seccionesRef.current) return;
      const alto = cuerpoRef.current.clientHeight;
      if (!alto) return;   // (por ejemplo, si se está imprimiendo justo ahora)
      const medidas = [...seccionesRef.current.querySelectorAll(':scope > [data-seccion]')].map((el, i) => {
        const s = reporte.secciones[i];
        const variable = s.bloques.find((b) => b.filasMin && (b.filas || []).length > b.filasMin);
        const filas = variable ? {
          total: variable.filas.length, min: variable.filasMin,
          alturas: [...el.querySelectorAll('tbody tr')].map((tr) => tr.getBoundingClientRect().height),
        } : null;
        return { id: s.id, alto: el.getBoundingClientRect().height, filas };
      });
      const hojas = paginar(medidas, { alto, separacion: SEPARACION });
      setPlan({ reporte, hojas, listo: !hojas, vueltas: 0 });
    };
    (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(medir));
    return () => { vivo = false; };
  }, [reporte]);

  // 2. Verificar las hojas armadas: si alguna se pasa, achicarla un poco más.
  useLayoutEffect(() => {
    if (!vigente || vigente.listo) return undefined;
    const id = requestAnimationFrame(() => verificarHojas(pruebaRef.current, vigente, setPlan));
    return () => cancelAnimationFrame(id);
  }, [vigente]);


  const porId = new Map(reporte.secciones.map((s, n) => [s.id, { s, n }]));
  const hojasDe = (hojas) => hojas.map((hoja, i) => (
    <Hoja key={i} pie={pie}>
      {hoja.map(({ id, escala, filas }) => {
        const { s, n } = porId.get(id);
        return <div key={id} style={escala < 1 ? { zoom: escala } : undefined}><Seccion s={s} n={n} filas={filas} /></div>;
      })}
    </Hoja>
  ));

  return (
    <>
      {/* Fuera de la pantalla: para medir (una hoja vacía y cada sección) y después para verificar las hojas. */}
      {!(vigente && vigente.listo) && createPortal(
        <div className="rp rp-papel rp-medir" aria-hidden="true">
          {!vigente ? (
            <>
              <Hoja pie={pie} medir={cuerpoRef} />
              <div className="rp-medir-secciones" ref={seccionesRef}>
                {reporte.secciones.map((s, n) => <Seccion key={s.id} s={s} n={n} />)}
              </div>
            </>
          ) : <div ref={pruebaRef}>{hojasDe(vigente.hojas)}</div>}
        </div>,
        document.body,
      )}
      {vigente && vigente.listo && vigente.hojas
        ? <div className="rp-papel rp-hojas">{hojasDe(vigente.hojas)}</div>
        : <ComoAntes reporte={reporte} pie={pie} />}
    </>
  );
}

/* Si no se pudo paginar: el navegador corta (logo arriba y pie abajo en cada hoja). */
function ComoAntes({ reporte, pie }) {
  return (
    <div className="rp-papel rp-flujo">
      <div className="rp-hoja-cabeza"><img src="/android-chrome-192x192.png" alt="VF" /></div>
      <div className="rp-hoja-pie">{pie}</div>
      <table className="rp-hoja">
        <thead><tr><td><div className="rp-hoja-lugar-cabeza" /></td></tr></thead>
        <tfoot><tr><td><div className="rp-hoja-lugar-pie" /></td></tr></tfoot>
        <tbody><tr><td>
          <div className="rp-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reporte.secciones.map((s, n) => <Seccion key={s.id} s={s} n={n} />)}
          </div>
        </td></tr></tbody>
      </table>
    </div>
  );
}
