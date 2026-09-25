/* ══════════════════════════════════════════════════════════════════════════
   CANCHA DEL CELULAR

   La toma de datos guarda todo en las coordenadas de la cancha acostada de
   la PC: x de 0 a 100 a lo largo (de un arco al otro) e y de 0 a 100 a lo
   ancho (0 = banda de arriba). En el celular parado la cancha se dibuja
   vertical: lo que en la PC es "hacia la derecha" acá es "hacia arriba" y
   la banda de arriba queda a la izquierda. Estas dos funciones traducen en
   los dos sentidos, así el resto de la pantalla no se entera.
   ══════════════════════════════════════════════════════════════════════════ */

const acotar = (v) => Math.max(0, Math.min(100, v));

/** Un toque en la cancha dibujada → coordenadas de la cancha acostada. */
export function toqueEnCancha(px, py, ancho, alto, vertical) {
  const fx = ancho > 0 ? px / ancho : 0;
  const fy = alto > 0 ? py / alto : 0;
  return vertical
    ? { x: acotar((1 - fy) * 100), y: acotar(fx * 100) }
    : { x: acotar(fx * 100), y: acotar(fy * 100) };
}

/** Coordenadas de la cancha acostada → dónde se dibuja (left/top en %). */
export function posicionEnCancha(x, y, vertical) {
  return vertical ? { left: y, top: 100 - x } : { left: x, top: y };
}

/** ¿Es un teléfono? El lado corto de la pantalla, en cualquier orientación.
    Las tablets (600 px o más) siguen con la vista de siempre. */
export const esPantallaTelefono = (ancho, alto) => Math.min(ancho, alto) <= 500;
