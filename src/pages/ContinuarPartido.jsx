import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function ContinuarPartido() {
  const navigate = useNavigate();
  const clubId = localStorage.getItem('club_id');

  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ESTADOS DE LOS FILTROS
  const [filtroCategoria, setFiltroCategoria] = useState('TODOS');
  const [filtroCompeticion, setFiltroCompeticion] = useState('TODAS');

  useEffect(() => {
    async function fetchPartidos() {
      if (!clubId) return;
      
      const { data, error } = await supabase
        .from('partidos')
        .select('*')
        .eq('club_id', clubId)
        .order('id', { ascending: false }); // Los más nuevos primero

      if (data) setPartidos(data);
      if (error) console.error("Error cargando historial de partidos:", error);
      
      setCargando(false);
    }
    fetchPartidos();
  }, [clubId]);

  // LÓGICA DE FILTRADO DINÁMICO
  const partidosFiltrados = useMemo(() => {
    return partidos.filter(p => {
      const cumpleCategoria = filtroCategoria === 'TODOS' || p.categoria === filtroCategoria;
      const cumpleCompeticion = filtroCompeticion === 'TODAS' || p.competicion === filtroCompeticion;
      return cumpleCategoria && cumpleCompeticion;
    });
  }, [partidos, filtroCategoria, filtroCompeticion]);

  const reanudarPartido = (partido) => {
    navigate('/toma-datos', { state: { partido } });
  };

  if (!clubId) {
    return <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '50px' }}>Debes configurar tu club primero.</div>;
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>CONTINUAR PARTIDO (TRACKING)</div>
      </div>

      <div className="bento-card" style={{ marginBottom: '20px' }}>
        <div className="stat-label" style={{ marginBottom: '15px' }}>FILTROS DE BÚSQUEDA</div>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 800 }}>CATEGORÍA</div>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={inputStyle}>
              <option value="TODOS">TODAS LAS CATEGORÍAS</option>
              <option value="Primera">Primera</option>
              <option value="Tercera">Tercera</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '5px', fontWeight: 800 }}>COMPETICIÓN</div>
            <select value={filtroCompeticion} onChange={(e) => setFiltroCompeticion(e.target.value)} style={inputStyle}>
              <option value="TODAS">TODAS LAS COMPETICIONES</option>
              <option value="AMISTOSO">AMISTOSO</option>
              <option value="TORNEO">TORNEO</option>
              <option value="PLAYOFF">PLAYOFF</option>
              <option value="COPA ARGENTINA">COPA ARGENTINA</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bento-card">
        <div className="stat-label" style={{ marginBottom: '20px' }}>HISTORIAL DE PARTIDOS ({partidosFiltrados.length})</div>
        
        {cargando ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>Cargando historial...</div>
        ) : partidosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
            No se encontraron partidos con estos filtros.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {partidosFiltrados.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#111', border: '1px solid #333', borderRadius: '6px' }}>
                <div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                    <span style={{ background: '#222', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                      {p.competicion}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                      {p.categoria?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#fff' }}>
                    vs {p.rival.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '5px' }}>
                    📅 {p.fecha} | 🕒 {p.horario} | 📍 {p.condicion}
                  </div>
                </div>
                
                <button 
                  onClick={() => reanudarPartido(p)} 
                  className="btn-action" 
                  style={{ padding: '10px 20px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span>▶️</span> CONTINUAR
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

const inputStyle = { width: '100%', background: '#000', border: '1px solid #333', color: '#fff', padding: '10px', borderRadius: '4px', outline: 'none' };

export default ContinuarPartido;