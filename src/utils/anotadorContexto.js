import { useEffect, useSyncExternalStore } from 'react';

/* ANOTADOR · QUÉ SE ESTÁ MIRANDO
 *
 * Cada pantalla avisa con useVincularNotas qué tiene abierto (un video, un
 * rival, la semana del microciclo, una sesión, un partido) y el anotador
 * flotante vincula ahí la nota nueva. La última que avisó manda; al cerrarse,
 * vuelve la anterior (por ejemplo: cerrar la sesión vuelve a la semana).
 * `tiempo`: en un video, una función que devuelve el segundo actual.
 */

let pila = [];
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

export function contextoActual() { return pila.length ? pila[pila.length - 1] : null; }
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

export function useContextoNotas() { return useSyncExternalStore(suscribir, contextoActual, contextoActual); }

/** vinculo: { tipo, id, nombre, tiempo? } o null (no vincula nada). */
export function useVincularNotas(vinculo) {
  const tipo = vinculo?.tipo; const id = vinculo?.id; const nombre = vinculo?.nombre; const tiempo = vinculo?.tiempo;
  useEffect(() => {
    if (!tipo || id == null) return undefined;
    const entrada = { tipo, id: String(id), nombre: nombre || '', tiempo };
    pila = [...pila, entrada];
    avisar();
    return () => { pila = pila.filter((x) => x !== entrada); avisar(); };
  }, [tipo, id, nombre, tiempo]);
}

/* Para abrir el anotador desde un botón de una pantalla ("+ Nota"). */
export const abrirAnotador = () => window.dispatchEvent(new Event('anotador:abrir'));
