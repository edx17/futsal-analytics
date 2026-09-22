import { useState, useEffect } from 'react';

/* Cuánto mide de ancho un elemento, en vivo.
 *
 * Hace falta porque `window.innerWidth` no sirve: entre la ventana y el
 * tablero está la barra lateral, que además se pliega. Lo único que dice la
 * verdad es medir el contenedor.
 *
 * Devuelve 0 hasta la primera medición; quien lo use decide qué mostrar
 * mientras tanto, en vez de parpadear con un valor inventado.
 */
/**
 * Cuánto mide de ancho un elemento, en vivo.
 *
 * Devuelve `[ancho, refDeMedicion]`. El segundo se pasa como `ref={...}` al
 * elemento a medir.
 *
 * Usa un ref de función y no `useRef` a propósito: el tablero no dibuja la
 * grilla hasta que terminó de cargar, así que con `useRef` el efecto corría
 * cuando todavía no había nodo, se iba sin observar nada y nunca volvía a
 * intentarlo. El ancho quedaba en cero para siempre. Con un ref de función,
 * React avisa cuando el nodo aparece y ahí recién se mide.
 *
 * Devuelve 0 hasta la primera medición; quien lo use decide qué mostrar
 * mientras tanto, en vez de parpadear con un valor inventado.
 */
export function useAncho() {
  const [nodo, setNodo] = useState(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    if (!nodo) return undefined;

    // Sin ResizeObserver (navegadores viejos) se mide una vez, en el próximo
    // cuadro: medir acá mismo sería tocar el estado antes de que el efecto
    // termine, que es lo que dispara renders en cascada.
    if (typeof ResizeObserver === 'undefined') {
      const t = requestAnimationFrame(() => setAncho(nodo.getBoundingClientRect().width));
      return () => cancelAnimationFrame(t);
    }

    const ro = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect?.width;
      // Sólo si cambió de verdad: si no, cada render dispara otro render.
      if (typeof w === 'number') setAncho((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo]);

  return [ancho, setNodo];
}

/* Cuántas columnas entran de verdad, dado el ancho medido.
 *
 * Con `repeat(auto-fit, ...)` sola no alcanza: una tarjeta que pide
 * `grid-column: span 3` OBLIGA a la grilla a tener tres columnas, entren o no.
 * A 768px eso daba dos columnas de 300px y una tercera de 104px. Por eso el
 * número se calcula acá y después se recorta el ancho de cada tarjeta.
 */
export function columnasQueEntran(ancho, { minimo = 300, separacion = 16, tope = 4, porDefecto = 3 } = {}) {
  if (!ancho) return porDefecto;                       // todavía sin medir
  const n = Math.floor((ancho + separacion) / (minimo + separacion));
  return Math.max(1, Math.min(tope, n));
}
