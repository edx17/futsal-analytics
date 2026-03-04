import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function Inicio() {
  const navigate = useNavigate();
  const [modoPantalla, setModoPantalla] = useState('menu');
  const [jugadores, setJugadores] = useState([]);
  const [partidosGuardados, setPartidosGuardados] = useState([]);
  const [filtroVerCategoria, setFiltroVerCategoria] = useState('TODOS');

  // --- ESTADO DE TRANSACCIÓN (SEGURIDAD) ---
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado inicial limpio
  const estadoInicialPartido = { 
    fecha: new Date().toISOString().split('T')[0], 
    horario: '', lugar: '', rival: '', condicion: 'Local', 
    competicion: 'Amistoso', 
    categoria: 'Primera', escudo_propio: '', escudo_rival: '', 
    nombre_propio: localStorage.getItem('mi_club') || 'MI EQUIPO' 
  };

  const [datosPartido, setDatosPartido] = useState(estadoInicialPartido);
  const [seleccion, setSeleccion] = useState({});

  useEffect(() => {
    async function obtenerDatos() {
      const { data: dataJugadores, error: errJ } = await supabase.from('jugadores').select('*').order('dorsal', { ascending: true });
      if (dataJugadores) setJugadores(dataJugadores);
      if (errJ) console.error("Error cargando jugadores:", errJ);

      const { data: dataPartidos, error: errP } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      if (dataPartidos) setPartidosGuardados(dataPartidos);
      if (errP) console.error("Error cargando partidos:", errP);
    }
    obtenerDatos();
  }, []);

  // --- LÓGICA DE UI Y FORMULARIO ---
  const abrirNuevoPartido = () => {
    // Reset de memoria para evitar cruce de datos
    setDatosPartido(estadoInicialPartido);
    setSeleccion({});
    setModoPantalla('nuevo');
  };

  const manejarTilde = (id, tipo) => {
    setSeleccion(prev => {
      const state = prev[id] || { convocado: false, titular: false, rol: '' };
      const newState = { ...state, [tipo]: !state[tipo] };
      
      // Reglas de negocio
      if (tipo === 'titular' && newState.titular) newState.convocado = true;
      if (tipo === 'convocado' && !newState.convocado) {
        newState.titular = false;
        newState.rol = ''; // Limpiamos el rol si lo desconvocan
      }
      return { ...prev, [id]: newState };
    });
  };

  const manejarRol = (id, rol) => {
    setSeleccion(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), rol }
    }));
  };

  // --- TRANSACCIÓN A BASE DE DATOS ---
  const guardarPartidoYEmpezar = async () => {
    if (isSubmitting) return; // Prevención de doble click (Race Condition)

    if (!datosPartido.rival) { alert("ERROR: El nombre del rival es obligatorio."); return; }
    
    const seleccionados = jugadores.filter(j => seleccion[j.id]?.convocado);
    if (seleccionados.length === 0) { alert("ERROR: La convocatoria está vacía."); return; }

    const titulares = seleccionados.filter(j => seleccion[j.id]?.titular);
    if (titulares.length !== 5) { alert(`ERROR TÁCTICO: Hay ${titulares.length} titulares marcados. Futsal requiere exactamente 5.`); return; }

    // Armado del JSON estructural de la plantilla
    const plantilla = seleccionados.map(j => ({ 
      id_jugador: j.id, 
      titular: seleccion[j.id]?.titular || false,
      rol: seleccion[j.id]?.titular ? (seleccion[j.id]?.rol || 'Universal') : 'Banco' 
    }));

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.from('partidos').insert([{ ...datosPartido, plantilla }]).select();
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        navigate('/toma-datos', { state: { partido: data[0] } });
      }
    } catch (error) {
      console.error("Fallo de integridad:", error);
      alert("Fallo en el servidor al guardar el partido. Revisá tu conexión.");
      setIsSubmitting(false);
    }
  };

  const continuarPartido = (partido) => {
    navigate('/toma-datos', { state: { partido } });
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      {modoPantalla === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', maxWidth: '1000px', margin: '0 auto', marginTop: '50px' }}>
          <div className="bento-card" style={{ textAlign: 'center', padding: '40px 20px', cursor: 'pointer', border: '1px solid var(--accent)' }} onClick={abrirNuevoPartido}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⚡</div>
            <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>NUEVO PARTIDO</div>
            <p style={{ color: 'var(--text-dim)', marginTop: '10px' }}>Crear convocatoria e iniciar toma de datos</p>
          </div>
          
          <div className="bento-card" style={{ padding: '20px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>PARTIDOS RECIENTES</div>
            {partidosGuardados.slice(0, 5).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #333' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#fff' }}>vs {p.rival.toUpperCase()}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '5px' }}>{p.fecha} // {p.categoria?.toUpperCase() || 'S/C'} ({p.competicion})</div>
                </div>
                <button onClick={() => continuarPartido(p)} className="btn-secondary" style={{ fontSize: '0.7rem' }}>CONTINUAR</button>
              </div>
            ))}
            {partidosGuardados.length === 0 && <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '30px' }}>No hay historial en la base de datos.</p>}
          </div>
        </div>
      )}

      {modoPantalla === 'nuevo' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>CREACIÓN DE MATCH</div>
            <button onClick={() => setModoPantalla('menu')} className="btn-secondary">VOLVER</button>
          </div>

          <div className="bento-card" style={{ marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div><div className="stat-label" style={{ marginBottom: '10px' }}>MI EQUIPO (NOMBRE)</div><input type="text" value={datosPartido.nombre_propio} onChange={e => setDatosPartido({...datosPartido, nombre_propio: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} /></div>
            <div><div className="stat-label" style={{ marginBottom: '10px' }}>RIVAL</div><input type="text" value={datosPartido.rival} onChange={e => setDatosPartido({...datosPartido, rival: e.target.value})} style={{ width: '100%', background: '#000', border: '1px solid var(--accent)', color: '#fff', padding: '10px' }} placeholder="Ej: BOCA JUNIORS" /></div>
            
            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>URL ESCUDO PROPIO</div>
              <input type="text" value={datosPartido.escudo_propio} onChange={e => setDatosPartido({...datosPartido, escudo_propio: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} placeholder="https://..." />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>URL ESCUDO RIVAL</div>
              <input type="text" value={datosPartido.escudo_rival} onChange={e => setDatosPartido({...datosPartido, escudo_rival: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} placeholder="https://..." />
            </div>

            <div><div className="stat-label" style={{ marginBottom: '10px' }}>FECHA</div><input type="date" value={datosPartido.fecha} onChange={e => setDatosPartido({...datosPartido, fecha: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} /></div>
            <div><div className="stat-label" style={{ marginBottom: '10px' }}>HORARIO</div><input type="time" value={datosPartido.horario} onChange={e => setDatosPartido({...datosPartido, horario: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} /></div>
            <div><div className="stat-label" style={{ marginBottom: '10px' }}>LUGAR / CANCHA</div><input type="text" value={datosPartido.lugar} onChange={e => setDatosPartido({...datosPartido, lugar: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} /></div>
            
            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>CONDICIÓN</div>
              <select value={datosPartido.condicion} onChange={e => setDatosPartido({...datosPartido, condicion: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }}>
                <option value="Local">Local</option><option value="Visitante">Visitante</option><option value="Neutral">Neutral</option>
              </select>
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>COMPETICIÓN</div>
              <input type="text" value={datosPartido.competicion} onChange={e => setDatosPartido({...datosPartido, competicion: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }} placeholder="Ej: Liga AFA" />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>CATEGORÍA</div>
              <select value={datosPartido.categoria} onChange={e => setDatosPartido({...datosPartido, categoria: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }}>
                <option value="Primera">Primera</option><option value="Tercera">Tercera</option>
                <option value="Cuarta">Cuarta</option><option value="Quinta">Quinta</option>
                <option value="Sexta">Sexta</option><option value="Séptima">Séptima</option><option value="Octava">Octava</option>
              </select>
            </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="stat-label">CONVOCATORIA Y SISTEMA INICIAL</div>
              <select value={filtroVerCategoria} onChange={(e) => setFiltroVerCategoria(e.target.value)} style={{ padding: '5px', background: '#000', color: '#fff', border: '1px solid #333' }}>
                <option value="TODOS">VER TODAS LAS CATEGORÍAS</option>
                <option value="Primera">SOLO PRIMERA</option>
                <option value="Tercera">SOLO TERCERA</option>
                <option value="Cuarta">SOLO CUARTA</option>
                <option value="Quinta">SOLO QUINTA</option>
              </select>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th style={{ textAlign: 'left' }}>JUGADOR</th><th>POS</th>
                    <th>CONVOCAR</th><th>TITULAR</th><th style={{ textAlign: 'left', minWidth: '120px' }}>ROL TÁCTICO</th>
                  </tr>
                </thead>
                <tbody>
                  {jugadores.filter(j => filtroVerCategoria === 'TODOS' ? true : j.categoria === filtroVerCategoria).map((j) => {
                    const estado = seleccion[j.id] || { convocado: false, titular: false, rol: '' };
                    return (
                      <tr key={j.id} className={estado.titular ? 'row-active' : ''}>
                        <td className="mono-accent">{j.dorsal}</td>
                        <td style={{ textAlign: 'left', fontWeight: 600 }}>
                          {j.apellido ? j.apellido.toUpperCase() + ' ' : ''}{j.nombre.toUpperCase()}
                        </td>
                        <td className="pos-label">{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</td>
                        <td><input type="checkbox" checked={estado.convocado} onChange={() => manejarTilde(j.id, 'convocado')} style={{ transform: 'scale(1.3)', cursor: 'pointer' }} /></td>
                        <td><input type="checkbox" checked={estado.titular} onChange={() => manejarTilde(j.id, 'titular')} style={{ transform: 'scale(1.3)', cursor: 'pointer', accentColor: 'var(--accent)' }} /></td>
                        <td style={{ textAlign: 'left' }}>
                          {estado.titular && (
                            <select 
                              value={estado.rol} 
                              onChange={(e) => manejarRol(j.id, e.target.value)}
                              style={{ background: '#111', color: '#fff', border: '1px solid var(--accent)', padding: '5px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}
                            >
                              <option value="">ASIGNAR...</option>
                              <option value="Arquero">ARQUERO</option>
                              <option value="Cierre">CIERRE</option>
                              <option value="Ala Der">ALA DERECHO</option>
                              <option value="Ala Izq">ALA IZQUIERDO</option>
                              <option value="Pívot">PÍVOT</option>
                              <option value="Universal">UNIVERSAL</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            
            <button 
              onClick={guardarPartidoYEmpezar} 
              disabled={isSubmitting}
              className="btn-action" 
              style={{ width: '100%', marginTop: '30px', padding: '20px', fontSize: '1.1rem', opacity: isSubmitting ? 0.5 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? 'GENERANDO ENTORNO...' : 'INICIAR PARTIDO'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inicio;