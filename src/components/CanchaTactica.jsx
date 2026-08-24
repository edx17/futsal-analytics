import React, { useRef, useCallback, useMemo } from 'react';
import { BALON_ID, CELDAS, espejar } from '../offline/modelo';

/* ═══════════════════════════════════════════════════════════════════════════
   EL TABLERO

   Cancha reglamentaria de futsal (40 × 20 m, relación 2:1) con las mismas
   marcas que el tracker en vivo: medio campo, círculo central y las dos
   áreas semicirculares de 6 metros.

   Encima, la grilla de lectura: cuatro zonas de 10 metros desde nuestro
   arco (Z1 a Z4) por tres carriles (Izquierdo, Centro, Derecho). Doce
   cuadrados. Es la misma grilla que ya se ve en TomaDatos.

   Dos modos:
     · 'marcar' → tocar la cancha registra la acción elegida.
     · 'mover'  → arrastrás las fichas y la pelota. Cada vez que soltás una
                  queda registrada su posición en ese minuto.

   Las posiciones se guardan SIEMPRE en coordenadas absolutas (x=0 nuestro
   arco, x=100 el rival). Invertir la cancha cambia cómo se dibuja, nunca lo
   que se guarda.
   ═══════════════════════════════════════════════════════════════════════════ */

const VERDE = '#00ff88';
const ROJO = '#ef4444';
const LINEA = 'var(--border)';
const PUNTEADO = 'rgba(255,255,255,0.15)';

function Ficha({ pos, invertida, seleccionada, rol, arrastrable, onTomar, tam, etiquetas }) {
  const vista = espejar(pos, invertida);
  const esBalon = pos.id_jugador === BALON_ID;
  const esRival = pos.equipo === 'Rival';
  const color = esBalon ? '#ffffff' : esRival ? ROJO : VERDE;

  /* El rol viene del cálculo de la línea de la pelota: quién está cubriendo
     y quién está llegando en este instante. */
  const anillo = rol === 'defensor' ? '#22d3ee' : rol === 'atacante' ? '#f97316' : null;
  const lado = esBalon ? Math.round(tam * 0.5) : tam;

  /* El apellido va arriba de la ficha, chico y sin peso: tiene que dejar
     leer la cancha, no taparla. */
  const texto = esBalon || etiquetas === 'ninguna' ? null
    : etiquetas === 'apellido' ? (pos.apellido || pos.nombre || (esRival ? `R${pos.dorsal}` : ''))
    : null;

  return (
    <div
      onPointerDown={arrastrable ? (e) => onTomar(e, pos) : undefined}
      title={pos.nombre || (esBalon ? 'Pelota' : `${esRival ? 'Rival' : 'Propio'} #${pos.dorsal}`)}
      style={{
        position: 'absolute',
        left: `${vista.x}%`,
        top: `${vista.y}%`,
        transform: 'translate(-50%, -50%)',
        width: `${lado}px`,
        height: `${lado}px`,
        borderRadius: '50%',
        background: esBalon ? '#fff' : esRival ? 'rgba(239,68,68,0.22)' : 'rgba(0,255,136,0.22)',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: color,
        color,
        fontSize: `${Math.max(8, Math.round(tam * 0.42))}px`,
        fontWeight: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: arrastrable ? 'grab' : 'default',
        touchAction: 'none',
        userSelect: 'none',
        pointerEvents: arrastrable ? 'auto' : 'none',
        boxShadow: seleccionada
          ? `0 0 0 3px ${color}, 0 0 14px ${color}`
          : anillo ? `0 0 0 2px ${anillo}` : 'none',
        zIndex: esBalon ? 15 : seleccionada ? 14 : 12,
      }}
    >
      {esBalon ? '' : (pos.dorsal !== '' && pos.dorsal != null ? pos.dorsal : '·')}
      {texto && (
        <span style={{
          position: 'absolute', bottom: `${lado + 2}px`, left: '50%', transform: 'translateX(-50%)',
          fontSize: `${Math.max(7, Math.round(tam * 0.33))}px`, fontWeight: 600,
          letterSpacing: '0.3px', color, opacity: 0.72, whiteSpace: 'nowrap',
          textShadow: '0 1px 3px #000', pointerEvents: 'none',
        }}>
          {texto}
        </span>
      )}
    </div>
  );
}

export default function CanchaTactica({
  posiciones = [],
  onMover,
  onTocarCancha,
  modo = 'marcar',
  invertida = false,
  seleccionada = null,
  onSeleccionar,
  linea = null,
  mostrarLinea = true,
  mostrarZonas = true,
  etiquetas = 'dorsal',        // 'dorsal' | 'apellido' | 'ninguna'
  tamFicha = 28,
  children,
}) {
  const canchaRef = useRef(null);
  const arrastreRef = useRef(null);
  const huboArrastreRef = useRef(false);

  const puntoDesde = useCallback((e) => {
    const rect = canchaRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return espejar(
      { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) },
      invertida
    );
  }, [invertida]);

  const tomar = useCallback((e, pos) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrastreRef.current = { clave: String(pos.id_jugador), pointerId: e.pointerId };
    huboArrastreRef.current = false;
    onSeleccionar?.(String(pos.id_jugador));
  }, [onSeleccionar]);

  const mover = useCallback((e) => {
    const a = arrastreRef.current;
    if (!a || e.pointerId !== a.pointerId) return;
    const p = puntoDesde(e);
    if (!p) return;
    huboArrastreRef.current = true;
    onMover?.(a.clave, p.x, p.y, { arrastrando: true });
  }, [onMover, puntoDesde]);

  const soltar = useCallback((e) => {
    const a = arrastreRef.current;
    arrastreRef.current = null;
    if (!a || !huboArrastreRef.current) return;
    const p = puntoDesde(e);
    /* Sólo al soltar se registra el punto: mientras arrastrás no queremos
       cien muestras del mismo movimiento. */
    if (p) onMover?.(a.clave, p.x, p.y, { arrastrando: false, soltado: true });
  }, [onMover, puntoDesde]);

  const tocar = useCallback((e) => {
    if (huboArrastreRef.current) { huboArrastreRef.current = false; return; }
    const p = puntoDesde(e);
    if (!p) return;
    if (modo === 'mover' && seleccionada) {
      /* Con una ficha elegida, tocar la cancha la manda ahí. En una tablet
         apoyada en el banco es más preciso que arrastrar con el dedo. */
      onMover?.(seleccionada, p.x, p.y, { soltado: true });
      return;
    }
    if (modo === 'marcar') onTocarCancha?.(p);
  }, [modo, seleccionada, onMover, onTocarCancha, puntoDesde]);

  const roles = useMemo(() => {
    const m = {};
    (linea?.idsDefensores || []).forEach(id => { m[id] = 'defensor'; });
    (linea?.idsAtacantes || []).forEach(id => { m[id] = 'atacante'; });
    return m;
  }, [linea]);

  const { fichas, balon } = useMemo(() => ({
    /* Rivales primero para que las nuestras queden encima al superponerse. */
    fichas: [
      ...posiciones.filter(p => p.equipo === 'Rival' && p.id_jugador !== BALON_ID),
      ...posiciones.filter(p => p.equipo !== 'Rival' && p.id_jugador !== BALON_ID),
    ],
    balon: posiciones.find(p => p.id_jugador === BALON_ID) || null,
  }), [posiciones]);

  const xLinea = balon ? espejar(balon, invertida).x : null;
  const arrastrable = modo === 'mover';

  return (
    /* La cancha mantiene la proporción real 40 × 20. Se centra en el hueco
       que le den, sin deformarse. */
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
      <div
        ref={canchaRef}
        onPointerMove={arrastrable ? mover : undefined}
        onPointerUp={arrastrable ? soltar : undefined}
        onPointerCancel={arrastrable ? soltar : undefined}
        onClick={tocar}
        className="pitch-container"
        style={{
          position: 'relative',
          aspectRatio: '2 / 1',
          width: '100%',
          maxWidth: 'min(100%, calc((100% ) * 1))',
          maxHeight: '100%',
          background: '#080808',
          backgroundImage: 'radial-gradient(#1a1a1a 1px, transparent 1px)',
          backgroundSize: '15px 15px',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'var(--border)',
          touchAction: 'none',
          overflow: 'hidden',
          cursor: modo === 'marcar' ? 'crosshair' : seleccionada ? 'crosshair' : 'default',
        }}
      >
        {/* Flecha de ataque al fondo, como en el tracker */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '9rem', opacity: 0.05, pointerEvents: 'none' }}>
          {invertida ? '⬅️' : '➡️'}
        </div>

        {/* Medio campo y círculo central */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', backgroundColor: LINEA, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: '15%', height: '30%', border: `1px solid ${LINEA}`, borderRadius: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

        {/* Las dos áreas de 6 metros */}
        <div style={{ position: 'absolute', left: 0, top: '25%', bottom: '25%', width: '15%', border: `1px solid ${LINEA}`, borderLeft: 'none', borderRadius: '0 50% 50% 0', pointerEvents: 'none', backgroundColor: invertida ? 'rgba(0,255,136,0.05)' : 'transparent' }} />
        <div style={{ position: 'absolute', right: 0, top: '25%', bottom: '25%', width: '15%', border: `1px solid ${LINEA}`, borderRight: 'none', borderRadius: '50% 0 0 50%', pointerEvents: 'none', backgroundColor: invertida ? 'transparent' : 'rgba(0,255,136,0.05)' }} />

        {/* GRILLA DE LECTURA: 4 zonas × 3 carriles */}
        {mostrarZonas && (
          <>
            {[25, 50, 75].map(x => (
              <div key={`z${x}`} style={{ position: 'absolute', left: `${x}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${PUNTEADO}`, pointerEvents: 'none' }} />
            ))}
            {[100 / 3, 200 / 3].map(y => (
              <div key={`c${y}`} style={{ position: 'absolute', top: `${y}%`, left: 0, right: 0, borderTop: `1px dashed ${PUNTEADO}`, pointerEvents: 'none' }} />
            ))}
            {CELDAS.map(celda => {
              /* La etiqueta se dibuja en el centro de la celda, espejada
                 igual que todo lo demás: Z1 siempre queda en nuestro arco. */
              const centro = espejar({ x: (celda.x0 + celda.x1) / 2, y: (celda.y0 + celda.y1) / 2 }, invertida);
              return (
                <div key={celda.etiqueta} style={{
                  position: 'absolute', left: `${centro.x}%`, top: `${centro.y}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: '0.55rem', fontWeight: 900, letterSpacing: '1px',
                  color: 'rgba(255,255,255,0.13)', pointerEvents: 'none', userSelect: 'none',
                }}>
                  {celda.etiqueta}
                </div>
              );
            })}
          </>
        )}

        {/* LA LÍNEA DE LA PELOTA. Lo sombreado es lo que queda entre la
            pelota y nuestro arco: ahí se cuentan los que están cubriendo. */}
        {mostrarLinea && xLinea != null && (
          <>
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: invertida ? `${xLinea}%` : 0,
              width: invertida ? `${100 - xLinea}%` : `${xLinea}%`,
              background: linea?.critico ? 'rgba(239,68,68,0.17)' : 'rgba(34,211,238,0.10)',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: `${xLinea}%`, top: 0, bottom: 0, width: '2px',
              background: linea?.critico ? ROJO : '#22d3ee',
              opacity: 0.75, pointerEvents: 'none',
            }} />
          </>
        )}

        {children}

        {fichas.map(p => (
          <Ficha key={`f-${p.equipo}-${p.id_jugador}`} pos={p} invertida={invertida}
                 seleccionada={seleccionada === String(p.id_jugador)}
                 rol={roles[String(p.id_jugador)]}
                 arrastrable={arrastrable} onTomar={tomar} tam={tamFicha} etiquetas={etiquetas} />
        ))}
        {balon && (
          <Ficha pos={balon} invertida={invertida}
                 seleccionada={seleccionada === BALON_ID}
                 arrastrable={arrastrable} onTomar={tomar} tam={tamFicha} etiquetas={etiquetas} />
        )}

        <div style={{
          position: 'absolute', top: '4px', [invertida ? 'left' : 'right']: '8px',
          fontSize: '0.58rem', color: '#2f6b4f', fontWeight: 900, letterSpacing: '1px', pointerEvents: 'none',
        }}>
          {invertida ? '◀ ATACAMOS' : 'ATACAMOS ▶'}
        </div>
      </div>
    </div>
  );
}
