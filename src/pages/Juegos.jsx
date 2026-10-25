import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* JUEGOS: la puerta de entrada a todos los juegos, un botón grande cada uno.
 *   staff (/juegos): MySquad, Sobres, V-Draft y Penales;
 *   kiosco (/kiosco/juegos): Sobres, V-Draft y Penales (MySquad es del CT).
 * Las imágenes son cuadros de las cinemáticas (public/juegos/) y el fondo de los penales.
 */

const JUEGOS = [
  { id: 'mysquad', titulo: 'MYSQUAD', bajada: 'Armá el quinteto ideal, confirmá los premios de la semana y mirá las cartas del plantel.',
    imagen: '/juegos/mysquad.jpg', acento: '#00ff88', soloStaff: true },
  { id: 'sobres', titulo: 'SOBRES', bajada: 'Abrí tu sobre de hoy, juntá las cartas del club y completá el álbum.',
    imagen: '/juegos/sobres.jpg', acento: '#fbbf24' },
  { id: 'vdraft', titulo: 'V-DRAFT', bajada: 'Armá tu equipo carta por carta y salí campeón contra los equipos de la liga.',
    imagen: '/juegos/vdraft.jpg', acento: '#38bdf8', sinSuperusuario: true },
  { id: 'penales', titulo: 'PENALES', bajada: 'Una tanda contra el arquero: pateá al ángulo y adiviná el lado para atajar.',
    imagen: '/penales/fondo.webp', acento: '#f97316', nuevo: true },
];

export default function Juegos({ kiosco = false }) {
  const navigate = useNavigate();
  const { perfil } = useAuth() || {};
  const esSuper = String(perfil?.rol || '').toLowerCase() === 'superuser';
  const lista = JUEGOS.filter((j) => (!j.soloStaff || !kiosco) && (!j.sinSuperusuario || kiosco || !esSuper));
  const ir = (id) => navigate(kiosco ? `/kiosco/${id}` : `/${id}`);

  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '80px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' }}>VIRTUAL.CLUB</div>
      <h1 style={{ margin: '4px 0 16px', fontSize: '1.6rem', fontWeight: 900, color: 'var(--text)' }}>Juegos</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        {lista.map((j) => (
          <button key={j.id} onClick={() => ir(j.id)} className="juegos-tarjeta"
            style={{
              position: 'relative', minHeight: '190px', padding: 0, border: `1px solid ${j.acento}55`, borderRadius: '16px',
              overflow: 'hidden', cursor: 'pointer', textAlign: 'left', color: '#fff',
              background: `#000 url(${j.imagen}) center / cover no-repeat`,
              boxShadow: `0 10px 28px rgba(0,0,0,.45), inset 0 0 0 1px ${j.acento}22`,
            }}>
            <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.05) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,.88) 100%)' }} />
            {j.nuevo && (
              <span style={{ position: 'absolute', top: 12, right: 12, padding: '4px 9px', borderRadius: '999px', background: j.acento, color: '#120800', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '.08em' }}>NUEVO</span>
            )}
            <span style={{ position: 'absolute', left: 18, right: 18, bottom: 16, display: 'block' }}>
              <span style={{ display: 'block', fontSize: '1.7rem', fontWeight: 900, letterSpacing: '.04em', color: j.acento, textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>{j.titulo}</span>
              <span style={{ display: 'block', fontSize: '0.8rem', lineHeight: 1.35, color: 'rgba(255,255,255,.85)', marginTop: 4 }}>{j.bajada}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
