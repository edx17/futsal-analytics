import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { varianteDeApertura, ajustarVariante, guionDe } from '../../analytics/aperturas';
import { menosMovimiento, equipoLiviano } from '../../utils/preferenciasApertura';
import { sonar, callarTodo } from '../../utils/sonidoApertura';
import PaqueteSobre from './PaqueteSobre';
import TunelFutsal from './TunelFutsal';
import Particulas from './Particulas';
import RevelacionCartas from './RevelacionCartas';
import './apertura.css';

/* LA APERTURA DE UN SOBRE (el director de la escena)
 *
 * Recibe el resultado REAL de sobres_abrir (las cartas ya salieron en la base)
 * y sólo decide cómo mostrarlo:
 *   1. elige la variante (analytics/aperturas.js) según el tipo de sobre y lo
 *      que trae, y la ajusta a las preferencias y al equipo;
 *   2. recorre las fases de a una, con UN solo temporizador a la vez (nunca se
 *      pisan dos etapas);
 *   3. SALTAR (o Escape) corta todo y va directo a las cartas;
 *   4. termina en las cartas boca abajo de siempre (RevelacionCartas).
 * Si algo de la escena falla, las cartas igual están: la fase 'cartas' no
 * depende de nada de lo anterior.
 */

/* Qué sonido acompaña cada fase (las de la apertura estándar usan los de la variante). */
const SONIDO_DE_FASE = { tiembla: 'activacion', abre: 'clima', activacion: 'activacion', portal: 'portal', tunel: 'tunel', clima: 'clima', salida: 'salida' };

const claseSegura = (id) => String(id).replace(/[^a-z0-9_-]/gi, '-');

export default function AperturaSobre({ resultado, prefs, onCerrar }) {
  const variante = useMemo(() => ajustarVariante(
    varianteDeApertura({ tipo: resultado.tipo, cartas: resultado.cartas }),
    { prefs, menosMovimiento: menosMovimiento(), liviano: equipoLiviano() },
  ), [resultado, prefs]);
  const guion = useMemo(() => guionDe(variante), [variante]);
  const ultimo = guion.length - 1;

  const [paso, setPaso] = useState(() => (variante.sinMovimiento ? ultimo : 0));
  const inicio = useRef(0);
  useEffect(() => { inicio.current = Date.now(); }, []);
  const fase = guion[paso].id;

  /* El único temporizador: cuando termina la fase, pasa a la siguiente. */
  useEffect(() => {
    const f = guion[paso];
    if (f.id === 'cartas') return undefined;
    const sonido = variante.sonidos[SONIDO_DE_FASE[f.id]];
    if (sonido) sonar(sonido, (f.ms || 300) / 1000);
    const t = setTimeout(() => setPaso((p) => Math.min(ultimo, p + 1)), f.ms || 0);
    return () => clearTimeout(t);
  }, [paso, guion, ultimo, variante]);

  const saltar = useCallback(() => {
    if (Date.now() - inicio.current < variante.saltar.protegidoMs) return;
    callarTodo();
    setPaso(ultimo);
  }, [ultimo, variante]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && fase !== 'cartas') saltar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fase, saltar]);

  // Al cerrar (o desmontar), que no quede nada sonando.
  useEffect(() => () => callarTodo(), []);

  const c = variante.colores;
  const vars = {
    '--ap-principal': c.principal, '--ap-secundario': c.secundario, '--ap-acento': c.acento, '--ap-fondo': c.fondo,
    '--ap-luz': c.luz, '--ap-texto': c.texto, '--ap-int': variante.intensidad, '--ap-vib': variante.vibracion,
    '--ap-blur': `${variante.desenfoque}px`, '--ap-balanceo': `${variante.camara.balanceo}px`,
    ...Object.fromEntries(Object.entries(variante.tiempos).map(([k, ms]) => [`--t-${k}`, `${ms}ms`])),
  };
  const enEscena = fase !== 'cartas';
  const cine = variante.modo === 'cine';

  return (
    <div className={`ap ap-${variante.modo} ap-v-${claseSegura(variante.id)} ap-fase-${fase}${variante.latido ? ' ap-latido' : ''}`}
      style={vars} role="dialog" aria-modal="true" aria-label={`Apertura: ${variante.nombre}`}>
      {enEscena && (
        <>
          {cine && <TunelFutsal variante={variante} />}
          {(fase === 'activacion' || fase === 'tiembla') && <Particulas cantidad={variante.particulas} colores={c.particulas} modo="junta" semilla={3} />}
          {(fase === 'clima' || fase === 'abre') && <Particulas cantidad={variante.particulas} colores={c.particulas} modo="estalla" semilla={7} />}
          {['tiembla', 'abre', 'activacion', 'portal'].includes(fase) && <PaqueteSobre variante={variante} />}
          <div className="ap-flash" />
          <div className="ap-rotulo" aria-live="polite">{variante.nombre}</div>
          <button className="ap-saltar" onClick={saltar} aria-label="Saltar la animación y ver las cartas">SALTAR</button>
        </>
      )}
      {!enEscena && <RevelacionCartas resultado={resultado} variante={variante} onCerrar={onCerrar} />}
    </div>
  );
}
