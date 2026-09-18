import React from 'react';
import VisorPlaca from './VisorPlaca';

/* EL MISMO OVERLAY PARA TODAS LAS PLACAS
 *
 * Cinco pantallas repetían este `position:fixed` con su propio z-index, su
 * propio botón de cerrar y su propio padding. Ahora es uno solo: la pantalla
 * pide la placa y no se entera de cómo se muestra.
 */
export default function ModalPlaca({ abierto, onCerrar, nombreArchivo, formatoInicial, children }) {
  if (!abierto) return null;

  return (
    <div style={fondo} onClick={(e) => { if (e.target === e.currentTarget) onCerrar?.(); }}>
      <VisorPlaca
        nombreArchivo={nombreArchivo}
        formatoInicial={formatoInicial}
        onCerrar={onCerrar}
      >
        {children}
      </VisorPlaca>
    </div>
  );
}

const fondo = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.95)', overflowY: 'auto',
  padding: '20px 12px 60px',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
};
