import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

function NuevoPartido() {
  const navigate = useNavigate();
  const clubId = localStorage.getItem('club_id');

  // DATOS RELACIONALES
  const [rivalesBD, setRivalesBD] = useState([]);
  const [torneosBD, setTorneosBD] = useState([]);
  const [jugadoresBD, setJugadoresBD] = useState([]);
  
  const [rivalSeleccionado, setRivalSeleccionado] = useState(null);

  // ESTADO DEL FORMULARIO
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    horario: new Date().toTimeString().substring(0, 5),
    lugar: '',
    torneo_id: '', 
    categoria: '', 
    jornada: '',
    condicion: 'Local',
    rival_id: '',
    competicion: '' // Ahora se llena solo al elegir el torneo
  });

  // ESTADOS DE CONVOCATORIA
  const [seleccion, setSeleccion] = useState({});
  const [filtroVerCategoria, setFiltroVerCategoria] = useState('TODOS');
  const [ordenCriterio, setOrdenCriterio] = useState('dorsal');
  const [ordenDireccion, setOrdenDireccion] = useState('asc');
  const [vistaJugadores, setVistaJugadores] = useState('lista');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchDatosRelacionales() {
      if (!clubId) return;
      
      const { data: rivales } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
      if (rivales) setRivalesBD(rivales);

      const { data: torneos } = await supabase.from('torneos').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
      if (torneos) setTorneosBD(torneos);

      const { data: jugadores } = await supabase.from('jugadores').select('*').eq('club_id', clubId);
      if (jugadores) setJugadoresBD(jugadores);
    }
    fetchDatosRelacionales();
  }, [clubId]);

  const handleSeleccionarRival = (e) => {
    const idSeleccionado = e.target.value;
    const rivalObj = rivalesBD.find(r => r.id === idSeleccionado);
    setFormData({ ...formData, rival_id: idSeleccionado });
    setRivalSeleccionado(rivalObj || null); 
  };

  const manejarTilde = (id, tipo) => {
    setSeleccion(prev => {
      const state = prev[id] || { convocado: false, titular: false };
      const newState = { ...state, [tipo]: !state[tipo] };
      
      if (tipo === 'titular' && newState.titular) newState.convocado = true;
      if (tipo === 'convocado' && !newState.convocado) {
        newState.titular = false;
      }
      return { ...prev, [id]: newState };
    });
  };

  // LÍMITES DINÁMICOS SEGÚN EL TIPO DE TORNEO HEREDADO
  const esAmistoso = formData.competicion.toLowerCase().includes('amistoso');
  const limiteConvocados = esAmistoso ? 16 : 14;
  const totalConvocados = jugadoresBD.filter(j => seleccion[j.id]?.convocado).length;
  const totalTitulares = jugadoresBD.filter(j => seleccion[j.id]?.titular).length;

  const handleIniciarPartido = async () => {
    if (isSubmitting) return;

    if (!formData.torneo_id) return alert("Por favor, seleccioná a qué torneo pertenece.");
    if (!formData.rival_id) return alert("Por favor, seleccioná un rival.");
    
    // VALIDACIONES DE PLANTEL
    if (totalConvocados === 0) return alert("ERROR: La convocatoria está vacía.");
    if (totalConvocados > limiteConvocados) return alert(`ERROR: Límite de convocados superado (${totalConvocados}/${limiteConvocados} para modalidad ${formData.competicion}).`);
    if (totalTitulares !== 5) return alert(`ERROR TÁCTICO: Hay ${totalTitulares} titulares marcados. Futsal requiere exactamente 5.`);

    setIsSubmitting(true);

    const seleccionados = jugadoresBD.filter(j => seleccion[j.id]?.convocado);
    const plantilla = seleccionados.map(j => ({ 
      id_jugador: j.id, 
      titular: seleccion[j.id]?.titular || false
    }));

    // PAYLOAD ENRIQUECIDO: Cruza la data de Torneos y Rivales automáticamente
    const payload = {
      club_id: clubId,
      torneo_id: formData.torneo_id,
      rival_id: formData.rival_id, 
      rival: rivalSeleccionado ? rivalSeleccionado.nombre : '', // Inyectado para retrocompatibilidad
      escudo_rival: rivalSeleccionado ? rivalSeleccionado.escudo : '', // Inyectado
      fecha: formData.fecha,
      horario: formData.horario,
      lugar: formData.lugar,
      jornada: formData.jornada,
      categoria: formData.categoria, // Viene del torneo
      competicion: formData.competicion, // Viene del tipo de torneo
      condicion: formData.condicion,
      estado: 'Pendiente', 
      goles_propios: 0,
      goles_rival: 0,
      plantilla: plantilla
    };

    const { data, error } = await supabase.from('partidos').insert([payload]).select().single();

    if (error) {
      alert("Error al crear el partido: " + error.message);
      setIsSubmitting(false);
    } else {
      const partidoParaTracker = { ...data, rivales: { nombre: rivalSeleccionado.nombre } };
      navigate('/toma-datos', { state: { partido: partidoParaTracker } });
    }
  };

  const alternarCriterio = () => {
    if (ordenCriterio === 'dorsal') setOrdenCriterio('nombre');
    else if (ordenCriterio === 'nombre') setOrdenCriterio('posicion');
    else setOrdenCriterio('dorsal');
  };

  const alternarDireccion = () => setOrdenDireccion(prev => prev === 'asc' ? 'desc' : 'asc');

  const getIconoCriterio = () => {
    if (ordenCriterio === 'dorsal') return '#️⃣';
    if (ordenCriterio === 'nombre') return '🔤';
    return '👕';
  };

  const categoriasDisponibles = useMemo(() => {
    const cats = new Set(jugadoresBD.map(j => j.categoria).filter(Boolean));
    return ['TODOS', ...Array.from(cats)];
  }, [jugadoresBD]);

  const jugadoresProcesados = useMemo(() => {
    let lista = jugadoresBD.filter(j => filtroVerCategoria === 'TODOS' ? true : j.categoria === filtroVerCategoria);
    
    return lista.sort((a, b) => {
      let resultado = 0;
      if (ordenCriterio === 'dorsal') {
        resultado = (a.dorsal || 0) - (b.dorsal || 0);
      } else if (ordenCriterio === 'nombre') {
        const nameA = a.apellido ? `${a.apellido} ${a.nombre}` : a.nombre;
        const nameB = b.apellido ? `${b.apellido} ${b.nombre}` : b.nombre;
        resultado = nameA.localeCompare(nameB);
      } else if (ordenCriterio === 'posicion') {
        resultado = (a.posicion || '').localeCompare(b.posicion || '');
      }
      return ordenDireccion === 'asc' ? resultado : -resultado;
    });
  }, [jugadoresBD, filtroVerCategoria, ordenCriterio, ordenDireccion]);

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club primero.</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      
      <div style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ color: 'var(--text-dim)' }}>CONFIGURACIÓN INICIAL</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>NUEVO PARTIDO</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
        
        {/* FILA 1: TORNEO COMO EJE CENTRAL */}
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
                  categoria: torneoObj ? torneoObj.categoria : '',
                  competicion: torneoObj ? (torneoObj.tipo || 'Oficial') : '' // MAGIA: Hereda el tipo automáticamente
                }));
                if (torneoObj && categoriasDisponibles.includes(torneoObj.categoria)) {
                  setFiltroVerCategoria(torneoObj.categoria); 
                }
              }} 
              style={{ ...inputIndustrial, borderColor: 'var(--accent)' }}
            >
              <option value="">Seleccioná un Torneo / Competición...</option>
              {torneosBD.map(t => (
                <option key={t.id} value={t.id}>{t.nombre.toUpperCase()} ({t.categoria}) - {t.tipo || 'Oficial'}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="section-title">JORNADA / FASE</div>
            <input type="text" value={formData.jornada} onChange={e => setFormData({...formData, jornada: e.target.value})} style={inputIndustrial} placeholder="Ej: Fecha 5" />
          </div>
          <div>
            <div className="section-title">CATEGORÍA (Autocompletado)</div>
            <input type="text" value={formData.categoria} readOnly style={{ ...inputIndustrial, background: '#111', color: 'var(--text-dim)' }} placeholder="Se llena solo..." />
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

        {/* FILA 3: RIVAL Y SCOUTING */}
        <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '15px', borderRadius: '6px', border: '1px solid var(--accent)', marginTop: '10px' }}>
          <div className="section-title" style={{ color: 'var(--accent)' }}>SELECCIONAR RIVAL</div>
          <select value={formData.rival_id} onChange={handleSeleccionarRival} style={{ ...inputIndustrial, borderColor: 'var(--accent)', marginBottom: rivalSeleccionado ? '15px' : '0' }}>
            <option value="">Seleccione de la libreta de Scouting...</option>
            {rivalesBD.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
          </select>

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
      </div>

      {/* BLOQUE DE CONVOCATORIA DIRECTO EN PANTALLA */}
      <div className="bento-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div className="stat-label">CONVOCATORIA Y SISTEMA INICIAL</div>
            <div style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '0.85rem' }}>
              <div style={{ color: totalConvocados > limiteConvocados ? '#ef4444' : 'var(--text-dim)', fontWeight: totalConvocados > limiteConvocados ? 'bold' : 'normal' }}>
                CONVOCADOS: <strong style={{ color: totalConvocados > limiteConvocados ? '#ef4444' : '#fff' }}>{totalConvocados} / {limiteConvocados}</strong>
                {formData.competicion && <span style={{fontSize: '0.6rem', marginLeft: '5px'}}>({formData.competicion.toUpperCase()})</span>}
              </div>
              <div style={{ color: totalTitulares !== 5 ? '#f97316' : 'var(--text-dim)', fontWeight: totalTitulares !== 5 ? 'bold' : 'normal' }}>
                TITULARES: <strong style={{ color: totalTitulares !== 5 ? '#f97316' : 'var(--accent)' }}>{totalTitulares} / 5</strong>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#000', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
              <button onClick={alternarCriterio} title="Cambiar criterio de orden" style={{ padding: '5px 10px', background: 'transparent', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', borderRight: '1px solid #333' }}>
                {getIconoCriterio()}
              </button>
              <button onClick={alternarDireccion} title="Invertir dirección" style={{ padding: '5px 10px', background: 'transparent', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                {ordenDireccion === 'asc' ? '⬇️' : '⬆️'}
              </button>
            </div>

            <select value={filtroVerCategoria} onChange={(e) => setFiltroVerCategoria(e.target.value)} style={{ padding: '5px', background: '#000', color: '#fff', border: '1px solid #333', borderRadius: '4px' }}>
              {categoriasDisponibles.map(cat => (
                <option key={cat} value={cat}>{cat.toUpperCase()}</option>
              ))}
            </select>

            <div style={{ display: 'flex', background: '#000', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
              <button onClick={() => setVistaJugadores('lista')} style={{ padding: '5px 10px', background: vistaJugadores === 'lista' ? '#333' : 'transparent', color: vistaJugadores === 'lista' ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>☰ LISTA</button>
              <button onClick={() => setVistaJugadores('grilla')} style={{ padding: '5px 10px', background: vistaJugadores === 'grilla' ? '#333' : 'transparent', color: vistaJugadores === 'grilla' ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>⊞ GRILLA</button>
            </div>
          </div>
        </div>

        {vistaJugadores === 'lista' && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th><th style={{ textAlign: 'left' }}>JUGADOR</th><th>POS</th>
                  <th>CONVOCAR</th><th>TITULAR</th>
                </tr>
              </thead>
              <tbody>
                {jugadoresProcesados.map((j) => {
                  const estado = seleccion[j.id] || { convocado: false, titular: false };
                  return (
                    <tr key={j.id} style={{ background: estado.titular ? 'rgba(0, 255, 136, 0.05)' : 'transparent' }}>
                      <td className="mono-accent" style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{j.dorsal || '-'}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>
                        {j.apellido ? <span style={{ fontWeight: 800 }}>{j.apellido.toUpperCase()} </span> : ''}
                        {j.nombre.toUpperCase()}
                      </td>
                      <td className="pos-label" style={{ fontSize: '0.7rem', color: '#888' }}>{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</td>
                      <td><input type="checkbox" checked={estado.convocado} onChange={() => manejarTilde(j.id, 'convocado')} style={{ transform: 'scale(1.3)', cursor: 'pointer' }} /></td>
                      <td><input type="checkbox" checked={estado.titular} onChange={() => manejarTilde(j.id, 'titular')} disabled={!estado.convocado} style={{ transform: 'scale(1.3)', cursor: estado.convocado ? 'pointer' : 'not-allowed', accentColor: 'var(--accent)' }} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {vistaJugadores === 'grilla' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' }}>
            {jugadoresProcesados.map((j) => {
              const estado = seleccion[j.id] || { convocado: false, titular: false };
              
              let cardBorder = '1px solid #333';
              let cardBg = 'transparent';
              if (estado.convocado) { cardBorder = '1px solid #666'; }
              if (estado.titular) { cardBorder = '1px solid var(--accent)'; cardBg = 'rgba(0, 255, 136, 0.05)'; }

              return (
                <div key={j.id} style={{ border: cardBorder, background: cardBg, borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', transition: '0.2s' }}>
                  
                  <div className="mono-accent" style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '1rem', color: 'var(--accent)', fontWeight: 'bold' }}>{j.dorsal || '-'}</div>
                  <div className="pos-label" style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.65rem', color: '#888' }}>{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</div>
                  
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#222', marginTop: '10px', marginBottom: '15px', border: '1px solid #444', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {j.foto ? (
                      <img src={j.foto} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ color: '#555', fontSize: '0.7rem', fontWeight: 800 }}>FOTO</span>
                    )}
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '15px', minHeight: '40px' }}>
                    {j.apellido && <div style={{ fontWeight: 900, fontSize: '1.1rem', lineHeight: '1.1', color: '#fff' }}>{j.apellido.toUpperCase()}</div>}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '2px' }}>{j.nombre.toUpperCase()}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '5px', width: '100%' }}>
                    <button 
                      onClick={() => manejarTilde(j.id, 'convocado')} 
                      style={{ flex: 1, padding: '8px 5px', background: estado.convocado ? '#333' : 'transparent', border: estado.convocado ? '1px solid #666' : '1px solid #333', color: estado.convocado ? '#fff' : '#666', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>
                      {estado.convocado ? '✔ CONV' : 'CONVOCAR'}
                    </button>
                    <button 
                      onClick={() => manejarTilde(j.id, 'titular')} 
                      disabled={!estado.convocado}
                      style={{ flex: 1, padding: '8px 5px', background: estado.titular ? 'var(--accent)' : 'transparent', border: estado.titular ? '1px solid var(--accent)' : '1px solid #333', color: estado.titular ? '#000' : '#555', borderRadius: '4px', cursor: estado.convocado ? 'pointer' : 'not-allowed', fontSize: '0.7rem', fontWeight: 'bold' }}>
                      TITULAR
                    </button>
                  </div>

                </div>
              )
            })}
          </div>
        )}
        
        <button 
          onClick={handleIniciarPartido} 
          disabled={isSubmitting}
          className="btn-action" 
          style={{ width: '100%', marginTop: '30px', padding: '20px', fontSize: '1.1rem', opacity: isSubmitting ? 0.5 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer', background: totalConvocados > limiteConvocados || totalTitulares !== 5 ? '#555' : 'var(--accent)', color: totalConvocados > limiteConvocados || totalTitulares !== 5 ? '#888' : '#000' }}
        >
          {isSubmitting ? 'GENERANDO ENTORNO...' : (totalConvocados > limiteConvocados || totalTitulares !== 5 ? 'REVISAR LÍMITES PARA CONTINUAR' : '⚡ INICIAR PARTIDO Y TOMA DE DATOS')}
        </button>
      </div>

      <style>{`
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; letter-spacing: 1px; text-transform: uppercase; }
        .table-wrapper { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; border-bottom: 1px solid #222; text-align: center; color: #fff; }
        th { font-size: 0.75rem; color: var(--text-dim); font-weight: 800; border-bottom: 2px solid #333; }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default NuevoPartido;