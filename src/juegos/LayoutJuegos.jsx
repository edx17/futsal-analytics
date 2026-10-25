import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accesosJuegos } from './accesos';
import './juegos.css';

/* JUEGOS · EL MARCO
 *
 * Envuelve cada pantalla de juegos con el design system (`.jg`) y, en el
 * celular, la barra inferior fija con los accesos. En tablet y PC la barra no
 * aparece: la app mantiene su menú lateral (y el kiosco, su barra de arriba).
 */

const I = {
  juegos: <path d="M6 12h4m-2-2v4m7-1h.01M18 11h.01M17.3 5H6.7a4 4 0 0 0-3.96 3.43l-.73 5.13A3 3 0 0 0 7.2 16l1.3-1.3a2 2 0 0 1 1.42-.6h4.16a2 2 0 0 1 1.42.6L16.8 16a3 3 0 0 0 5.19-2.44l-.73-5.13A4 4 0 0 0 17.3 5z" />,
  sobres: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 8h16M12 11.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" /></>,
  vdraft: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" /></>,
  penales: <><path d="M3 20V6h18v14" /><path d="M3 6l3 3h12l3-3M6 9v11M18 9v11M9 9v11M12 9v11M15 9v11" opacity=".45" /><circle cx="12" cy="17" r="2" /></>,
  god: <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
  mysquad: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-1a7 7 0 0 1 14 0v1" /></>,
};

const Icono = ({ n }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>
);

export default function LayoutJuegos({ kiosco = false, children }) {
  const { perfil } = useAuth() || {};
  const esSuper = String(perfil?.rol || '').toLowerCase() === 'superuser';
  return (
    <div className="jg">
      <div className="jg-contenido">{children}</div>
      <nav className="jg-barra" aria-label="Juegos">
        {accesosJuegos({ kiosco, esSuper }).map(([icono, texto, ruta]) => (
          <NavLink key={ruta} to={ruta} end className={({ isActive }) => (isActive ? 'activo' : '')}>
            <Icono n={icono} />
            <span>{texto}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
