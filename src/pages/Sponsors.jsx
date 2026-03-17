import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function Sponsors() {
  const clubId = localStorage.getItem('club_id');
  const [sponsors, setSponsors] = useState([]);

  useEffect(() => {
    async function fetchSponsors() {
      const { data } = await supabase.from('sponsors').select('*').eq('club_id', clubId);
      setSponsors(data || []);
    }
    fetchSponsors();
  }, []);

  return (
    <div className="bento-card">
      <div className="stat-label" style={{marginBottom: '20px'}}>🤝 Alianzas y Sponsors</div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px'}}>
        {sponsors.map(s => (
          <div key={s.id} style={{background: '#000', padding: '20px', borderRadius: '8px', border: '1px solid #333'}}>
            <h3 style={{margin: '0 0 10px 0', color: 'var(--accent)'}}>{s.nombre.toUpperCase()}</h3>
            <div style={{fontSize: '0.8rem', color: 'var(--text-dim)'}}>Aporte: <strong>${s.monto_aporte}</strong> ({s.periodicidad})</div>
            <div style={{fontSize: '0.7rem', marginTop: '10px'}}>Estado: <span style={{color: '#00ff88'}}>{s.estado.toUpperCase()}</span></div>
            <div style={{fontSize: '0.7rem', color: '#888'}}>Vence: {s.fecha_vencimiento || 'Sin fecha'}</div>
          </div>
        ))}
        <button className="btn-secondary" style={{borderStyle: 'dashed', height: '120px'}}>+ AGREGAR SPONSOR</button>
      </div>
    </div>
  );
}
export default Sponsors;