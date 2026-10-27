import React from 'react';
import { useAuth } from '../context/AuthContext';

/* La barra de arriba de quien entra con Gmail (jugador vinculado o hincha):
   el club, quién es y SALIR. No hay menú de la app: sólo los juegos. */
export default function BarraCuentaJuego() {
  const { perfil, logout } = useAuth() || {};
  const c = perfil?.cuenta || {};
  return (
    <header className="jg-cuenta">
      {c.escudo_url
        ? <img src={c.escudo_url} alt="" width={30} height={30} className="jg-cuenta-escudo" />
        : <span className="jg-cuenta-escudo jg-cuenta-sigla">{(c.club_nombre || '?').slice(0, 2).toUpperCase()}</span>}
      <span className="jg-cuenta-texto">
        <b>{c.club_nombre || 'Juegos'}</b>
        <span>{c.tipo === 'hincha' ? `Hincha · ${c.nombre || ''}` : c.nombre}</span>
      </span>
      <button type="button" className="jg-cuenta-salir" onClick={logout}>SALIR</button>
    </header>
  );
}
