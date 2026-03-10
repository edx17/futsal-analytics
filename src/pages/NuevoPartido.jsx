import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function NuevoPartido() {
  const navigate = useNavigate();
  const clubId = localStorage.getItem('club_id');

  const [rivalesBD, setRivalesBD] = useState([]);
  const [torneosBD, setTorneosBD] = useState([]);
  
  // Estado extra para mostrar la tarjeta de scouting en vivo
  const [rivalSeleccionado, setRivalSeleccionado] = useState(null);

  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    horario: new Date().toTimeString().substring(0, 5),
    lugar: '',
    torneo_id: '', 
    categoria: '', 
    jornada: '',
    condicion: 'Local',
    rival_id: ''
  });

  useEffect(() => {
    async function fetchDatosRelacionales() {
      if (!clubId) return;
      
      const { data: rivales } = await supabase
        .from('rivales')
        .select('*')
        .eq('club_id', clubId)
        .order('nombre', { ascending: true });
      if (rivales) setRivalesBD(rivales);

      const { data: torneos } = await supabase
        .from('torneos')
        .select('*')
        .eq('club_id', clubId)
        .order('nombre', { ascending: true });
      if (torneos) setTorneosBD(torneos);
    }
    fetchDatosRelacionales();
  }, [clubId]);

  const handleSeleccionarRival = (e) => {
    const idSeleccionado = e.target.value;
    const rivalObj = rivalesBD.find(r => r.id === idSeleccionado);
    setFormData({ ...formData, rival_id: idSeleccionado });
    setRivalSeleccionado(rivalObj || null); // Guardamos todo el objeto para mostrar su info táctica
  };

  const handleIniciarPartido = async () => {
    if (!formData.rival_id) return alert("Por favor, seleccioná un rival.");
    if (!formData.torneo_id) return alert("Por favor, seleccioná a qué torneo pertenece.");

    // PAYLOAD LIMPIO: Solo mandamos los IDs relacionales y los metadatos crudos del partido.
    // Ya no mandamos nombre de rival ni escudos sueltos.
    const payload = {
      club_id: clubId,
      torneo_id: formData.torneo_id,
      rival_id: formData.rival_id, 
      fecha: formData.fecha,
      horario: formData.horario,
      lugar: formData.lugar,
      jornada: formData.jornada,
      categoria: formData.categoria,
      competicion: 'TORNEO', 
      condicion: formData.condicion,
      estado: 'Pendiente', // Nace como pendiente hasta que termine el tracking
      goles_propios: 0,
      goles_rival: 0
    };

    const { data, error } = await supabase
      .from('partidos')
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert("Error al crear el partido: " + error.message);
    } else {
      navigate('/toma-datos', { state: { partido: data } });
    }
  };

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club primero.</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '600px', margin: '0 auto', paddingBottom: '80px' }}>
      
      <div style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ color: 'var(--text-dim)' }}>CONFIGURACIÓN INICIAL</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>NUEVO PARTIDO</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* FILA 1: CONTEXTO DEL TORNEO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', paddingBottom: '15px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ gridColumn: 'span 2' }}>
            <div className="section-title">¿A QUÉ TORNEO PERTENECE?</div>
            <select 
              value={formData.torneo_id} 
              onChange={e => {
                const idTorneo = e.target.value;
                const torneoObj = torneosBD.find(t => t.id === idTorneo);
                setFormData(prev => ({
                  ...prev, 
                  torneo_id: idTorneo,
                  categoria: torneoObj ? torneoObj.categoria : ''
                }));
              }} 
              style={{ ...inputIndustrial, borderColor: 'var(--accent)' }}
            >
              <option value="">Seleccioná un Torneo...</option>
              {torneosBD.map(t => (
                <option key={t.id} value={t.id}>{t.nombre.toUpperCase()} ({t.categoria})</option>
              ))}
            </select>
          </div>
          <div>
            <div className="section-title">JORNADA / FASE</div>
            <input type="text" value={formData.jornada} onChange={e => setFormData({...formData, jornada: e.target.value})} style={inputIndustrial} placeholder="Ej: Fecha 5 o Final" />
          </div>
          <div>
            <div className="section-title">CATEGORÍA (Auto)</div>
            <input type="text" value={formData.categoria} readOnly placeholder="Se autocompleta..." style={{ ...inputIndustrial, background: '#111', color: 'var(--text-dim)', cursor: 'not-allowed', borderColor: '#222' }} />
          </div>
        </div>

        {/* FILA 2: FECHA, HORA Y LUGAR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div><div className="section-title">FECHA</div><input type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} style={inputIndustrial} /></div>
          <div><div className="section-title">HORARIO</div><input type="time" value={formData.horario} onChange={e => setFormData({...formData, horario: e.target.value})} style={inputIndustrial} /></div>
          <div><div className="section-title">LUGAR / ESTADIO</div><input type="text" value={formData.lugar} onChange={e => setFormData({...formData, lugar: e.target.value})} style={inputIndustrial} placeholder="Ej: Microestadio..." /></div>
          <div>
            <div className="section-title">CONDICIÓN</div>
            <select value={formData.condicion} onChange={e => setFormData({...formData, condicion: e.target.value})} style={inputIndustrial}>
              <option value="Local">Local</option><option value="Visitante">Visitante</option><option value="Neutral">Neutral</option>
            </select>
          </div>
        </div>

        {/* FILA 3: RIVAL Y SCOUTING EXPRESS */}
        <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '15px', borderRadius: '6px', border: '1px solid var(--accent)', marginTop: '10px' }}>
          <div className="section-title" style={{ color: 'var(--accent)' }}>SELECCIONAR RIVAL</div>
          <select value={formData.rival_id} onChange={handleSeleccionarRival} style={{ ...inputIndustrial, borderColor: 'var(--accent)', marginBottom: rivalSeleccionado ? '15px' : '0' }}>
            <option value="">Seleccione de la libreta de Scouting...</option>
            {rivalesBD.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
          </select>

          {/* TARJETA MAGICA DE SCOUTING VINCULADA */}
          {rivalSeleccionado && (
            <div style={{ animation: 'fadeIn 0.3s', background: '#000', padding: '15px', borderRadius: '4px', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>📋</span>
                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fff' }}>REPORTE RÁPIDO: {rivalSeleccionado.nombre.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><span style={{ color: 'var(--text-dim)' }}>Sistema Frecuente:</span> <strong style={{ color: 'var(--accent)' }}>{rivalSeleccionado.sistema_tactico || 'Sin datos'}</strong></div>
                {rivalSeleccionado.jugadores_claves && (
                  <div><span style={{ color: 'var(--text-dim)' }}>Claves:</span> <span style={{ color: '#ef4444', fontWeight: 700 }}>{rivalSeleccionado.jugadores_claves}</span></div>
                )}
                {rivalSeleccionado.notas && (
                  <div style={{ fontStyle: 'italic', color: '#ccc', marginTop: '5px' }}>"{rivalSeleccionado.notas}"</div>
                )}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleIniciarPartido} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.2rem', marginTop: '10px' }}>
          ⚡ INICIAR TOMA DE DATOS
        </button>

      </div>

      <style>{`
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; letter-spacing: 1px; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default NuevoPartido;