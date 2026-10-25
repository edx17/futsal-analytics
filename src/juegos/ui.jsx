import React, { useEffect, useState } from 'react';
import { msHastaMedianocheAR, formatoCuenta } from './tiempo';

/* JUEGOS · COMPONENTES BASE (estilos en juegos.css) */

/** Botón de juego. variante: primary | oro | secondary | ghost. */
export function GameButton({ variante = 'primary', grande = false, ancho = false, className = '', children, ...resto }) {
  return (
    <button type="button" className={`jg-btn jg-btn-${variante}${grande ? ' jg-btn-grande' : ''}${ancho ? ' jg-btn-ancho' : ''} ${className}`} {...resto}>
      {children}
    </button>
  );
}

export function Panel({ titulo, className = '', children, ...resto }) {
  return (
    <section className={`jg-panel ${className}`} {...resto}>
      {titulo && <h2 className="jg-panel-titulo">{titulo}</h2>}
      {children}
    </section>
  );
}

/** Etiqueta chica: "Gratis hoy", "Recompensa disponible", "Nuevo". tono: neon | oro | naranja | (neutro). */
export function Badge({ tono, latido = false, className = '', children, ...resto }) {
  return <span className={`jg-badge${tono ? ` jg-badge-${tono}` : ''}${latido ? ' jg-badge-latido' : ''} ${className}`} {...resto}>{children}</span>;
}

/** Barra de progreso (0 a 1). */
export function ProgressBar({ valor = 0, tono, alto, className = '', ...resto }) {
  const v = Math.max(0, Math.min(1, Number(valor) || 0));
  return (
    <div className={`jg-progreso${tono ? ` jg-progreso-${tono}` : ''} ${className}`} style={alto ? { height: alto } : undefined}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} {...resto}>
      <i style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Cuenta regresiva en vivo. Por defecto, hasta la medianoche de Argentina (cuando se renuevan los sobres). */
export function Countdown({ hasta, alTerminar, className = '' }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = hasta ? Math.max(0, +new Date(hasta) - ahora) : msHastaMedianocheAR(ahora);
  useEffect(() => { if (hasta && ms === 0) alTerminar?.(); }, [hasta, ms, alTerminar]);
  return <span className={`jg-countdown ${className}`}>{formatoCuenta(ms)}</span>;
}

/** BottomSheet en el celular, panel lateral en tablet/PC. */
export function Hoja({ abierta, titulo, onCerrar, children }) {
  useEffect(() => {
    if (!abierta) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') onCerrar?.(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta, onCerrar]);
  if (!abierta) return null;
  return (
    <>
      <div className="jg-hoja-fondo" onClick={onCerrar} />
      <aside className="jg-hoja" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="jg-hoja-tirador" />
        <div className="jg-hoja-cab">
          <b style={{ fontSize: 15, letterSpacing: '.06em' }}>{titulo}</b>
          <GameButton variante="ghost" onClick={onCerrar} aria-label="Cerrar">✕</GameButton>
        </div>
        <div className="jg-hoja-cuerpo">{children}</div>
      </aside>
    </>
  );
}
