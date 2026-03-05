import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function Inicio() {
  const navigate = useNavigate();
  const [modoPantalla, setModoPantalla] = useState('menu');
  const [jugadores, setJugadores] = useState([]);
  const [partidosGuardados, setPartidosGuardados] = useState([]);
  
  const [filtroVerCategoria, setFiltroVerCategoria] = useState('TODOS');
  
  // NUEVO ESTADO: ORDENAMIENTO DE JUGADORES CON ÍCONOS Y DIRECCIÓN
  const [ordenCriterio, setOrdenCriterio] = useState('dorsal'); // 'dorsal', 'nombre', 'posicion'
  const [ordenDireccion, setOrdenDireccion] = useState('asc'); // 'asc', 'desc'
  
  const [vistaJugadores, setVistaJugadores] = useState('lista');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const getHoraActual = () => new Date().toTimeString().slice(0, 5);

  const estadoInicialPartido = { 
    fecha: new Date().toISOString().split('T')[0], 
    horario: getHoraActual(), 
    lugar: '', rival: '', condicion: 'Local', 
    competicion: 'AMISTOSO', 
    jornada: '', // NUEVO: Campo para la fecha del torneo
    categoria: 'Primera', escudo_propio: '', escudo_rival: '', 
    nombre_propio: localStorage.getItem('mi_club') || 'MI EQUIPO' 
  };

  const [datosPartido, setDatosPartido] = useState(estadoInicialPartido);
  const [seleccion, setSeleccion] = useState({});

  useEffect(() => {
    async function obtenerDatos() {
      const { data: dataJugadores, error: errJ } = await supabase.from('jugadores').select('*');
      if (dataJugadores) setJugadores(dataJugadores);
      if (errJ) console.error("Error cargando jugadores:", errJ);

      const { data: dataPartidos, error: errP } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      if (dataPartidos) setPartidosGuardados(dataPartidos);
      if (errP) console.error("Error cargando partidos:", errP);
    }
    obtenerDatos();
  }, []);

  const abrirNuevoPartido = () => {
    setDatosPartido({...estadoInicialPartido, horario: getHoraActual()});
    setSeleccion({});
    setModoPantalla('nuevo');
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

  const limiteConvocados = datosPartido.competicion.toLowerCase().includes('amistoso') ? 16 : 14;
  const totalConvocados = jugadores.filter(j => seleccion[j.id]?.convocado).length;
  const totalTitulares = jugadores.filter(j => seleccion[j.id]?.titular).length;

  const guardarPartidoYEmpezar = async () => {
    if (isSubmitting) return;

    if (!datosPartido.rival) { alert("ERROR: El nombre del rival es obligatorio."); return; }
    
    if (totalConvocados === 0) { alert("ERROR: La convocatoria está vacía."); return; }
    if (totalConvocados > limiteConvocados) { alert(`ERROR: Límite de convocados superado (${totalConvocados}/${limiteConvocados}).`); return; }
    if (totalTitulares !== 5) { alert(`ERROR TÁCTICO: Hay ${totalTitulares} titulares marcados. Futsal requiere exactamente 5.`); return; }

    const seleccionados = jugadores.filter(j => seleccion[j.id]?.convocado);

    const plantilla = seleccionados.map(j => ({ 
      id_jugador: j.id, 
      titular: seleccion[j.id]?.titular || false
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

  // FUNCIONES DE ORDENAMIENTO (ROTACIÓN DE ÍCONOS)
  const alternarCriterio = () => {
    if (ordenCriterio === 'dorsal') setOrdenCriterio('nombre');
    else if (ordenCriterio === 'nombre') setOrdenCriterio('posicion');
    else setOrdenCriterio('dorsal');
  };

  const alternarDireccion = () => {
    setOrdenDireccion(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const getIconoCriterio = () => {
    if (ordenCriterio === 'dorsal') return '#️⃣';
    if (ordenCriterio === 'nombre') return '🔤';
    return '👕';
  };

  const jugadoresProcesados = useMemo(() => {
    let lista = jugadores.filter(j => filtroVerCategoria === 'TODOS' ? true : j.categoria === filtroVerCategoria);
    
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
  }, [jugadores, filtroVerCategoria, ordenCriterio, ordenDireccion]);


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
              <select value={datosPartido.competicion} onChange={e => setDatosPartido({...datosPartido, competicion: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }}>
                <option value="AMISTOSO">AMISTOSO</option>
                <option value="TORNEO">TORNEO</option>
                <option value="PLAYOFF">PLAYOFF</option>
                <option value="COPA ARGENTINA">COPA ARGENTINA</option>
              </select>
            </div>

            {/* APARECE SÓLO SI SE ELIGE "TORNEO" */}
            {datosPartido.competicion === 'TORNEO' && (
              <div>
                <div className="stat-label" style={{ marginBottom: '10px', color: 'var(--accent)' }}>JORNADA / FECHA</div>
                <input type="text" value={datosPartido.jornada} onChange={e => setDatosPartido({...datosPartido, jornada: e.target.value})} style={{ width: '100%', background: '#111', border: '1px dashed var(--accent)', color: '#fff', padding: '10px' }} placeholder="Ej: Fecha 3" />
              </div>
            )}

            <div>
              <div className="stat-label" style={{ marginBottom: '10px' }}>CATEGORÍA</div>
              <select value={datosPartido.categoria} onChange={e => setDatosPartido({...datosPartido, categoria: e.target.value})} style={{ width: '100%', background: 'transparent', border: '1px solid #333', color: '#fff', padding: '10px' }}>
                <option value="Primera">Primera</option><option value="Tercera">Tercera</option>
              </select>
            </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
              <div>
                <div className="stat-label">CONVOCATORIA Y SISTEMA INICIAL</div>
                <div style={{ display: 'flex', gap: '15px', marginTop: '10px', fontSize: '0.85rem' }}>
                  <div style={{ color: totalConvocados > limiteConvocados ? '#ef4444' : 'var(--text-dim)', fontWeight: totalConvocados > limiteConvocados ? 'bold' : 'normal' }}>
                    CONVOCADOS: <strong style={{ color: totalConvocados > limiteConvocados ? '#ef4444' : '#fff' }}>{totalConvocados} / {limiteConvocados}</strong>
                  </div>
                  <div style={{ color: totalTitulares !== 5 ? '#f97316' : 'var(--text-dim)', fontWeight: totalTitulares !== 5 ? 'bold' : 'normal' }}>
                    TITULARES: <strong style={{ color: totalTitulares !== 5 ? '#f97316' : 'var(--accent)' }}>{totalTitulares} / 5</strong>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                
                {/* BOTONES TIPO ICONO PARA ORDENAMIENTO */}
                <div style={{ display: 'flex', background: '#000', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
                  <button onClick={alternarCriterio} title="Cambiar criterio de orden (Número / Nombre / Puesto)" style={{ padding: '5px 10px', background: 'transparent', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontSize: '1.2rem', borderRight: '1px solid #333' }}>
                    {getIconoCriterio()}
                  </button>
                  <button onClick={alternarDireccion} title="Invertir dirección del orden" style={{ padding: '5px 10px', background: 'transparent', color: 'var(--accent)', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>
                    {ordenDireccion === 'asc' ? '⬇️' : '⬆️'}
                  </button>
                </div>

                <select value={filtroVerCategoria} onChange={(e) => setFiltroVerCategoria(e.target.value)} style={{ padding: '5px', background: '#000', color: '#fff', border: '1px solid #333' }}>
                  <option value="TODOS">TODAS LAS CAT.</option>
                  <option value="Primera">PRIMERA</option>
                  <option value="Tercera">TERCERA</option>
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
                          <td className="mono-accent">{j.dorsal}</td>
                          <td style={{ textAlign: 'left', fontWeight: 600 }}>
                            {j.apellido ? <span style={{ fontWeight: 800 }}>{j.apellido.toUpperCase()} </span> : ''}
                            {j.nombre.toUpperCase()}
                          </td>
                          <td className="pos-label">{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</td>
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
                      
                      <div className="mono-accent" style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '1rem' }}>{j.dorsal}</div>
                      <div className="pos-label" style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.65rem' }}>{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</div>
                      
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
              onClick={guardarPartidoYEmpezar} 
              disabled={isSubmitting}
              className="btn-action" 
              style={{ width: '100%', marginTop: '30px', padding: '20px', fontSize: '1.1rem', opacity: isSubmitting ? 0.5 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer', background: totalConvocados > limiteConvocados || totalTitulares !== 5 ? '#555' : 'var(--accent)', color: totalConvocados > limiteConvocados || totalTitulares !== 5 ? '#888' : '#000' }}
            >
              {isSubmitting ? 'GENERANDO ENTORNO...' : (totalConvocados > limiteConvocados || totalTitulares !== 5 ? 'REVISAR LÍMITES PARA CONTINUAR' : 'INICIAR PARTIDO')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inicio;