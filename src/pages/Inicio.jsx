import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function Inicio() {
  const navigate = useNavigate();
  const clubId = localStorage.getItem('club_id');
  const nombreClub = localStorage.getItem('mi_club') || 'MI CLUB';

  const [ultimoPartido, setUltimoPartido] = useState(null);
  const [estadisticas, setEstadisticas] = useState({ jugados: 0, victorias: 0, plantel: 0 });
  const [cargando, setCargando] = useState(true);

 useEffect(() => {
    async function cargarDashboard() {
      // SI NO HAY CLUB, FRENAMOS LA CARGA Y AVISAMOS
      if (!clubId) {
        setCargando(false);
        return;
      }

      // Traer el último partido jugado
      const { data: partidos } = await supabase
        .from('partidos')
        .select('*')
        .eq('club_id', clubId)
        .order('fecha', { ascending: false })
        .limit(1);

      if (partidos && partidos.length > 0) {
        setUltimoPartido(partidos[0]);
      }

      // Traer stats rápidas
      const { count: countJugadores } = await supabase.from('jugadores').select('*', { count: 'exact', head: true }).eq('club_id', clubId);
      const { count: countPartidos } = await supabase.from('partidos').select('*', { count: 'exact', head: true }).eq('club_id', clubId);

      setEstadisticas({
        jugados: countPartidos || 0,
        plantel: countJugadores || 0
      });
      setCargando(false);
    }
    cargarDashboard();
  }, [clubId]);

  // --- VISTA ALTERNATIVA: SI NO TIENE CLUB CONFIGURADO ---
  if (!cargando && !clubId) {
    return (
      <div style={{ animation: 'fadeIn 0.3s', padding: '50px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🏟️</div>
        <h2 style={{ color: 'var(--accent)', fontWeight: 900 }}>¡BIENVENIDO A VIRTUAL.STATS!</h2>
        <p style={{ color: 'var(--text-dim)', marginBottom: '30px', lineHeight: '1.6' }}>
          Para empezar a registrar entrenamientos, convocatorias y estadísticas, primero necesitamos crear el perfil de tu equipo.
        </p>
        <button 
          onClick={() => navigate('/configuracion')} 
          className="btn-action" 
          style={{ width: '100%', padding: '20px', fontSize: '1.1rem' }}
        >
          CONFIGURAR MI CLUB AHORA
        </button>
      </div>
    );
}   

  return (
    <div style={{ animation: 'fadeIn 0.3s', paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* HEADER DEL CLUB */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#222', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: '1.5rem' }}>
          {nombreClub.substring(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="stat-label" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>CENTRO DE MANDO</div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase' }}>{nombreClub}</h1>
        </div>
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '50px' }}>CARGANDO DATOS DEL CLUB...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          {/* TARJETA 1: ACCIÓN RÁPIDA (NUEVO PARTIDO) */}
          <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid var(--accent)', background: 'linear-gradient(180deg, rgba(0,255,136,0.05) 0%, rgba(0,0,0,0) 100%)' }} onClick={() => navigate('/nuevo-partido')}>
            <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚡</div>
            <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>NUEVO PARTIDO</div>
            <p style={{ color: 'var(--text-dim)', marginTop: '10px', fontSize: '0.85rem' }}>Crear convocatoria e iniciar toma de datos en vivo.</p>
          </div>

          {/* TARJETA 2: ÚLTIMO PARTIDO */}
          <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="stat-label" style={{ marginBottom: '15px' }}>ÚLTIMO REGISTRO</div>
            {ultimoPartido ? (
              <div style={{ background: '#111', padding: '20px', borderRadius: '6px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{ultimoPartido.fecha}</span>
                  <span style={{ background: '#222', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>{ultimoPartido.competicion}</span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', margin: '15px 0' }}>
                  vs {ultimoPartido.rival.toUpperCase()}
                </div>
                <button onClick={() => navigate('/resumen')} className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>VER REPORTE ANALÍTICO</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay partidos registrados aún.</div>
            )}
          </div>

          {/* TARJETA 3: ESTADO DE LA BASE */}
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>{estadisticas.plantel}</div>
              <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>JUGADORES EN PLANTEL</div>
            </div>
            <div style={{ textAlign: 'center', padding: '20px', background: '#111', borderRadius: '6px', border: '1px solid #333' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>{estadisticas.jugados}</div>
              <div className="stat-label" style={{ fontSize: '0.65rem', marginTop: '5px' }}>PARTIDOS TRACKEADOS</div>
            </div>
            <button onClick={() => navigate('/temporada')} className="btn-action" style={{ gridColumn: 'span 2', padding: '15px', fontSize: '0.85rem' }}>VER RENDIMIENTO GLOBAL DE TEMPORADA</button>
          </div>

        </div>
      )}
    </div>
  );
}

export default Inicio;