import React from 'react';
import { createPortal } from 'react-dom';
import './playbook.css';

/* El Libro Táctico en papel. Se cuelga del <body> (como los Reportes): la app
   vive en un contenedor de alto fijo con overflow oculto, y desde ahí el
   navegador imprimía sólo la primera hoja. En pantalla no se ve.

   La clase rp-impresion va además de lt-impresion a propósito: si en la misma
   sesión se abrió Reportes, su hoja de estilos de impresión oculta todo lo que
   no sea .rp-impresion. Así este documento sobrevive a esa regla. */
export default function PlaybookPDF({ club, titulo, subtitulo, jugadas, situacionDe }) {
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const porSituacion = jugadas.reduce((acc, j) => {
    const s = situacionDe(j.tarea) || 'Otras';
    (acc[s] = acc[s] || []).push(j);
    return acc;
  }, {});
  const varias = jugadas.length > 1;
  let numero = 0;

  return createPortal(
    <div className="rp-impresion lt-impresion">
      {varias && (
        <section className="lt-portada">
          {club.escudo && <img className="lt-escudo" src={club.escudo} alt="" />}
          <div className="lt-club">{club.nombre}</div>
          <h1 className="lt-titulo">{titulo}</h1>
          <p className="lt-subtitulo">{subtitulo}</p>
          <ol className="lt-indice">
            {Object.entries(porSituacion).map(([sit, js]) => (
              <li key={sit}>
                <b>{sit}</b>
                <ul>{js.map((j) => <li key={j.tarea.id}>{j.tarea.titulo}</li>)}</ul>
              </li>
            ))}
          </ol>
          <p className="lt-fecha">Impreso el {hoy} · {jugadas.length} jugadas</p>
        </section>
      )}

      {Object.entries(porSituacion).map(([sit, js]) => js.map((j) => {
        numero += 1;
        const t = j.tarea;
        return (
          <article key={t.id} className="lt-jugada">
            <header className="lt-cabeza">
              <div>
                <span className="lt-chip">{sit}</span>
                <h2>{varias ? `${numero}. ` : ''}{t.titulo}</h2>
                {t.objetivo_principal && <p className="lt-objetivo">{t.objetivo_principal}</p>}
              </div>
              <div className="lt-marca">{club.nombre}</div>
            </header>

            {j.pasos.length > 0 ? (
              <div className={`lt-pasos ${j.pasos.length === 1 ? 'lt-pasos-uno' : ''}`}>
                {j.pasos.map((p) => (
                  <figure key={p.n} className="lt-paso">
                    <img src={p.imagen} alt={`Paso ${p.n}`} />
                    {j.pasos.length > 1 && (
                      <figcaption>
                        <b>Paso {p.n}</b>
                        {p.n === 1 ? ' · posición inicial' : p.movimientos ? ` · ${p.movimientos} ${p.movimientos === 1 ? 'se mueve' : 'se mueven'}` : ''}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            ) : j.imagenSuelta ? (
              <div className="lt-pasos lt-pasos-uno"><figure className="lt-paso"><img src={j.imagenSuelta} alt="Gráfico" /></figure></div>
            ) : (
              <p className="lt-vacio">Esta jugada no tiene gráfico.</p>
            )}
            {j.pasos.length > 1 && (
              <p className="lt-leyenda">En cada paso: en transparencia, dónde estaba cada jugador; en amarillo punteado, su recorrido.</p>
            )}

            <h3>Desarrollo</h3>
            <div className="lt-texto">{t.descripcion || 'Sin detalle escrito.'}</div>
            {(t.video_url || t.video_mp4_url) && (
              <p className="lt-video">Video: {t.video_url || t.video_mp4_url}</p>
            )}
            {t.categoria_recomendada && t.categoria_recomendada !== 'Todas' && (
              <p className="lt-pie-jugada">Categoría: {t.categoria_recomendada}</p>
            )}
          </article>
        );
      }))}
    </div>,
    document.body,
  );
}
