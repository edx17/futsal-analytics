import { useCallback, useEffect, useRef, useState } from 'react';
import { subirEvaluaciones } from './datos';

/* PRUEBAS · COLA OFFLINE DE PUNTAJES (el mismo criterio que TomaDatos.jsx)
 *
 * Cada tap se guarda primero en localStorage (por evaluador) y se intenta
 * subir. Si no hay red, queda en la cola y se reintenta cada 15 s y al
 * volver la conexión (evento 'online'). La clave del puntaje es
 * sesión+candidato+evaluador+bloque+criterio: si se toca dos veces el mismo
 * criterio, en la cola queda el último (y en la base se pisa, upsert).
 */

const REINTENTO_MS = 15000;
const claveDe = (f) => `${f.sesion_id}|${f.candidato_id}|${f.evaluador_id}|${f.bloque}|${f.criterio}`;
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Cola de pruebas llena', e); } };

export function useColaPruebas(evaluadorId) {
  const k = evaluadorId ? `vc_cola_pruebas_${evaluadorId}` : null;
  const [pendientes, setPendientes] = useState(() => (k ? leer(k).length : 0));
  const [error, setError] = useState(null);
  const subiendo = useRef(false);

  const vaciar = useCallback(async () => {
    if (!k || subiendo.current) return;
    const cola = leer(k);
    setPendientes(cola.length);
    if (!cola.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    subiendo.current = true;
    try {
      // eslint-disable-next-line no-unused-vars
      await subirEvaluaciones(cola.map(({ updated_local, ...f }) => f));   // la marca local no es una columna
      // Saca sólo lo que se subió (pudo entrar algo nuevo mientras tanto).
      const subidas = new Map(cola.map((f) => [claveDe(f), f.updated_local]));
      const resto = leer(k).filter((f) => subidas.get(claveDe(f)) !== f.updated_local);
      escribir(k, resto);
      setPendientes(resto.length);
      setError(null);
    } catch (e) {
      setError(e?.message || 'No se pudo subir');
    } finally {
      subiendo.current = false;
    }
  }, [k]);

  /** Guarda un puntaje (o lo reemplaza) y trata de subirlo ya. */
  const agregar = useCallback((fila) => {
    if (!k) return;
    const nueva = { ...fila, evaluador_id: evaluadorId, updated_local: Date.now() };
    const cola = leer(k).filter((f) => claveDe(f) !== claveDe(nueva));
    cola.push(nueva);
    escribir(k, cola);
    setPendientes(cola.length);
    vaciar();
  }, [k, evaluadorId, vaciar]);

  /** Lo que está en la cola, por clave (para pintar lo cargado aunque todavía no subió). */
  const enCola = useCallback(() => new Map((k ? leer(k) : []).map((f) => [claveDe(f), f])), [k]);

  useEffect(() => {
    if (!k) return undefined;
    const t0 = setTimeout(vaciar, 0);
    const id = setInterval(vaciar, REINTENTO_MS);
    const alVolver = () => vaciar();
    window.addEventListener('online', alVolver);
    return () => { clearTimeout(t0); clearInterval(id); window.removeEventListener('online', alVolver); };
  }, [k, vaciar]);

  return { agregar, pendientes, error, reintentar: vaciar, enCola };
}

export { claveDe as claveDePuntaje };
