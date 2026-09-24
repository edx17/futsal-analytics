import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RUTA_KIOSCO } from '../utils/kiosco';

/* Barra fija arriba de cada pantalla del kiosco, para volver al menú del
   jugador. En el kiosco no hay menú lateral: sin esto, Partidos, Videos,
   Temporada y Stats no tenían salida más que el botón atrás del navegador.

   Wellness, Rendimiento y Libro táctico ya tienen su propio "Volver" (que en
   el kiosco también lleva al menú), así que ahí no se muestra: dos botones
   de volver uno arriba del otro confunden. */
const CON_VOLVER_PROPIO = ['/kiosco/wellness', '/kiosco/rendimiento', '/kiosco/libro-tactico'];

export default function BarraKiosco() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (CON_VOLVER_PROPIO.includes(pathname)) return null;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, padding: '10px 16px',
      background: 'var(--bg)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
    }}>
      <button
        onClick={() => navigate(RUTA_KIOSCO)}
        style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text)',
          padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer',
          minHeight: '40px',
        }}
      >
        ← MI MENÚ
      </button>
    </div>
  );
}
