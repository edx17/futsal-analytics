import { useEffect, useState } from 'react';

/* ARRASTRAR CARTAS, CON MOUSE O CON EL DEDO
 *
 * Con eventos de puntero y no con el drag & drop de HTML, que en los
 * celulares no anda. Reglas:
 *  - Mouse: el arrastre empieza al mover la carta unos píxeles.
 *  - Dedo: hay que dejarla apretada un momento. Si el dedo se mueve antes,
 *    es un scroll (el banco se desplaza de costado, la página para abajo) y
 *    no se toca nada.
 *  - El destino es el lugar de la cancha que quede debajo del puntero: el
 *    elemento con `data-lugar`.
 *
 * `destinoValido(origen, destino)` decide si se puede soltar ahí;
 * `alSoltar` hace el cambio y `alRechazar` avisa por qué no.
 */

const UMBRAL_MOUSE = 6;       // px que hay que mover con el mouse para arrastrar
const ESPERA_TACTIL = 260;    // ms con el dedo quieto antes de arrastrar
const TOLERANCIA_TACTIL = 10; // px que se puede mover el dedo mientras espera

const destinoEn = (x, y) => {
  const el = document.elementFromPoint(x, y)?.closest?.('[data-lugar]');
  return el ? Number(el.dataset.lugar) : null;
};

/* El motor vive fuera de React: guarda en qué arrastre está y los
   manejadores que se agregan a window (tienen que ser los mismos al sacarlos). */
function crearMotor(setVista) {
  let estado = null;
  let recien = false;
  let cb = {};

  const bloquearScroll = (e) => { if (estado?.activo) e.preventDefault(); };

  const actualizar = (x, y) => {
    if (!estado) return;
    const destino = destinoEn(x, y);
    const valido = destino != null && !!cb.destinoValido?.(estado.origen, destino);
    setVista({ carta: estado.carta, origen: estado.origen, x, y, destino, valido });
  };

  const activar = (x, y) => {
    if (!estado) return;
    estado.activo = true;
    recien = true;
    actualizar(x, y);
  };

  function terminar() {
    if (estado?.timer) clearTimeout(estado.timer);
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', terminar);
    document.removeEventListener('touchmove', bloquearScroll);
    estado = null;
    setVista(null);
  }

  function mover(e) {
    if (!estado || e.pointerId !== estado.pointerId) return;
    const lejos = Math.hypot(e.clientX - estado.x0, e.clientY - estado.y0);
    if (!estado.activo) {
      if (estado.tactil) { if (lejos > TOLERANCIA_TACTIL) terminar(); return; }
      if (lejos >= UMBRAL_MOUSE) activar(e.clientX, e.clientY);
      return;
    }
    actualizar(e.clientX, e.clientY);
  }

  function soltar(e) {
    if (estado?.activo) {
      const destino = destinoEn(e.clientX, e.clientY);
      if (destino != null) {
        if (cb.destinoValido?.(estado.origen, destino)) cb.alSoltar?.(estado.origen, destino);
        else cb.alRechazar?.(estado.origen, destino);
      }
    }
    terminar();
  }

  const empezar = (e, origen, carta) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    terminar();
    recien = false;
    const tactil = e.pointerType !== 'mouse';
    estado = { origen, carta, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, tactil, activo: false, timer: null };
    if (tactil) estado.timer = setTimeout(() => { if (estado) activar(estado.x0, estado.y0); }, ESPERA_TACTIL);
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', terminar);
    document.addEventListener('touchmove', bloquearScroll, { passive: false });
  };

  return {
    empezar,
    terminar,
    configurar: (callbacks) => { cb = callbacks; },
    /** true si la última interacción fue un arrastre: el click que sigue no cuenta como toque. */
    recienArrastro: () => recien,
  };
}

export function useArrastre({ alSoltar, destinoValido, alRechazar }) {
  const [vista, setVista] = useState(null); // { carta, origen, x, y, destino, valido }
  const [motor] = useState(() => crearMotor(setVista));

  useEffect(() => { motor.configurar({ alSoltar, destinoValido, alRechazar }); });
  useEffect(() => () => motor.terminar(), [motor]);

  return { vista, empezar: motor.empezar, recienArrastro: motor.recienArrastro };
}
