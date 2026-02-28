import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

function Configuracion() {
  const [clubName, setClubName] = useState(localStorage.getItem('mi_club') || 'MI EQUIPO');
  const [jugadores, setJugadores] = useState([]);
  
  const [mostrarModalAlta, setMostrarModalAlta] = useState(false);
  const [jugadorSeleccionado, setJugadorSeleccionado] = useState(null); // <-- NUEVO ESTADO PARA VER FICHA

  // ESTADOS DE ORDENAMIENTO
  const [ordenColumna, setOrdenColumna] = useState('dorsal');
  const [ordenAscendente, setOrdenAscendente] = useState(true);

  // FORMULARIO FULL CHAMPIONS LEAGUE
  const [formData, setFormData] = useState({
    nombre: '', dorsal: '', posicion: 'Ala', categoria: 'Primera',
    pierna: 'Diestro', fechanac: '', dni: '', contacto: '',
    peso: '', altura: '', grupo_sanguineo: '', vencimiento_apto: '',
    obra_social: '', contacto_emergencia: '', talla_ropa: '', talla_calzado: ''
  });

  useEffect(() => {
    fetchJugadores();
  }, []);

  const fetchJugadores = async () => {
    const { data } = await supabase.from('jugadores').select('*').order('dorsal', { ascending: true });
    setJugadores(data || []);
  };

  const guardarClub = () => {
    localStorage.setItem('mi_club', clubName.trim());
    alert('¡Nombre del Club guardado! Se usará por defecto al crear nuevos partidos.');
  };

  const manejarCambio = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const agregarJugador = async (e) => {
    e.preventDefault();
    if (!formData.nombre || !formData.dorsal) return alert('El nombre y el dorsal son obligatorios.');

    const payload = {
      nombre: formData.nombre.trim(),
      dorsal: parseInt(formData.dorsal),
      posicion: formData.posicion,
      categoria: formData.categoria,
      pierna: formData.pierna,
      fechanac: formData.fechanac || null, 
      dni: formData.dni ? parseInt(formData.dni) : null,
      contacto: formData.contacto ? parseInt(formData.contacto) : null,
      peso: formData.peso ? parseFloat(formData.peso) : null,
      altura: formData.altura ? parseInt(formData.altura) : null,
      grupo_sanguineo: formData.grupo_sanguineo || null,
      vencimiento_apto: formData.vencimiento_apto || null,
      obra_social: formData.obra_social || null,
      contacto_emergencia: formData.contacto_emergencia || null,
      talla_ropa: formData.talla_ropa || null,
      talla_calzado: formData.talla_calzado ? parseInt(formData.talla_calzado) : null
    };

    const { error } = await supabase.from('jugadores').insert([payload]);

    if (error) {
      alert('Error al agregar jugador: ' + error.message);
    } else {
      setFormData({
        nombre: '', dorsal: '', posicion: 'Ala', categoria: 'Primera',
        pierna: 'Diestro', fechanac: '', dni: '', contacto: '',
        peso: '', altura: '', grupo_sanguineo: '', vencimiento_apto: '',
        obra_social: '', contacto_emergencia: '', talla_ropa: '', talla_calzado: ''
      });
      setMostrarModalAlta(false);
      fetchJugadores(); 
    }
  };

  const eliminarJugador = async (id, nombre) => {
    if (window.confirm(`¿Seguro que querés eliminar a ${nombre} de la base de datos? Esto no se puede deshacer.`)) {
      await supabase.from('jugadores').delete().eq('id', id);
      fetchJugadores();
    }
  };

  const cambiarOrden = (columna) => {
    if (ordenColumna === columna) {
      setOrdenAscendente(!ordenAscendente);
    } else {
      setOrdenColumna(columna);
      setOrdenAscendente(true);
    }
  };

  const jugadoresOrdenados = [...jugadores].sort((a, b) => {
    let valA = a[ordenColumna] ?? '';
    let valB = b[ordenColumna] ?? '';

    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return ordenAscendente ? -1 : 1;
    if (valA > valB) return ordenAscendente ? 1 : -1;
    return 0;
  });

  const jugadoresAgrupados = jugadoresOrdenados.reduce((acc, j) => {
    const cat = j.categoria || 'Sin Categoría';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(j);
    return acc;
  }, {});

  const ordenJerarquia = ['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Septima', 'Octava'];
  
  const categoriasOrdenadas = Object.keys(jugadoresAgrupados).sort((a, b) => {
    const indexA = ordenJerarquia.indexOf(a);
    const indexB = ordenJerarquia.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA === -1 && indexB !== -1) return 1; 
    if (indexB === -1 && indexA !== -1) return -1;
    return a.localeCompare(b);
  });

  const RenderHeader = ({ label, campo }) => (
    <th 
      onClick={() => cambiarOrden(campo)} 
      style={{ 
        padding: '10px 15px', cursor: 'pointer', userSelect: 'none',
        color: ordenColumna === campo ? 'var(--accent)' : 'var(--text-dim)',
        transition: '0.2s'
      }}
    >
      {label} {ordenColumna === campo ? (ordenAscendente ? '▲' : '▼') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px' }}>
        <div className="stat-label" style={{ fontSize: '1.2rem' }}>⚙️ CONFIGURACIÓN Y GESTIÓN DE EQUIPO</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* IDENTIDAD DEL CLUB */}
        <div className="bento-card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="stat-label" style={{ marginBottom: '15px' }}>IDENTIDAD DEL CLUB</div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '5px' }}>NOMBRE DE MI EQUIPO</label>
              <input 
                type="text" 
                value={clubName} 
                onChange={(e) => setClubName(e.target.value)} 
                placeholder="Ej: Boca Juniors, Club Atlético Futsal..."
                style={{ width: '100%', padding: '10px', background: '#111', border: '1px solid var(--border)', color: '#fff', borderRadius: '4px' }}
              />
            </div>
            <button onClick={guardarClub} className="btn-action">GUARDAR IDENTIDAD</button>
          </div>
        </div>

        {/* GESTIÓN DE PLANTEL */}
        <div className="bento-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <div className="stat-label" style={{ fontSize: '1rem' }}>PLANTEL ACTIVO ({jugadores.length} JUGADORES)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Gestión de todas las divisiones. Clic en los títulos para ordenar. Clic en un jugador para ver ficha.</div>
            </div>
            <button 
              onClick={() => setMostrarModalAlta(true)} 
              className="btn-action" 
              style={{ background: 'var(--accent)', color: '#000', fontWeight: 800 }}
            >
              + NUEVO JUGADOR (ALTA)
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {categoriasOrdenadas.length === 0 && (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px' }}>No hay jugadores registrados en el sistema.</div>
            )}

            {categoriasOrdenadas.map(categoria => (
              <div key={categoria} style={{ border: '1px solid #222', borderRadius: '6px', background: 'rgba(0,0,0,0.3)' }}>
                <div style={{ background: '#111', padding: '10px 15px', borderBottom: '1px solid #222', borderRadius: '6px 6px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, color: 'var(--accent)' }}>CATEGORÍA: {categoria.toUpperCase()}</span>
                  <span className="mono-accent" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{jugadoresAgrupados[categoria].length} Fichas</span>
                </div>
                
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#0a0a0a', fontSize: '0.75rem', zIndex: 1 }}>
                      <tr>
                        <RenderHeader label="DORSAL" campo="dorsal" />
                        <RenderHeader label="NOMBRE" campo="nombre" />
                        <RenderHeader label="POSICIÓN" campo="posicion" />
                        <RenderHeader label="PIERNA" campo="pierna" />
                        <th style={{ padding: '10px 15px', textAlign: 'right', color: 'var(--text-dim)' }}>ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jugadoresAgrupados[categoria].map(j => (
                        <tr 
                          key={j.id} 
                          onClick={() => setJugadorSeleccionado(j)} // <-- AL HACER CLIC SE ABRE LA FICHA
                          style={{ borderBottom: '1px solid #1a1a1a', cursor: 'pointer', transition: '0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.background = '#111'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '10px 15px', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#fff' }}>#{j.dorsal}</td>
                          <td style={{ padding: '10px 15px', fontWeight: 700, color: '#fff' }}>{j.nombre.toUpperCase()}</td>
                          <td style={{ padding: '10px 15px', fontSize: '0.85rem' }}>{j.posicion?.toUpperCase()}</td>
                          <td style={{ padding: '10px 15px', fontSize: '0.85rem' }}>{j.pierna}</td>
                          <td style={{ padding: '10px 15px', textAlign: 'right' }}>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); // <-- EVITA QUE SE ABRA LA FICHA AL TOCAR BORRAR
                                eliminarJugador(j.id, j.nombre); 
                              }} 
                              style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, transition: '0.2s' }}
                              onMouseOver={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }}
                              onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ef4444'; }}
                            >
                              BORRAR
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==========================================
          🗔 MODAL 1: ALTA DE JUGADOR NUEVO
          ========================================== */}
      {mostrarModalAlta && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '800px' }}>
            
            <div className="modal-header">
              <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>📝 ALTA - NUEVO JUGADOR</div>
              <button onClick={() => setMostrarModalAlta(false)} className="close-btn">×</button>
            </div>

            <form onSubmit={agregarJugador}>
              
              {/* SECCIÓN 1: DATOS PERSONALES Y DEPORTIVOS */}
              <div className="section-title">1. DATOS PERSONALES Y DEPORTIVOS</div>
              <div className="form-grid" style={{ marginBottom: '25px' }}>
                <div className="input-field" style={{ gridColumn: 'span 2' }}>
                  <label>NOMBRE Y APELLIDO *</label>
                  <input type="text" name="nombre" value={formData.nombre} onChange={manejarCambio} placeholder="Ej: Lionel Messi" required />
                </div>
                <div className="input-field">
                  <label>DORSAL (N°) *</label>
                  <input type="number" name="dorsal" value={formData.dorsal} onChange={manejarCambio} placeholder="Ej: 10" required />
                </div>
                <div className="input-field">
                  <label>CATEGORÍA</label>
                  <select name="categoria" value={formData.categoria} onChange={manejarCambio}>
                    <option value="Primera">PRIMERA</option>
                    <option value="Tercera">TERCERA</option>
                    <option value="Cuarta">CUARTA</option>
                    <option value="Quinta">QUINTA</option>
                    <option value="Sexta">SEXTA</option>
                    <option value="Septima">SÉPTIMA</option>
                    <option value="Octava">OCTAVA</option>
                  </select>
                </div>
                <div className="input-field">
                  <label>POSICIÓN PRINCIPAL</label>
                  <select name="posicion" value={formData.posicion} onChange={manejarCambio}>
                    <option value="Arquero">ARQUERO</option>
                    <option value="Cierre">CIERRE</option>
                    <option value="Ala">ALA</option>
                    <option value="Pívot">PÍVOT</option>
                    <option value="Universal">UNIVERSAL</option>
                  </select>
                </div>
                <div className="input-field">
                  <label>PIERNA HÁBIL</label>
                  <select name="pierna" value={formData.pierna} onChange={manejarCambio}>
                    <option value="Diestro">DIESTRO</option>
                    <option value="Zurdo">ZURDO</option>
                    <option value="Ambidiestro">AMBIDIESTRO</option>
                  </select>
                </div>
                <div className="input-field">
                  <label>FECHA DE NACIMIENTO</label>
                  <input type="date" name="fechanac" value={formData.fechanac} onChange={manejarCambio} />
                </div>
                <div className="input-field">
                  <label>DNI / DOCUMENTO</label>
                  <input type="number" name="dni" value={formData.dni} onChange={manejarCambio} placeholder="Sin puntos" />
                </div>
              </div>

              {/* SECCIÓN 2: MÉDICA Y FÍSICA */}
              <div className="section-title">2. INFORMACIÓN MÉDICA Y FÍSICA</div>
              <div className="form-grid" style={{ marginBottom: '25px' }}>
                <div className="input-field">
                  <label>ALTURA (cm)</label>
                  <input type="number" name="altura" value={formData.altura} onChange={manejarCambio} placeholder="Ej: 180" />
                </div>
                <div className="input-field">
                  <label>PESO (kg)</label>
                  <input type="number" step="0.1" name="peso" value={formData.peso} onChange={manejarCambio} placeholder="Ej: 75.5" />
                </div>
                <div className="input-field">
                  <label>GRUPO SANGUÍNEO</label>
                  <input type="text" name="grupo_sanguineo" value={formData.grupo_sanguineo} onChange={manejarCambio} placeholder="Ej: O+" />
                </div>
                <div className="input-field">
                  <label>VENCIMIENTO APTO MÉDICO</label>
                  <input type="date" name="vencimiento_apto" value={formData.vencimiento_apto} onChange={manejarCambio} />
                </div>
                <div className="input-field">
                  <label>OBRA SOCIAL / PREPAGA</label>
                  <input type="text" name="obra_social" value={formData.obra_social} onChange={manejarCambio} placeholder="Ej: OSDE, Swiss Medical..." />
                </div>
                <div className="input-field">
                  <label>CONTACTO DE EMERGENCIA</label>
                  <input type="text" name="contacto_emergencia" value={formData.contacto_emergencia} onChange={manejarCambio} placeholder="Nombre y Teléfono" />
                </div>
              </div>

              {/* SECCIÓN 3: LOGÍSTICA / UTILERÍA */}
              <div className="section-title">3. LOGÍSTICA / UTILERÍA</div>
              <div className="form-grid" style={{ marginBottom: '30px' }}>
                <div className="input-field">
                  <label>TALLA DE ROPA</label>
                  <select name="talla_ropa" value={formData.talla_ropa} onChange={manejarCambio}>
                    <option value="">-- SELECCIONAR --</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>
                <div className="input-field">
                  <label>TALLE DE CALZADO (BOTINES)</label>
                  <input type="number" name="talla_calzado" value={formData.talla_calzado} onChange={manejarCambio} placeholder="Ej: 42" />
                </div>
                <div className="input-field" style={{ gridColumn: 'span 2' }}>
                  <label>TELÉFONO PERSONAL</label>
                  <input type="number" name="contacto" value={formData.contacto} onChange={manejarCambio} placeholder="Ej: 1123456789" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px', borderTop: '1px solid #333', paddingTop: '20px' }}>
                <button type="button" onClick={() => setMostrarModalAlta(false)} className="btn-secondary" style={{ flex: 1, padding: '15px' }}>CANCELAR</button>
                <button type="submit" className="btn-action" style={{ flex: 2, background: 'var(--accent)', color: '#000', padding: '15px', fontSize: '1.1rem' }}>GUARDAR FICHA COMPLETA</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          🗔 MODAL 2: VER FICHA DEL JUGADOR
          ========================================== */}
      {jugadorSeleccionado && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '600px', padding: '0' }}>
            
            {/* CABECERA DE LA FICHA */}
            <div style={{ background: 'linear-gradient(135deg, #111 0%, #000 100%)', padding: '30px', borderBottom: '2px solid var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
               <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                 <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'JetBrains Mono', lineHeight: 0.8 }}>
                   {jugadorSeleccionado.dorsal}
                 </div>
                 <div>
                   <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>{jugadorSeleccionado.nombre}</div>
                   <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', letterSpacing: '1px' }}>
                     {jugadorSeleccionado.categoria.toUpperCase()} • {jugadorSeleccionado.posicion.toUpperCase()}
                   </div>
                 </div>
               </div>
               <button onClick={() => setJugadorSeleccionado(null)} className="close-btn">×</button>
            </div>

            {/* CUERPO DE LA FICHA */}
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
              
              {/* Bloque 1: Personal */}
              <div>
                <div className="section-title" style={{ borderBottom: '1px solid #222', paddingBottom: '5px', marginBottom: '15px' }}>👤 DATOS PERSONALES</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <InfoItem label="DNI" valor={jugadorSeleccionado.dni} />
                  <InfoItem label="NACIMIENTO" valor={jugadorSeleccionado.fechanac} />
                  <InfoItem label="PIERNA HÁBIL" valor={jugadorSeleccionado.pierna} />
                  <InfoItem label="TELÉFONO" valor={jugadorSeleccionado.contacto} />
                </div>
              </div>

              {/* Bloque 2: Físico y Médico */}
              <div>
                <div className="section-title" style={{ borderBottom: '1px solid #222', paddingBottom: '5px', marginBottom: '15px' }}>🏥 FÍSICO Y MÉDICO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <InfoItem label="ALTURA" valor={jugadorSeleccionado.altura ? `${jugadorSeleccionado.altura} cm` : null} />
                  <InfoItem label="PESO" valor={jugadorSeleccionado.peso ? `${jugadorSeleccionado.peso} kg` : null} />
                  <InfoItem label="G. SANGUÍNEO" valor={jugadorSeleccionado.grupo_sanguineo} color="var(--accent)" />
                  <InfoItem label="VTO. APTO MÉDICO" valor={jugadorSeleccionado.vencimiento_apto} />
                  <InfoItem label="OBRA SOCIAL" valor={jugadorSeleccionado.obra_social} />
                  <InfoItem label="EMERGENCIA" valor={jugadorSeleccionado.contacto_emergencia} />
                </div>
              </div>

              {/* Bloque 3: Logística */}
              <div>
                <div className="section-title" style={{ borderBottom: '1px solid #222', paddingBottom: '5px', marginBottom: '15px' }}>👕 LOGÍSTICA DE UTILERÍA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <InfoItem label="TALLE ROPA" valor={jugadorSeleccionado.talla_ropa} />
                  <InfoItem label="TALLE CALZADO" valor={jugadorSeleccionado.talla_calzado} />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Estilos inyectados para los modales */}
      <style>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.85); z-index: 1000;
          display: flex; justify-content: center; align-items: center;
          backdrop-filter: blur(5px); padding: 20px;
        }
        .modal-content {
          width: 100%; border: 1px solid var(--accent);
          animation: scaleIn 0.2s; max-height: 90vh; overflow-y: auto;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: center; 
          margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;
        }
        .close-btn {
          background: transparent; border: none; color: #fff; 
          font-size: 1.8rem; cursor: pointer; line-height: 1;
        }
        .close-btn:hover { color: var(--accent); }
        .section-title {
          color: var(--text-dim); font-size: 0.8rem; font-weight: 800; 
          margin-bottom: 15px; letter-spacing: 1px; padding-top: 10px;
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Mini componente para mostrar datos en la ficha del jugador
const InfoItem = ({ label, valor, color = '#fff' }) => (
  <div>
    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.5px' }}>{label}</div>
    <div style={{ fontSize: '1rem', color: valor ? color : '#555', fontWeight: 600 }}>{valor || 'No registrado'}</div>
  </div>
);

export default Configuracion;