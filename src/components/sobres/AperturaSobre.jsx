import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { varianteDeApertura, ajustarVariante, guionDe, indiceMejorCarta, varianteForzada } from '../../analytics/aperturas';
import { varianteDeEventoDb } from '../../analytics/eventos';
import { menosMovimiento, equipoLiviano } from '../../utils/preferenciasApertura';
import { sonar, callarTodo, pararMusica } from '../../utils/sonidoApertura';
import PaqueteSobre from './PaqueteSobre';
import Particulas from './Particulas';
import VideoApertura from './VideoApertura';
import MejorCarta from './MejorCarta';
import RevelacionCartas from './RevelacionCartas';
import './apertura.css';

/* LA APERTURA DE UN SOBRE (el director de la escena)
 *
 * Recibe el resultado REAL de sobres_abrir (las cartas ya salieron en la base)
 * y sólo decide cómo mostrarlo:
 *   - estándar: el sobre tiembla, se rompe y aparecen las cartas boca abajo;
 *   - video: la cinemática renderizada (pasillo del pabellón que se oscurece),
 *     después LA MEJOR CARTA del sobre sola y después las demás boca abajo.
 * Un solo temporizador a la vez (las fases nunca se pisan). SALTAR o Escape
 * adelantan una fase; si el video no carga o falla, se sigue igual. Las
 * cartas no dependen de nada de lo anterior.
 */

const claseSegura = (id) => String(id).replace(/[^a-z0-9_-]/gi, '-');

/* `forzar`: id de una variante para ver esa escena sí o sí (modo GOD, sólo prueba). */
export default function AperturaSobre({ resultado, prefs, evento = null, forzar = null, onCerrar }) {
  const variante = useMemo(() => ajustarVariante(
    (forzar && varianteForzada(forzar))
      // El sobre de un evento del Modo GOD trae su escena (nombre, video, colores).
      || (resultado.evento && varianteDeEventoDb(resultado.evento))
      || varianteDeApertura({ tipo: resultado.tipo, cartas: resultado.cartas, evento }),
    { prefs, menosMovimiento: menosMovimiento(), liviano: equipoLiviano() },
  ), [resultado, prefs, evento, forzar]);
  const guion = useMemo(() => guionDe(variante), [variante]);
  const mejor = useMemo(() => indiceMejorCarta(resultado.cartas), [resultado]);
  const conVideo = variante.modo === 'video';

  // Con "reducir movimiento": sin animación (la mejor carta igual se muestra primero si hay video).
  const [paso, setPaso] = useState(() => (variante.sinMovimiento ? guion.length - 1 : 0));
  const inicio = useRef(0);
  useEffect(() => { inicio.current = Date.now(); }, []);
  const fase = guion[paso].id;
  const avanzar = useCallback(() => setPaso((p) => Math.min(guion.length - 1, p + 1)), [guion]);

  /* Apertura estándar: el único temporizador (y su sonido). Las fases del
     modo video avanzan por eventos (fin del video, botones). */
  useEffect(() => {
    const f = guion[paso];
    if (f.ms == null) return undefined;
    const sonido = variante.sonidos[f.id];
    if (sonido) sonar(sonido, f.ms / 1000);
    const t = setTimeout(avanzar, f.ms);
    return () => clearTimeout(t);
  }, [paso, guion, variante, avanzar]);

  const saltar = useCallback(() => {
    if (Date.now() - inicio.current < variante.saltar.protegidoMs) return;
    callarTodo();
    pararMusica();
    // En el video, saltar lleva a la mejor carta; en la estándar, a las cartas.
    setPaso(conVideo && fase === 'video' ? 1 : guion.length - 1);
  }, [variante, conVideo, fase, guion]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && fase !== 'cartas') saltar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fase, saltar]);

  useEffect(() => () => { callarTodo(); pararMusica(0.2); }, []);

  const c = variante.colores;
  const vars = {
    '--ap-principal': c.principal, '--ap-secundario': c.secundario, '--ap-acento': c.acento, '--ap-fondo': c.fondo,
    '--ap-luz': c.luz, '--ap-texto': c.texto, '--ap-int': variante.intensidad, '--ap-vib': variante.vibracion,
    ...Object.fromEntries(Object.entries(variante.tiempos).map(([k, ms]) => [`--t-${k}`, `${ms}ms`])),
  };

  return (
    <div className={`ap ap-modo-${variante.modo} ap-v-${claseSegura(variante.id)} ap-fase-${fase}${variante.latido ? ' ap-latido' : ''}${variante.excepcional ? ' ap-excepcional' : ''}`}
      style={vars} role="dialog" aria-modal="true" aria-label={`Apertura: ${variante.nombre}`}>
      {fase === 'video' && (
        <VideoApertura video={variante.video} velocidad={variante.velocidadVideo} onFin={avanzar} />
      )}
      {(fase === 'tiembla' || fase === 'abre') && (
        <>
          {fase === 'tiembla' && <Particulas cantidad={variante.particulas} colores={c.particulas} modo="junta" semilla={3} />}
          {fase === 'abre' && <Particulas cantidad={variante.particulas} colores={c.particulas} modo="estalla" semilla={7} />}
          <PaqueteSobre variante={variante} />
          <div className="ap-flash" />
        </>
      )}
      {fase !== 'cartas' && fase !== 'figura' && (
        <>
          <div className="ap-rotulo" aria-live="polite">{variante.nombre}</div>
          <button className="ap-saltar" onClick={saltar} aria-label="Saltar la animación">SALTAR</button>
        </>
      )}
      {fase === 'figura' && (
        <MejorCarta carta={resultado.cartas[mejor]} variante={variante} restantes={resultado.cartas.length - 1} onSeguir={avanzar} />
      )}
      {fase === 'cartas' && (
        <RevelacionCartas resultado={resultado} variante={variante} onCerrar={onCerrar} yaDada={conVideo ? mejor : -1} />
      )}
    </div>
  );
}
