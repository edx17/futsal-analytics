import React, { useEffect, useState } from 'react';
import { LADOS } from '../../analytics/penales';
import {
  destinoDeLaPelota, destinoAtajada, fondoDeLaRed, paradaDelArquero, equipoDelArquero, posicionDelCuadro, cuadroEn,
  cajaDelArquero, pelotaEnVuelo, VUELO_MS,
} from '../../analytics/penales3d';

/* LA TANDA, RENDERIZADA
 *
 * Desde el punto del penal, en el pabellón de las cinemáticas. Todo sale de
 * public/penales/ (cine/escena_penales.py + penales_empaquetar.py):
 *   fondo (sin red) → red (se infla con el gol) → arquero (tiras de cuadros) → pelota.
 * Si los archivos no están, `cargarEscena()` (utils/escenaPenales) devuelve null y Penales usa el arco dibujado.
 * Penales la monta de nuevo en cada tiro (con `key`), así el reloj arranca en 0
 * con el remate.
 */

const BASE = '/penales/';

const REACCION_MS = 70;      // el arquero sale apenas después del remate
const DESPUES_MS = 520;      // lo que pasa después de que la pelota llega

/* El reloj de la escena: ms desde que se montó, a ~30 cuadros por segundo. */
function useReloj() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    let id;
    const t0 = performance.now();
    let ultimo = -1;
    const paso = (t) => {
      const n = Math.floor((t - t0) / 33);
      if (n !== ultimo) { ultimo = n; setMs(t - t0); }
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, []);
  return ms;
}

const pct = (v, total) => `${(v / total) * 100}%`;

export default function EscenaPenales({ geo, tiro, turno, puedo, elegir }) {
  const ms = useReloj();
  const desde = ms;   // desde el remate (o desde que se mostró, en la espera)

  // el arquero
  const A = geo.arquero;
  const parada = tiro ? paradaDelArquero(tiro) : { anim: 'espera', espejo: false };
  const equipo = equipoDelArquero(tiro ? tiro.equipo : turno || 'propio');
  const anim = A.anims[parada.anim];
  const cuadro = cuadroEn(tiro ? desde - REACCION_MS : ms, anim, A.fps);
  const pos = posicionDelCuadro(cuadro, anim.cuadros, A.columnas);
  const caja = cajaDelArquero(geo, parada.espejo);

  // la pelota
  let pelota = null;
  let detras = false;     // ya entró: queda detrás del arquero
  let inflado = 0;
  let impacto = null;
  if (tiro) {
    const destino = tiro.motivo === 'atajada' ? destinoAtajada(geo, tiro) : destinoDeLaPelota(geo, tiro.celda, tiro.motivo);
    const t = desde / VUELO_MS;
    if (t < 1) {
      pelota = { ...pelotaEnVuelo(geo, destino, Math.max(0, t)), o: 1 };
    } else {
      const p = Math.min(1, (desde - VUELO_MS) / DESPUES_MS);
      const [dx, dy] = destino;
      const r0 = geo.pelota_en_arco;
      const lado = dx < geo.ancho / 2 ? -1 : 1;
      if (tiro.motivo === 'gol') {
        const [fx, fy] = fondoDeLaRed(geo, tiro.celda);
        const e = Math.min(1, p * 2.2);
        pelota = { x: dx + (fx - dx) * e, y: dy + (fy - dy) * e, r: r0 * (1 - 0.18 * e), o: 1 };
        detras = true;
        inflado = Math.sin(Math.PI * Math.min(1, p * 1.6));
        impacto = [fx, fy];
      } else if (tiro.motivo === 'atajada') {
        // rebota hacia adelante y cae
        pelota = { x: dx + lado * 70 * p, y: dy + (geo.arco.abajo_izq[1] + 60 - dy) * p * p - 50 * Math.sin(Math.PI * p), r: r0 * (1 + 0.5 * p), o: 1 - Math.max(0, p - 0.7) / 0.3 };
      } else if (tiro.motivo === 'palo') {
        pelota = { x: dx + lado * 150 * p, y: dy - 40 * Math.sin(Math.PI * p) + 60 * p, r: r0 * (1 + 0.3 * p), o: 1 - Math.max(0, p - 0.6) / 0.4 };
      } else {
        // afuera: sigue de largo y se pierde
        pelota = { x: dx + (dx - geo.ancho / 2) * 0.25 * p, y: dy - 30 * p, r: r0 * (1 - 0.25 * p), o: 1 - p };
      }
    }
  }

  const { arriba_izq: ai, arriba_der: ad, abajo_izq: bi } = geo.arco;
  const R = geo.red;

  return (
    <div className="vd-escena-penal" style={{ aspectRatio: `${geo.ancho} / ${geo.alto}` }}>
      <img className="vd-ep-capa" src={`${BASE}fondo.webp`} alt="" draggable={false} />
      <img className="vd-ep-red" src={`${BASE}red.webp`} alt="" draggable={false}
        style={{
          left: pct(R.x, geo.ancho), top: pct(R.y, geo.alto), width: pct(R.w, geo.ancho), height: pct(R.h, geo.alto),
          transformOrigin: impacto ? `${pct(impacto[0] - R.x, R.w)} ${pct(impacto[1] - R.y, R.h)}` : '50% 50%',
          transform: `scale(${1 + 0.06 * inflado})`,
        }} />
      {pelota && detras && <Pelota geo={geo} p={pelota} ms={ms} />}
      <div className="vd-ep-arquero"
        style={{
          left: `${caja.left}%`, top: `${caja.top}%`, width: `${caja.width}%`, height: `${caja.height}%`,
          backgroundImage: `url(${BASE}arquero_${equipo}_${parada.anim}.webp)`,
          backgroundSize: `${pos.ancho}% ${pos.alto}%`, backgroundPosition: `${pos.x}% ${pos.y}%`,
          transform: parada.espejo ? 'scaleX(-1)' : 'none',
        }} />
      {pelota && !detras && <Pelota geo={geo} p={pelota} ms={ms} />}

      {/* lo que se toca, sobre el arco: 9 cuadrantes para patear, 3 franjas para atajar */}
      {puedo && (
        <div className="vd-ep-toques" style={{ left: pct(ai[0], geo.ancho), top: pct(ai[1], geo.alto), width: pct(ad[0] - ai[0], geo.ancho), height: pct(bi[1] - ai[1], geo.alto) }}>
          {turno === 'propio' ? (
            <div className="vd-tanda-grilla vd-ep-grilla">
              {Array.from({ length: 9 }, (_, i) => (
                <button key={i} className="vd-tanda-celda" onClick={() => elegir(i)} aria-label={`Patear al cuadrante ${i + 1}`} />
              ))}
            </div>
          ) : (
            <div className="vd-tanda-lados vd-ep-grilla">
              {/* Sin rótulos: se toca el lado del arco (el nombre queda para lectores de pantalla). */}
              {LADOS.map((l, i) => <button key={l} className="vd-tanda-lado" onClick={() => elegir(i)} aria-label={`Atajar a la ${l.toLowerCase()}`} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pelota({ geo, p, ms }) {
  return (
    <div className="vd-ep-pelota"
      style={{
        left: pct(p.x - p.r, geo.ancho), top: pct(p.y - p.r, geo.alto), width: pct(p.r * 2, geo.ancho),
        opacity: Math.max(0, p.o), transform: `rotate(${(ms * 0.8) % 360}deg)`,
      }} />
  );
}
