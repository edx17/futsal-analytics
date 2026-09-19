import React, { useRef, useState, useLayoutEffect } from 'react';

/* EL CONTENIDO SE ACOMODA AL LIENZO, NO AL REVÉS
 *
 * Una placa mide 1080×1350 o 1080×1920 y eso no se negocia. Lo que sí varía es
 * cuánto ocupa el contenido: 18 equipos ocupan más que 12, y sobre todo la
 * tipografía mide distinto en cada equipo. Se comprobó midiendo la misma tabla
 * con tres tipografías: 62, 67 y ~71 px por fila. Ajustar los márgenes a mano
 * contra eso es perseguir un blanco móvil: queda bien en la máquina donde se
 * mide y se corta en la del que publica.
 *
 * Así que se mide el alto real y, si no entra, se encoge lo justo.
 *
 * EL ANCHO SE COMPENSA. Encoger a secas también angosta, y la placa quedaba
 * con dos franjas muertas a los costados. La caja de maquetación se ensancha
 * en la misma proporción (1/k) antes de encogerla por k: el resultado ocupa
 * todo el ancho y lo único que baja es el tamaño de todo lo de adentro.
 *
 * Como ensanchar puede cambiar el alto, la escala se recalcula hasta que se
 * asienta. `scrollHeight` devuelve el alto de maquetación —no el visual—, así
 * que sigue siendo correcto aunque ya haya una escala puesta. El umbral evita
 * que dos valores casi iguales se queden rebotando.
 */

const MINIMO = 0.55;   // por debajo no se lee; mejor que se note que sobra
const UMBRAL = 0.004;  // diferencias más chicas no valen otro renderizado

export default function Ajustado({ alto, children }) {
  const ref = useRef(null);
  const [escala, setEscala] = useState(1);

  useLayoutEffect(() => {
    let vivo = true;
    const medir = () => {
      const n = ref.current;
      if (!n || !vivo || !alto) return;
      const real = n.scrollHeight;
      if (!real) return;
      const nueva = Math.max(MINIMO, Math.min(1, alto / real));
      if (Math.abs(nueva - escala) > UMBRAL) setEscala(nueva);
    };

    medir();
    /* Otra pasada por si algún bloque se acomoda recién en el cuadro siguiente
       (los SVG de la cancha, por ejemplo), y otra al terminar las tipografías,
       que es cuando cambian las medidas. */
    const f = requestAnimationFrame(medir);
    document.fonts?.ready.then(medir).catch(() => {});
    return () => { vivo = false; cancelAnimationFrame(f); };
  });

  const encogido = escala < 1;

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <div
        ref={ref}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: encogido ? `${100 / escala}%` : '100%',
          transformOrigin: 'top left',
          transform: encogido ? `scale(${escala})` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
