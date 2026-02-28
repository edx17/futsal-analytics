import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

function Inicio() {
  const navigate = useNavigate();
  const [modoPantalla, setModoPantalla] = useState('menu');
  const [jugadores, setJugadores] = useState([]);
  const [partidosGuardados, setPartidosGuardados] = useState([]);
  const [filtroVerCategoria, setFiltroVerCategoria] = useState('TODOS');

  // INICIALIZAMOS CON EL NOMBRE DEL CLUB GUARDADO Y COMPETICION
  const [datosPartido, setDatosPartido] = useState({ 
    fecha: new Date().toISOString().split('T')[0], 
    horario: '', lugar: '', rival: '', condicion: 'Local', 
    competicion: 'Amistoso', 
    categoria: 'Primera', escudo_propio: '', escudo_rival: '', 
    nombre_propio: localStorage.getItem('mi_club') || 'MI EQUIPO' 
  });
  
  const [seleccion, setSeleccion] = useState({});

  useEffect(() => {
    async function obtenerDatos() {
      const { data: dataJugadores } = await supabase.from('jugadores').select('*').order('dorsal', { ascending: true });
      if (dataJugadores) setJugadores(dataJugadores);
      const { data: dataPartidos } = await supabase.from('partidos').select('*').order('id', { ascending: false });
      if (dataPartidos) setPartidosGuardados(dataPartidos);
    }
    obtenerDatos();
  }, []);

  const manejarCambio = (e) => setDatosPartido({ ...datosPartido, [e.target.name]: e.target.value });

  const subirImagen = async (e, campo) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const nombreArchivo = `${Date.now()}_${archivo.name}`;
    const { data, error } = await supabase.storage.from('escudos').upload(nombreArchivo, archivo);
    if (!error) {
      const { data: urlData } = supabase.storage.from('escudos').getPublicUrl(nombreArchivo);
      setDatosPartido(prev => ({ ...prev, [campo]: urlData.publicUrl }));
    }
  };

  const manejarTilde = (id_jugador, tipo) => {
    setSeleccion((prev) => {
      const actual = prev[id_jugador] || { convocado: false, titular: false };
      let nuevo = { ...actual, [tipo]: !actual[tipo] };
      if (tipo === 'titular' && nuevo.titular) nuevo.convocado = true;
      if (tipo === 'convocado' && !nuevo.convocado) nuevo.titular = false;
      return { ...prev, [id_jugador]: nuevo };
    });
  };

  const cantTitulares = Object.values(seleccion).filter(s => s.titular).length;
  const cantConvocados = Object.values(seleccion).filter(s => s.convocado).length;

  const guardarPartidoYEmpezar = async () => {
    if (!datosPartido.rival.trim()) return alert("El nombre del rival es obligatorio");
    if (cantTitulares !== 5) return alert(`Debes seleccionar exactamente 5 titulares (Actuales: ${cantTitulares})`);

    const plantillaFinal = Object.entries(seleccion)
      .filter(([id, datos]) => datos.convocado)
      .map(([id, datos]) => ({ id_jugador: parseInt(id), titular: datos.titular }));

    const { data, error } = await supabase.from('partidos').insert([{ ...datosPartido, plantilla: plantillaFinal }]).select();
    if (!error) navigate('/toma-datos', { state: { partido: data[0] } });
  };

  const irAlPartidoExistente = (idPartido) => {
    const partidoElegido = partidosGuardados.find(p => p.id == idPartido);
    if (partidoElegido) {
      navigate('/toma-datos', { state: { partido: partidoElegido } });
    }
  };

  if (modoPantalla === 'menu') {
    return (
      <div style={{ animation: 'fadeIn 0.3s' }}>
        <div style={{ marginBottom: '40px' }}>
          <div className="stat-label">VIRTUAL.STATS // SELECCION</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800 }}>CENTRO DE DATOS</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
          <div className="bento-card" style={{ cursor: 'pointer', borderTop: '4px solid var(--text-dim)' }} onClick={() => setModoPantalla('nuevo')}>
            <div className="stat-label">PARTIDO NUEVO</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '15px 0' }}>INICIAR</div>
          </div>
          <div className="bento-card" style={{ cursor: 'pointer', borderTop: '4px solid var(--accent)' }} onClick={() => setModoPantalla('continuar')}>
            <div className="stat-label" style={{ color: 'var(--accent)' }}>HISTORIAL</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '15px 0' }}>CONTINUAR</div>
          </div>
        </div>
      </div>
    );
  }

  if (modoPantalla === 'continuar') {
    return (
      <div style={{ animation: 'fadeIn 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', alignItems: 'center' }}>
          <div className="stat-label">RESUME SESSION</div>
          <button onClick={() => setModoPantalla('menu')} className="btn-secondary">VOLVER</button>
        </div>
        <div className="bento-card">
          <div className="stat-label" style={{ marginBottom: '25px' }}>SELECCIONAR PARTIDO GUARDADO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {partidosGuardados.length === 0 ? (
              <p style={{ color: 'var(--text-dim)' }}>No hay partidos registrados en la base de datos.</p>
            ) : (
              partidosGuardados.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => irAlPartidoExistente(p.id)}
                  style={{ 
                    padding: '20px', 
                    border: '1px solid var(--border)', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#080808',
                    borderRadius: '6px'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.2rem', marginBottom: '5px' }}>VS {p.rival.toUpperCase()}</div>
                    {/* ACA MUESTRA LA COMPETICIÓN */}
                    <div className="stat-label" style={{ fontSize: '0.75rem' }}>{p.competicion || p.torneo || 'AMISTOSO'} // {p.fecha}</div>
                  </div>
                  <div className="mono-accent" style={{ fontSize: '1rem' }}>RESUME &gt;</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px', alignItems: 'center' }}>
        <div className="stat-label">MODO CONFIGURACION</div>
        <button onClick={() => setModoPantalla('menu')} className="btn-secondary">VOLVER AL MENU</button>
      </div>

      <div className="responsive-layout">
        <section className="bento-card" style={{ flex: '1 1 400px', minWidth: '320px' }}>
          <div className="stat-label" style={{ marginBottom: '30px', color: 'var(--accent)', borderBottom: '1px solid #222', paddingBottom: '15px' }}>PARAMETROS DE PARTIDO</div>
          <div className="form-grid">
            <div className="input-field"><label>MI EQUIPO</label><input type="text" name="nombre_propio" onChange={manejarCambio} value={datosPartido.nombre_propio} /></div>
            <div className="input-field"><label>ESCUDO LOCAL</label><input type="file" onChange={(e) => subirImagen(e, 'escudo_propio')} style={{ border: 'none', padding: '10px 0' }} /></div>
            <div className="input-field"><label>RIVAL</label><input type="text" name="rival" onChange={manejarCambio} value={datosPartido.rival} /></div>
            <div className="input-field"><label>ESCUDO RIVAL</label><input type="file" onChange={(e) => subirImagen(e, 'escudo_rival')} style={{ border: 'none', padding: '10px 0' }} /></div>
            <div className="input-field"><label>FECHA</label><input type="date" name="fecha" onChange={manejarCambio} value={datosPartido.fecha} /></div>
            <div className="input-field"><label>HORARIO</label><input type="time" name="horario" onChange={manejarCambio} value={datosPartido.horario} /></div>
            <div className="input-field"><label>LUGAR</label><input type="text" name="lugar" onChange={manejarCambio} value={datosPartido.lugar} placeholder="ESTADIO" /></div>
            <div className="input-field">
              <label>CATEGORIA</label>
              <select name="categoria" onChange={manejarCambio} value={datosPartido.categoria}>
                <option value="Primera">PRIMERA</option>
                <option value="Tercera">TERCERA</option>
              </select>
            </div>
            
            {/* SELECTOR DE COMPETICIÓN */}
            <div className="input-field" style={{ gridColumn: '1 / -1' }}>
              <label style={{ color: 'var(--accent)' }}>TIPO DE COMPETENCIA</label>
              <select name="competicion" onChange={manejarCambio} value={datosPartido.competicion} style={{ borderColor: 'var(--accent)' }}>
                <option value="Amistoso">AMISTOSO</option>
                <option value="Torneo Regular">TORNEO REGULAR</option>
                <option value="Copa Argentina">COPA ARGENTINA</option>
                <option value="Playoffs">PLAYOFFS</option>
              </select>
            </div>

          </div>
        </section>

        <section className="bento-card" style={{ flex: '2 1 500px', minWidth: '320px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', gap: '15px' }}>
            <div className="stat-label">ELEGIR CONVOCADOS</div>
            <div style={{ display: 'flex', gap: '20px', background: '#1a1a1a', padding: '10px 20px', borderRadius: '4px' }}>
              <div className="stat-label" style={{ color: '#fff' }}>CONVOCADOS: <span className="mono-accent">{cantConvocados}</span></div>
              <div className="stat-label" style={{ color: cantTitulares === 5 ? 'var(--accent)' : '#ff4444' }}>TITULARES: <span className="mono-accent" style={{ color: 'inherit' }}>{cantTitulares}</span>/5</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {['TODOS', 'Primera', 'Tercera'].map(cat => (
              <button 
                key={cat} 
                onClick={() => setFiltroVerCategoria(cat)} 
                style={{
                  background: filtroVerCategoria === cat ? 'var(--accent)' : 'transparent',
                  color: filtroVerCategoria === cat ? '#000' : 'var(--text-dim)',
                  border: `1px solid ${filtroVerCategoria === cat ? 'var(--accent)' : 'var(--border)'}`,
                  padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
                }}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ textAlign: 'left' }}>JUGADOR</th>
                  <th style={{ width: '70px' }}>POSICION</th>
                  <th style={{ width: '80px' }}>CONVOCADO</th>
                  <th style={{ width: '80px' }}>TITULAR</th>
                </tr>
              </thead>
              <tbody>
                {jugadores.filter(j => filtroVerCategoria === 'TODOS' ? true : j.categoria === filtroVerCategoria).map((j) => {
                  const estado = seleccion[j.id] || { convocado: false, titular: false };
                  return (
                    <tr key={j.id} className={estado.titular ? 'row-active' : ''}>
                      <td className="mono-accent">{j.dorsal}</td>
                      <td style={{ textAlign: 'left', fontWeight: 600 }}>{j.nombre.toUpperCase()}</td>
                      <td className="pos-label">{j.posicion ? j.posicion.substring(0,3).toUpperCase() : 'N/A'}</td>
                      <td><input type="checkbox" checked={estado.convocado} onChange={() => manejarTilde(j.id, 'convocado')} style={{ transform: 'scale(1.3)', cursor: 'pointer' }} /></td>
                      <td><input type="checkbox" checked={estado.titular} onChange={() => manejarTilde(j.id, 'titular')} style={{ transform: 'scale(1.3)', cursor: 'pointer', accentColor: 'var(--accent)' }} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={guardarPartidoYEmpezar} className="btn-action" style={{ width: '100%', marginTop: '30px', padding: '20px', fontSize: '1.1rem' }}>INICIAR PARTIDO</button>
        </section>
      </div>
    </div>
  );
}

export default Inicio;