import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function ScoutingRivales() {
  const clubId = localStorage.getItem('club_id');
  const [rivales, setRivales] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  
  const estadoInicial = { nombre: '', escudo: '', sistema_tactico: '3-1', jugadores_claves: '', notas: '' };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    if (clubId) fetchRivales();
  }, [clubId]);

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  const handleGuardar = async () => {
    if (!formData.nombre) return alert("El nombre del rival es obligatorio.");
    
    // Armamos el paquete de datos eliminando el ID si es nuevo
    const payload = { 
      nombre: formData.nombre,
      escudo: formData.escudo,
      sistema_tactico: formData.sistema_tactico,
      jugadores_claves: formData.jugadores_claves,
      notas: formData.notas,
      club_id: clubId 
    };

    if (formData.id) {
      // Si estamos editando
      const { error } = await supabase.from('rivales').update(payload).eq('id', formData.id);
      if (error) return alert("Error al editar en Supabase: " + error.message);
    } else {
      // Si es un rival nuevo
      const { error } = await supabase.from('rivales').insert([payload]);
      if (error) return alert("Error al guardar en Supabase: " + error.message);
    }
    
    alert("¡Rival guardado con éxito!");
    setMostrarModal(false);
    fetchRivales();
  };

  const abrirEdicion = (rival) => {
    setFormData(rival);
    setMostrarModal(true);
  };

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div className="stat-label" style={{ color: 'var(--text-dim)' }}>DEPARTAMENTO DE ANÁLISIS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>SCOUTING RIVALES</div>
        </div>
        <button onClick={() => { setFormData(estadoInicial); setMostrarModal(true); }} className="btn-action" style={{ background: '#00ff88', color: '#000', fontSize: '0.8rem' }}>+ NUEVO RIVAL</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
        {rivales.map(rival => (
          <div key={rival.id} onClick={() => abrirEdicion(rival)} className="bento-card" style={{ cursor: 'pointer', transition: '0.2s', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#222', border: '1px solid #444', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                {rival.escudo ? <img src={rival.escudo} alt="Escudo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.6rem', color: '#555', fontWeight: 800 }}>FOTO</span>}
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{rival.nombre.toUpperCase()}</div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #333', paddingTop: '10px', fontSize: '0.8rem' }}>
              <div><span style={{ color: 'var(--text-dim)' }}>Sistema Frecuente:</span> <strong style={{ color: 'var(--accent)' }}>{rival.sistema_tactico || 'N/A'}</strong></div>
            </div>
            
            {rival.jugadores_claves && (
              <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#ccc', background: '#111', padding: '8px', borderRadius: '4px', borderLeft: '2px solid #ef4444' }}>
                <strong style={{ color: '#ef4444' }}>ATENCIÓN:</strong> {rival.jugadores_claves}
              </div>
            )}
          </div>
        ))}
        {rivales.length === 0 && <p style={{ color: 'var(--text-dim)', gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>No hay rivales cargados. Agregá uno para empezar a armar tu torneo.</p>}
      </div>

      {mostrarModal && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div className="stat-label" style={{ color: '#fff' }}>{formData.id ? 'EDITAR INFORME SCOUTING' : 'NUEVO RIVAL'}</div>
              <button onClick={() => setMostrarModal(false)} className="close-btn">×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div><div className="section-title">NOMBRE DEL RIVAL</div><input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Boca Juniors" /></div>
              <div><div className="section-title">SISTEMA TÁCTICO BASE</div>
                <select value={formData.sistema_tactico} onChange={e => setFormData({...formData, sistema_tactico: e.target.value})} style={inputIndustrial}>
                  <option value="3-1 Clásico">3-1 Clásico</option><option value="4-0 Universal">4-0 Universal</option>
                  <option value="Arquero Jugador">Arquero Jugador Frecuente</option><option value="Desconocido">Desconocido</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">URL DEL ESCUDO (Opcional)</div><input type="text" value={formData.escudo} onChange={e => setFormData({...formData, escudo: e.target.value})} style={inputIndustrial} placeholder="https://..." /></div>
            
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title" style={{ color: '#ef4444' }}>JUGADORES CLAVE A MARCAR</div>
              <input type="text" value={formData.jugadores_claves} onChange={e => setFormData({...formData, jugadores_claves: e.target.value})} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Ej: El 10 es zurdo, patea fuerte." />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <div className="section-title">NOTAS DEL CUERPO TÉCNICO (PELOTA PARADA, DEFENSAS)</div>
              <textarea value={formData.notas} onChange={e => setFormData({...formData, notas: e.target.value})} style={{...inputIndustrial, height: '100px', resize: 'none'}} placeholder="Ej: En los córners defienden en zona mixta..."></textarea>
            </div>

            <button onClick={handleGuardar} className="btn-action" style={{ width: '100%', padding: '15px', fontSize: '1rem' }}>GUARDAR INFORME EN LA BASE</button>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); max-height: 90vh; overflow-y: auto; }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; }
        .close-btn { background: transparent; border: none; color: #fff; font-size: 1.8rem; cursor: pointer; line-height: 1; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', fontFamily: 'JetBrains Mono' };

export default ScoutingRivales;