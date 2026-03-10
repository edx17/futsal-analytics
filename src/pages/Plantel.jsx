import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function Plantel() {
  const [jugadores, setJugadores] = useState([]);
  const [mostrarModalAlta, setMostrarModalAlta] = useState(false);
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null);
  
  const [ordenColumna, setOrdenColumna] = useState('dorsal');
  const [ordenAscendente, setOrdenAscendente] = useState(true);

  const clubId = localStorage.getItem('club_id');

  const estadoInicial = {
    nombre: '', apellido: '', dorsal: '', posicion: 'Ala', categoria: 'Primera',
    pierna: 'Diestro', fechanac: '', dni: '', contacto: '',
    peso: '', altura: '', grupo_sanguineo: '', vencimiento_apto: '',
    obra_social: '', contacto_emergencia: '', talla_ropa: '', talla_calzado: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    if (clubId) fetchJugadores();
  }, [clubId]);

  const fetchJugadores = async () => {
    // FILTRO DE SEGURIDAD POR CLUB
    const { data } = await supabase.from('jugadores').select('*').eq('club_id', clubId).order('dorsal', { ascending: true });
    setJugadores(data || []);
  };

  const handleGuardarJugador = async () => {
    if (!formData.nombre || !formData.dorsal) {
      alert("El nombre y el dorsal son obligatorios.");
      return;
    }

    // INYECTAMOS EL CLUB ID ANTES DE GUARDAR
    const payload = { ...formData, club_id: clubId };

    if (formData.id) {
      const { error } = await supabase.from('jugadores').update(payload).eq('id', formData.id);
      if (!error) {
        alert("Jugador actualizado");
        setMostrarModalAlta(false);
        fetchJugadores();
      } else alert("Error al actualizar: " + error.message);
    } else {
      const { error } = await supabase.from('jugadores').insert([payload]);
      if (!error) {
        alert("Jugador creado");
        setMostrarModalAlta(false);
        fetchJugadores();
      } else alert("Error al crear: " + error.message);
    }
  };

  const abrirEdicion = (jugador) => {
    setFormData(jugador);
    setMostrarModalAlta(true);
  };

  const abrirNuevo = () => {
    setFormData(estadoInicial);
    setMostrarModalAlta(true);
  };

  const eliminarJugador = async (id) => {
    if(window.confirm("¿Seguro que querés eliminar a este jugador? Esto podría afectar las estadísticas de partidos pasados.")){
      const { error } = await supabase.from('jugadores').delete().eq('id', id);
      if(!error) fetchJugadores();
      else alert("Error al eliminar: " + error.message);
    }
  };

  const manejarOrden = (columna) => {
    if (ordenColumna === columna) setOrdenAscendente(!ordenAscendente);
    else { setOrdenColumna(columna); setOrdenAscendente(true); }
  };

  const jugadoresOrdenados = [...jugadores].sort((a, b) => {
    let valorA = a[ordenColumna] || '';
    let valorB = b[ordenColumna] || '';
    if (ordenColumna === 'nombre') {
      valorA = `${a.apellido || ''} ${a.nombre}`.trim().toLowerCase();
      valorB = `${b.apellido || ''} ${b.nombre}`.trim().toLowerCase();
    } else if (typeof valorA === 'string') {
      valorA = valorA.toLowerCase();
      valorB = valorB.toLowerCase();
    }
    if (valorA < valorB) return ordenAscendente ? -1 : 1;
    if (valorA > valorB) return ordenAscendente ? 1 : -1;
    return 0;
  });

  const getSortIcon = (columna) => {
    if (ordenColumna !== columna) return <span style={{ opacity: 0.3 }}>↕</span>;
    return ordenAscendente ? <span style={{ color: 'var(--accent)' }}>↑</span> : <span style={{ color: 'var(--accent)' }}>↓</span>;
  };

  if (!clubId) {
    return <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '50px' }}>Debes configurar tu club primero.</div>;
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s', paddingBottom: '80px' }}>
      <div className="bento-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div className="stat-label" style={{ fontSize: '1.2rem', color: '#fff' }}>MI PLANTEL ({jugadores.length})</div>
          <button onClick={abrirNuevo} className="btn-action" style={{ background: '#00ff88', color: '#000' }}>+ NUEVO JUGADOR</button>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th onClick={() => manejarOrden('dorsal')} style={{ cursor: 'pointer' }}># {getSortIcon('dorsal')}</th>
                <th onClick={() => manejarOrden('nombre')} style={{ textAlign: 'left', cursor: 'pointer' }}>JUGADOR {getSortIcon('nombre')}</th>
                <th onClick={() => manejarOrden('posicion')} style={{ cursor: 'pointer' }}>POSICIÓN {getSortIcon('posicion')}</th>
                <th onClick={() => manejarOrden('categoria')} style={{ cursor: 'pointer' }}>CAT. {getSortIcon('categoria')}</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {jugadoresOrdenados.map(j => (
                <tr key={j.id} style={{ textAlign: 'center' }}>
                  <td className="mono-accent">{j.dorsal}</td>
                  <td style={{ textAlign: 'left', fontWeight: 700, cursor: 'pointer', color: '#fff' }} onClick={() => setJugadorSeleccionado(j)}>
                    <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                      {j.apellido ? j.apellido.toUpperCase() + ' ' : ''}{j.nombre.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)' }}>{j.posicion?.toUpperCase()}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{j.categoria?.toUpperCase()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button onClick={() => abrirEdicion(j)} style={btnGhost}>EDITAR</button>
                      <button onClick={() => eliminarJugador(j.id)} style={{ ...btnGhost, color: '#ef4444', borderColor: '#ef4444' }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {jugadores.length === 0 && <tr><td colSpan="5" style={{ padding: '20px', color: 'var(--text-dim)' }}>No hay jugadores cargados en la base de datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- MODAL FICHA JUGADOR --- */}
      {jugadorSeleccionado && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '600px', background: '#111' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #333', paddingBottom: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>{jugadorSeleccionado.dorsal}</div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{jugadorSeleccionado.apellido ? jugadorSeleccionado.apellido.toUpperCase() + ' ' : ''}{jugadorSeleccionado.nombre.toUpperCase()}</div>
                  <div style={{ color: 'var(--text-dim)', fontWeight: 600, marginTop: '5px' }}>{jugadorSeleccionado.posicion?.toUpperCase()} // {jugadorSeleccionado.categoria?.toUpperCase()}</div>
                </div>
              </div>
              <button onClick={() => setJugadorSeleccionado(null)} className="close-btn">×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <div className="section-title">PERFIL TÉCNICO Y FÍSICO</div>
                <div style={fichaRow}><span>Pierna Hábil:</span> <strong>{jugadorSeleccionado.pierna || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Peso:</span> <strong>{jugadorSeleccionado.peso ? `${jugadorSeleccionado.peso} kg` : 'N/A'}</strong></div>
                <div style={fichaRow}><span>Altura:</span> <strong>{jugadorSeleccionado.altura ? `${jugadorSeleccionado.altura} cm` : 'N/A'}</strong></div>
                <div style={fichaRow}><span>Talla Ropa:</span> <strong>{jugadorSeleccionado.talla_ropa || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Talla Calzado:</span> <strong>{jugadorSeleccionado.talla_calzado || 'N/A'}</strong></div>
              </div>
              <div>
                <div className="section-title">DATOS PERSONALES Y MÉDICOS</div>
                <div style={fichaRow}><span>Fecha Nac.:</span> <strong>{jugadorSeleccionado.fechanac || 'N/A'}</strong></div>
                <div style={fichaRow}><span>DNI:</span> <strong>{jugadorSeleccionado.dni || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Teléfono:</span> <strong>{jugadorSeleccionado.contacto || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Emergencia:</span> <strong style={{color: '#ef4444'}}>{jugadorSeleccionado.contacto_emergencia || 'N/A'}</strong></div>
                <div style={fichaRow}><span>G. Sanguíneo:</span> <strong style={{color: '#ef4444'}}>{jugadorSeleccionado.grupo_sanguineo || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Obra Social:</span> <strong>{jugadorSeleccionado.obra_social || 'N/A'}</strong></div>
                <div style={fichaRow}><span>Venc. Apto:</span> <strong style={{ color: 'var(--accent)' }}>{jugadorSeleccionado.vencimiento_apto || 'N/A'}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button onClick={() => { abrirEdicion(jugadorSeleccionado); setJugadorSeleccionado(null); }} className="btn-action" style={{ flex: 1 }}>EDITAR DATOS</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL ALTA/EDICIÓN --- */}
      {mostrarModalAlta && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div className="stat-label" style={{ fontSize: '1.2rem', color: '#fff' }}>
                {formData.id ? 'EDITAR FICHA MÉDICA Y TÉCNICA' : 'NUEVA FICHA DE JUGADOR'}
              </div>
              <button onClick={() => setMostrarModalAlta(false)} className="close-btn">×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* BLOQUE DE IDENTIFICACIÓN */}
              <div style={{ background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
                <div className="section-title" style={{ marginTop: 0 }}>IDENTIFICACIÓN Y CANCHA</div>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                     <div className="section-title">NOMBRE</div>
                     <input type="text" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Lionel" />
                  </div>
                  <div style={{ flex: 1 }}>
                     <div className="section-title">APELLIDO</div>
                     <input type="text" value={formData.apellido} onChange={e => setFormData({...formData, apellido: e.target.value})} style={inputIndustrial} placeholder="Ej: Messi" />
                  </div>
                  <div style={{ width: '100px' }}>
                     <div className="section-title">DORSAL</div>
                     <input type="number" value={formData.dorsal} onChange={e => setFormData({...formData, dorsal: e.target.value})} style={{ ...inputIndustrial, color: 'var(--accent)', fontWeight: 800 }} placeholder="#" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <div>
                    <div className="section-title">POSICIÓN</div>
                    <select value={formData.posicion} onChange={e => setFormData({...formData, posicion: e.target.value})} style={inputIndustrial}>
                      <option value="Arquero">Arquero</option><option value="Cierre">Cierre</option>
                      <option value="Ala">Ala</option><option value="Ala Pivot">Ala Pivot</option><option value="Pivot">Pivot</option>
                    </select>
                  </div>
                  <div>
                    <div className="section-title">CATEGORÍA</div>
                    <select value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} style={inputIndustrial}>
                      <option value="Primera">Primera</option><option value="Tercera">Tercera</option>
                      <option value="Cuarta">Cuarta</option><option value="Quinta">Quinta</option>
                      <option value="Sexta">Sexta</option><option value="Séptima">Séptima</option><option value="Octava">Octava</option>
                    </select>
                  </div>
                  <div>
                    <div className="section-title">PIERNA HÁBIL</div>
                    <select value={formData.pierna} onChange={e => setFormData({...formData, pierna: e.target.value})} style={inputIndustrial}>
                      <option value="Diestro">Diestro</option><option value="Zurdo">Zurdo</option><option value="Ambidiestro">Ambidiestro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* BLOQUE FÍSICO Y MÉDICO */}
              <div style={{ background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
                <div className="section-title" style={{ marginTop: 0 }}>FICHA MÉDICA Y FÍSICA</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '15px' }}>
                  <div><div className="section-title">NACIMIENTO</div><input type="date" value={formData.fechanac} onChange={e => setFormData({...formData, fechanac: e.target.value})} style={inputIndustrial} /></div>
                  <div><div className="section-title">DNI</div><input type="number" value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} style={inputIndustrial} placeholder="Sin puntos" /></div>
                  <div><div className="section-title">PESO (KG)</div><input type="number" step="0.1" value={formData.peso} onChange={e => setFormData({...formData, peso: e.target.value})} style={inputIndustrial} placeholder="Ej: 75.5" /></div>
                  <div><div className="section-title">ALTURA (CM)</div><input type="number" value={formData.altura} onChange={e => setFormData({...formData, altura: e.target.value})} style={inputIndustrial} placeholder="Ej: 178" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div><div className="section-title">G. SANGUÍNEO</div><input type="text" value={formData.grupo_sanguineo} onChange={e => setFormData({...formData, grupo_sanguineo: e.target.value})} style={inputIndustrial} placeholder="Ej: O+" /></div>
                  <div><div className="section-title">OBRA SOCIAL</div><input type="text" value={formData.obra_social} onChange={e => setFormData({...formData, obra_social: e.target.value})} style={inputIndustrial} placeholder="Ej: OSDE" /></div>
                  <div><div className="section-title">VENC. APTO FÍSICO</div><input type="date" value={formData.vencimiento_apto} onChange={e => setFormData({...formData, vencimiento_apto: e.target.value})} style={{...inputIndustrial, borderColor: 'var(--accent)'}} /></div>
                </div>
              </div>

              {/* BLOQUE CONTACTO */}
              <div style={{ background: '#111', padding: '15px', borderRadius: '4px', border: '1px solid #333' }}>
                <div className="section-title" style={{ marginTop: 0 }}>CONTACTO E INDUMENTARIA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div><div className="section-title">TELÉFONO</div><input type="number" value={formData.contacto} onChange={e => setFormData({...formData, contacto: e.target.value})} style={inputIndustrial} placeholder="Ej: 1123456789" /></div>
                  <div><div className="section-title">EMERGENCIA</div><input type="text" value={formData.contacto_emergencia} onChange={e => setFormData({...formData, contacto_emergencia: e.target.value})} style={{...inputIndustrial, borderColor: '#ef4444'}} placeholder="Nombre y Número" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div><div className="section-title">TALLE ROPA</div><input type="text" value={formData.talla_ropa} onChange={e => setFormData({...formData, talla_ropa: e.target.value})} style={inputIndustrial} placeholder="Ej: M / L / XL" /></div>
                  <div><div className="section-title">NRO. CALZADO</div><input type="number" value={formData.talla_calzado} onChange={e => setFormData({...formData, talla_calzado: e.target.value})} style={inputIndustrial} placeholder="Ej: 42" /></div>
                </div>
              </div>

              <button onClick={handleGuardarJugador} className="btn-action" style={{ padding: '20px', fontSize: '1.2rem', marginTop: '10px' }}>
                GUARDAR FICHA EN BASE DE DATOS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STYLES AUXILIARES */}
      <style>{`
        .inputIndustrial { background: transparent; border: 1px solid var(--border); width: 100%; padding: 12px; color: #fff; border-radius: 4px; outline: none; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); animation: scaleIn 0.2s; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px; }
        .close-btn { background: transparent; border: none; color: #fff; font-size: 1.8rem; cursor: pointer; line-height: 1; }
        .close-btn:hover { color: var(--accent); }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 15px; letter-spacing: 1px; padding-top: 10px; }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };
const btnGhost = { background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 };
const fichaRow = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px dashed #333', color: 'var(--text-dim)', fontSize: '0.9rem' };

export default Plantel;