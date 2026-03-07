import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function NuevoPartido() {
  const navigate = useNavigate();
  const clubId = localStorage.getItem('club_id');

  const [rivalesBD, setRivalesBD] = useState([]);
  
  // Ponemos valores por defecto prácticos (fecha y hora actual)
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    horario: new Date().toTimeString().substring(0, 5),
    categoria: 'Primera',
    competicion: 'TORNEO',
    condicion: 'Local',
    rival_id: '',
    rival: '' // Mantenemos el nombre en texto para no romper pantallas viejas
  });

  // 1. TRAEMOS LOS RIVALES DEL SCOUTING
  useEffect(() => {
    async function fetchRivales() {
      if (!clubId) return;
      const { data } = await supabase
        .from('rivales')
        .select('*')
        .eq('club_id', clubId)
        .order('nombre', { ascending: true });
        
      if (data) setRivalesBD(data);
    }
    fetchRivales();
  }, [clubId]);

  // 2. CREAMOS EL PARTIDO Y VAMOS A LA TOMA DE DATOS
  const handleIniciarPartido = async () => {
    if (!formData.rival_id) {
      return alert("Por favor, seleccioná un rival de la lista.");
    }

    const payload = {
      club_id: clubId,
      fecha: formData.fecha,
      horario: formData.horario,
      categoria: formData.categoria,
      competicion: formData.competicion,
      condicion: formData.condicion,
      rival_id: formData.rival_id, 
      rival: formData.rival // Guardamos también el texto para la UI
    };

    // Insertamos y pedimos que nos devuelva el registro creado (.select().single())
    const { data, error } = await supabase
      .from('partidos')
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert("Error al crear el partido: " + error.message);
    } else {
      // Todo OK: Viajamos a la cancha (TomaDatos) pasándole este partido
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
        
        {/* FILA 1: FECHA Y HORA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <div className="section-title">FECHA</div>
            <input type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} style={inputIndustrial} />
          </div>
          <div>
            <div className="section-title">HORARIO</div>
            <input type="time" value={formData.horario} onChange={e => setFormData({...formData, horario: e.target.value})} style={inputIndustrial} />
          </div>
        </div>

        {/* FILA 2: RIVAL (EL CAMBIO PRINCIPAL) */}
        <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div className="section-title" style={{ color: 'var(--accent)' }}>SELECCIONAR RIVAL</div>
          <select 
            value={formData.rival_id} 
            onChange={(e) => {
              const idSeleccionado = e.target.value;
              const rivalObjeto = rivalesBD.find(r => r.id === idSeleccionado);
              setFormData({
                ...formData, 
                rival_id: idSeleccionado,
                rival: rivalObjeto ? rivalObjeto.nombre : ''
              });
            }} 
            style={{ ...inputIndustrial, borderColor: 'var(--accent)' }}
          >
            <option value="">Seleccione de la libreta de Scouting...</option>
            {rivalesBD.map(r => (
              <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>
            ))}
          </select>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '8px' }}>
            *Si el rival no está en la lista, agregalo primero en la sección "Rivales (Scouting)".
          </p>
        </div>

        {/* FILA 3: CONTEXTO DEL PARTIDO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
          <div>
            <div className="section-title">CATEGORÍA</div>
            <select value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} style={inputIndustrial}>
              <option value="Primera">Primera</option>
              <option value="Tercera">Tercera</option>
              <option value="Cuarta">Cuarta</option>
              <option value="Quinta">Quinta</option>
            </select>
          </div>
          <div>
            <div className="section-title">COMPETICIÓN</div>
            <select value={formData.competicion} onChange={e => setFormData({...formData, competicion: e.target.value})} style={inputIndustrial}>
              <option value="TORNEO">TORNEO</option>
              <option value="AMISTOSO">AMISTOSO</option>
              <option value="PLAYOFF">PLAYOFF</option>
              <option value="COPA">COPA ARG.</option>
            </select>
          </div>
          <div>
            <div className="section-title">CONDICIÓN</div>
            <select value={formData.condicion} onChange={e => setFormData({...formData, condicion: e.target.value})} style={inputIndustrial}>
              <option value="Local">Local</option>
              <option value="Visitante">Visitante</option>
              <option value="Neutral">Neutral</option>
            </select>
          </div>
        </div>

        <button onClick={handleIniciarPartido} className="btn-action" style={{ width: '100%', padding: '20px', fontSize: '1.2rem', marginTop: '10px' }}>
          ⚡ INICIAR TOMA DE DATOS
        </button>

      </div>

      <style>{`
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; letter-spacing: 1px; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', fontFamily: 'JetBrains Mono' };

export default NuevoPartido;