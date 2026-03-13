import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

// IMPORTAMOS EL HOOK DE NOTIFICACIONES Y COMPONENTES REUTILIZABLES
import { useToast } from '../components/ToastContext';
import InfoBox from '../components/InfoBox';

function Torneos() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [torneos, setTorneos] = useState([]);
  const [rivales, setRivales] = useState([]);
  
  const [filtroCategoria, setFiltroCategoria] = useState('Primera');
  const [torneoActivo, setTorneoActivo] = useState(null);
  const [fixture, setFixture] = useState([]);
  
  const [mostrarModalTorneo, setMostrarModalTorneo] = useState(false);
  const [mostrarModalFixture, setMostrarModalFixture] = useState(false);
  
  const [formTorneo, setFormTorneo] = useState({ nombre: '', categoria: 'Primera' });
  const [formFixture, setFormFixture] = useState({
    rival_id: '', jornada: '', fecha_partido: '', condicion: 'Local', estado: 'Pendiente', goles_propios: 0, goles_rival: 0
  });

  useEffect(() => {
    if (clubId) {
      fetchTorneos();
      fetchRivales();
    }
  }, [clubId]);

  const fetchTorneos = async () => {
    const { data } = await supabase.from('torneos').select('*').eq('club_id', clubId).order('id', { ascending: false });
    if (data) {
      setTorneos(data);
      if (data.length > 0 && !torneoActivo) {
        setFiltroCategoria(data[0].categoria);
      }
    }
  };

  const fetchRivales = async () => {
    const { data } = await supabase.from('rivales').select('*').eq('club_id', clubId).order('nombre', { ascending: true });
    if (data) setRivales(data);
  };

  const categoriasUnicas = useMemo(() => {
    return Array.from(new Set(['Primera', 'Reserva', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava', ...torneos.map(t => t.categoria)]));
  }, [torneos]);

  const torneosFiltrados = useMemo(() => {
    return torneos.filter(t => t.categoria === filtroCategoria);
  }, [torneos, filtroCategoria]);

  useEffect(() => {
    if (torneosFiltrados.length > 0) {
      if (!torneoActivo || !torneosFiltrados.some(t => t.id === torneoActivo.id)) {
        setTorneoActivo(torneosFiltrados[0]);
      }
    } else {
      setTorneoActivo(null);
      setFixture([]);
    }
  }, [torneosFiltrados]);

  // --- MAGIA: LECTURA AUTOMÁTICA DE EVENTOS ---
  const fetchFixture = async (idTorneo, categoriaTorneo) => {
    // 1. Buscamos los partidos
    const { data: partidosData } = await supabase
      .from('partidos')
      .select('*, rivales(nombre, escudo)')
      .eq('torneo_id', idTorneo)
      .eq('categoria', categoriaTorneo)
      .order('jornada', { ascending: true });
      
    if (!partidosData || partidosData.length === 0) {
      setFixture([]);
      return;
    }

    const idsPartidos = partidosData.map(p => p.id);

    // 2. Buscamos TODOS los eventos de esos partidos para saber la VERDAD
    const { data: eventosData } = await supabase
      .from('eventos')
      .select('id_partido, accion, equipo')
      .in('id_partido', idsPartidos);

    // 3. Contamos automáticamente los goles desde el tracker
    const matchStats = {};
    idsPartidos.forEach(id => matchStats[id] = { gp: 0, gr: 0, tieneEventos: false });

    if (eventosData) {
      eventosData.forEach(ev => {
        matchStats[ev.id_partido].tieneEventos = true;
        if (ev.accion === 'Gol' || ev.accion === 'Remate - Gol') {
          if (ev.equipo === 'Propio') matchStats[ev.id_partido].gp++;
          else matchStats[ev.id_partido].gr++;
        }
      });
    }

    // 4. Combinamos y obligamos al partido a tener el resultado real
    const fixtureCombinado = partidosData.map(p => {
      const stats = matchStats[p.id];
      if (stats.tieneEventos) {
        // SOBREESCRIBE CUALQUIER CARGA MANUAL POR LA VERDAD DEL TRACKER
        return { ...p, goles_propios: stats.gp, goles_rival: stats.gr, estado: 'Finalizado', esTrackeado: true };
      }
      return { ...p, esTrackeado: false };
    });

    setFixture(fixtureCombinado);
  };

  useEffect(() => {
    if (torneoActivo) fetchFixture(torneoActivo.id, torneoActivo.categoria);
  }, [torneoActivo]);

  const handleGuardarTorneo = async () => {
    if (!formTorneo.nombre) return showToast("El nombre del torneo es obligatorio", "warning");
    const { error } = await supabase.from('torneos').insert([{ ...formTorneo, club_id: clubId }]);
    if (!error) {
      setMostrarModalTorneo(false);
      setFiltroCategoria(formTorneo.categoria); 
      setFormTorneo({ nombre: '', categoria: 'Primera' });
      fetchTorneos();
      showToast("¡Torneo guardado con éxito!", "success");
    } else showToast("Error al guardar: " + error.message, "error");
  };

  const handleGuardarFixture = async () => {
    if (!formFixture.rival_id || !formFixture.jornada) return showToast("Rival y Jornada son obligatorios", "warning");
    
    const rivalSeleccionado = rivales.find(r => r.id === formFixture.rival_id);

    const nuevoPartido = {
      club_id: clubId,
      torneo_id: torneoActivo.id,
      rival_id: formFixture.rival_id,
      rival: rivalSeleccionado ? rivalSeleccionado.nombre : '',
      jornada: formFixture.jornada,
      fecha: formFixture.fecha_partido, 
      condicion: formFixture.condicion,
      estado: formFixture.estado,
      goles_propios: formFixture.goles_propios,
      goles_rival: formFixture.goles_rival,
      categoria: torneoActivo.categoria, 
      competicion: torneoActivo.nombre 
    };

    const { error } = await supabase.from('partidos').insert([nuevoPartido]);
    
    if (!error) {
      setMostrarModalFixture(false);
      fetchFixture(torneoActivo.id, torneoActivo.categoria);
      showToast("¡Fecha agregada al fixture!", "success");
    } else showToast("Error al agregar: " + error.message, "error");
  };

  const actualizarResultado = async (id, goles_propios, goles_rival, estado) => {
    await supabase.from('partidos').update({ goles_propios, goles_rival, estado }).eq('id', id);
    fetchFixture(torneoActivo.id, torneoActivo.categoria);
    if(estado === 'Finalizado') showToast("Resultado actualizado", "success");
  };

  const eliminarPartido = async (idPartido) => {
    const { count, error: errorEventos } = await supabase
      .from('eventos')
      .select('*', { count: 'exact', head: true })
      .eq('id_partido', idPartido);

    if (errorEventos) return showToast("Error al verificar datos: " + errorEventos.message, "error");

    if (count > 0) {
      return showToast(`BLOQUEO: Este partido tiene ${count} acciones. No podés borrarlo desde acá.`, "error");
    }

    if (window.confirm("✅ Este partido está completamente vacío (0 datos trackeados). ¿Estás seguro de que querés eliminar este duplicado del fixture?")) {
      const { error } = await supabase.from('partidos').delete().eq('id', idPartido);
      if (!error) {
        fetchFixture(torneoActivo.id, torneoActivo.categoria);
        showToast("Partido eliminado", "info");
      } else {
        showToast("Error al eliminar: " + error.message, "error");
      }
    }
  };

  const irATrackear = (partido) => navigate('/toma-datos', { state: { partido } });

  // --- MOTOR ANALÍTICO DEL TORNEO CORREGIDO ---
  const { stats, local, visitante, racha, vallasInvictas, chartDataEvolucion, chartDataLocalia, ptsTotales, eficacia } = useMemo(() => {
    
    // AHORA LEE 'Jugado', 'Finalizado' Y LOS QUE TIENEN EVENTOS AUTOMÁTICOS
    const partidosJugados = fixture.filter(f => f.estado === 'Finalizado' || f.estado === 'Jugado' || f.esTrackeado).sort((a,b) => {
      if(a.fecha && b.fecha) return new Date(a.fecha) - new Date(b.fecha);
      return a.id - b.id;
    });

    const s = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0 };
    const l = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };
    const v = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 };
    let rList = [];
    let vIn = 0;
    let chartEvol = [];

    partidosJugados.forEach((f, index) => {
        s.pj++;
        const gp = Number(f.goles_propios) || 0;
        const gr = Number(f.goles_rival) || 0;
        s.gf += gp;
        s.gc += gr;
        
        let res = 'E';
        if (gp > gr) { s.pg++; res = 'V'; }
        else if (gp < gr) { s.pp++; res = 'D'; }
        else { s.pe++; }
        
        rList.push(res);
        if (gr === 0) vIn++;

        if (f.condicion === 'Local') {
            l.pj++; l.gf += gp; l.gc += gr;
            if (res === 'V') { l.pg++; l.pts+=3; }
            if (res === 'E') { l.pe++; l.pts+=1; }
            if (res === 'D') { l.pp++; }
        } else if (f.condicion === 'Visitante') {
            v.pj++; v.gf += gp; v.gc += gr;
            if (res === 'V') { v.pg++; v.pts+=3; }
            if (res === 'E') { v.pe++; v.pts+=1; }
            if (res === 'D') { v.pp++; }
        }

        chartEvol.push({
            name: f.jornada || `F${index+1}`,
            GF: gp,
            GC: gr,
            DIF: gp - gr
        });
    });

    const efi = s.pj > 0 ? (((s.pg * 3 + s.pe) / (s.pj * 3)) * 100).toFixed(1) : 0;
    const ptsTot = (s.pg * 3) + (s.pe * 1);

    const cLocalia = [
        { name: 'Local', Eficacia: l.pj > 0 ? Number(((l.pts / (l.pj * 3)) * 100).toFixed(0)) : 0, GF: l.gf, GC: l.gc },
        { name: 'Visitante', Eficacia: v.pj > 0 ? Number(((v.pts / (v.pj * 3)) * 100).toFixed(0)) : 0, GF: v.gf, GC: v.gc }
    ];

    return { stats: s, local: l, visitante: v, racha: rList, vallasInvictas: vIn, chartDataEvolucion: chartEvol, chartDataLocalia: cLocalia, ptsTotales: ptsTot, eficacia: efi };
  }, [fixture]);

  const calcularMejorRacha = (racha) => {
      let max = 0; let actual = 0;
      for (let r of racha) {
          if (r === 'V' || r === 'E') { actual++; if (actual > max) max = actual; }
          else { actual = 0; }
      }
      return max;
  };

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>
      
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ fontSize: '2.5rem' }}>🏆</div>
        <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>GESTOR DE COMPETICIÓN</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end', marginBottom: '30px', background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>CATEGORÍA</div>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
             {categoriasUnicas.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>COMPETICIÓN (TORNEO)</div>
          <select value={torneoActivo?.id || ''} onChange={e => setTorneoActivo(torneos.find(t => t.id == e.target.value))} style={selectStyle}>
             {torneosFiltrados.length === 0 && <option value="">NO HAY TORNEOS REGISTRADOS...</option>}
             {torneosFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setMostrarModalTorneo(true)} className="btn-secondary" style={{ padding: '10px 20px', fontSize: '0.8rem', fontWeight: 800 }}>+ NUEVO TORNEO</button>
        </div>
      </div>

      {torneoActivo ? (
        <>
          <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '15px', marginBottom: '20px', textAlign: 'center' }}>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>{ptsTotales}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PUNTOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.pj}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>JUGADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#00ff88' }}>{stats.pg}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GANADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fbbf24' }}>{stats.pe}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>EMPATADOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{stats.pp}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>PERDIDOS</div></div>
            <div><div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{stats.gf}:{stats.gc}</div><div className="stat-label" style={{ fontSize: '0.65rem' }}>GOLES (DIF {stats.gf - stats.gc})</div></div>
            
            <div style={{ borderLeft: '1px solid #333', paddingLeft: '15px' }}>
               <div style={{ fontSize: '1.5rem', fontWeight: 900, color: eficacia >= 50 ? '#0ea5e9' : '#fff' }}>{eficacia}%</div>
               <div className="stat-label" style={{ fontSize: '0.65rem' }}>EFICACIA</div>
            </div>
            <div>
               <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7' }}>{vallasInvictas}</div>
               <div className="stat-label" style={{ fontSize: '0.65rem' }}>VALLAS INVICTAS</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', borderTop: '2px solid var(--accent)' }}>
               <div className="stat-label">ESTADO DE FORMA <InfoBox texto="Últimos 5 partidos (de izquierda a derecha)."/></div>
               <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
                  {racha.slice(-5).map((r, i) => {
                     let bg = '#333'; let color = '#fff';
                     if(r === 'V') { bg = 'var(--accent)'; color = '#000'; }
                     else if(r === 'D') { bg = '#ef4444'; color = '#fff'; }
                     return <div key={i} style={{ width: '35px', height: '35px', borderRadius: '4px', background: bg, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.2rem' }}>{r}</div>
                  })}
                  {racha.length === 0 && <span style={{ color: 'var(--text-dim)' }}>Aún sin partidos finalizados</span>}
               </div>
               <div style={{ marginTop: '15px', fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                  Mejor Racha Invicta: <strong>{calcularMejorRacha(racha)} partidos</strong>
               </div>
            </div>

            <div className="bento-card">
               <div className="stat-label" style={{ marginBottom: '15px' }}>EFICACIA DE LOCALÍA <InfoBox texto="Rendimiento de puntos jugando de Local vs Visitante."/></div>
               <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartDataLocalia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                     <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11, fontWeight: 700 }} />
                     <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} domain={[0, 100]} tickFormatter={val => `${val}%`} />
                     <RechartsTooltip cursor={{ fill: '#222' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                     <Bar dataKey="Eficacia" fill="var(--accent)" radius={[4, 4, 0, 0]} barSize={40} name="Eficacia (%)" />
                  </BarChart>
               </ResponsiveContainer>
            </div>

            <div className="bento-card">
               <div className="stat-label" style={{ marginBottom: '15px' }}>EVOLUCIÓN DE GOLES <InfoBox texto="Tendencia de goles anotados (GF) vs recibidos (GC) fecha a fecha."/></div>
               <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartDataEvolucion} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                     <XAxis dataKey="name" stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                     <YAxis stroke="#555" tick={{ fill: '#888', fontSize: 11 }} />
                     <RechartsTooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                     <Legend wrapperStyle={{ fontSize: '11px' }} iconType="circle" />
                     <Line type="monotone" dataKey="GF" stroke="#00ff88" strokeWidth={3} dot={{ r: 4, fill: '#00ff88' }} />
                     <Line type="monotone" dataKey="GC" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} />
                  </LineChart>
               </ResponsiveContainer>
            </div>
          </div>

          <div className="bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div className="stat-label">FIXTURE Y RESULTADOS</div>
              <button onClick={() => setMostrarModalFixture(true)} className="btn-action" style={{ background: 'var(--accent)', color: '#000', fontSize: '0.75rem', padding: '8px 15px' }}>+ AGREGAR FECHA</button>
            </div>

            {fixture.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>No hay partidos programados en este torneo para la categoría {torneoActivo.categoria}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {fixture.map(f => {
                  const estaCompletado = f.estado === 'Finalizado' || f.estado === 'Jugado' || f.esTrackeado;
                  
                  return (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: estaCompletado ? 'rgba(0, 255, 136, 0.05)' : '#111', padding: '15px', borderRadius: '6px', border: estaCompletado ? '1px solid var(--accent)' : '1px solid #333', flexWrap: 'wrap', gap: '10px' }}>
                      
                      <div style={{ minWidth: '150px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800 }}>{f.jornada?.toUpperCase()} // {f.condicion}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {f.rivales?.nombre?.toUpperCase() || f.rival?.toUpperCase() || 'RIVAL DESCONOCIDO'}
                        </div>
                        {/* PASTILLA DE ESTADO AGREGADA ACÁ */}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>📅 {f.fecha || 'A definir'}</span>
                          <span style={{
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: f.esTrackeado ? 'rgba(0, 255, 136, 0.1)' : (f.estado === 'Pendiente' ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.1)'),
                            color: f.esTrackeado ? 'var(--accent)' : (f.estado === 'Pendiente' ? '#aaa' : '#3b82f6'),
                            fontWeight: 800,
                            fontSize: '0.6rem',
                            letterSpacing: '0.5px'
                          }}>
                            {f.esTrackeado ? 'TRACKEADO' : f.estado.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {!estaCompletado ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button onClick={() => irATrackear(f)} className="btn-action" style={{ fontSize: '0.75rem', padding: '8px 15px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                            ⚡ TRACKEAR
                          </button>
                          <div style={{ height: '20px', width: '1px', background: '#333' }}></div>
                          <button onClick={() => actualizarResultado(f.id, 0, 0, 'Finalizado')} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px' }}>
                            CARGA MANUAL
                          </button>
                          <button onClick={() => eliminarPartido(f.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', marginLeft: '5px' }} title="Eliminar partido duplicado">
                            🗑️
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {f.esTrackeado ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0, 255, 136, 0.1)', padding: '5px 15px', borderRadius: '4px', border: '1px solid var(--accent)' }}>
                                <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '1.2rem' }}>{f.goles_propios}</span>
                                <span style={{ color: '#fff', fontWeight: 900 }}>-</span>
                                <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem' }}>{f.goles_rival}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--accent)', marginLeft: '10px', fontWeight: 800 }}>✓ TRACKEADO</span>
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>MI EQUIPO</span>
                                  <input type="number" value={f.goles_propios} onChange={(e) => actualizarResultado(f.id, e.target.value, f.goles_rival, 'Finalizado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: 'var(--accent)', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                </div>
                                <span style={{ fontWeight: 900 }}>-</span>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>RIVAL</span>
                                  <input type="number" value={f.goles_rival} onChange={(e) => actualizarResultado(f.id, f.goles_propios, e.target.value, 'Finalizado')} style={{ width: '40px', textAlign: 'center', background: '#000', color: '#fff', border: '1px solid #333', padding: '5px', fontWeight: 900, borderRadius: '4px' }} />
                                </div>
                                <button onClick={() => actualizarResultado(f.id, 0, 0, 'Pendiente')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.9rem', marginLeft: '5px' }}>↺</button>
                              </>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => irATrackear(f)} className="btn-action" style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '0.7rem', padding: '8px 10px', display: 'flex', gap: '5px' }}>
                              ✏️ EDITAR
                            </button>
                            <button onClick={() => navigate(`/resumen/${f.id}`)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 10px', display: 'flex', gap: '5px' }}>
                              📊 REPORTE
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>Creá tu primer torneo para empezar.</div>
      )}

      {/* --- MODALES --- */}
      {mostrarModalTorneo && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>NUEVO TORNEO</div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">NOMBRE</div><input type="text" value={formTorneo.nombre} onChange={e => setFormTorneo({...formTorneo, nombre: e.target.value})} style={inputIndustrial} placeholder="Ej: Copa Argentina" /></div>
            <div style={{ marginBottom: '20px' }}><div className="section-title">CATEGORÍA</div>
              <select value={formTorneo.categoria} onChange={e => setFormTorneo({...formTorneo, categoria: e.target.value})} style={inputIndustrial}>
                <option value="Primera">Primera</option>
                <option value="Reserva">Reserva</option>
                <option value="Tercera">Tercera</option>
                <option value="Cuarta">Cuarta</option>
                <option value="Quinta">Quinta</option>
                <option value="Sexta">Sexta</option>
                <option value="Séptima">Séptima</option>
                <option value="Octava">Octava</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setMostrarModalTorneo(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarTorneo} className="btn-action" style={{ flex: 1 }}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalFixture && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '400px' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>AGREGAR FECHA AL FIXTURE</div>
            
            <div style={{ marginBottom: '15px' }}><div className="section-title">RIVAL</div>
              <select value={formFixture.rival_id} onChange={e => setFormFixture({...formFixture, rival_id: e.target.value})} style={inputIndustrial}>
                <option value="">SELECCIONAR RIVAL...</option>
                {rivales.map(r => <option key={r.id} value={r.id}>{r.nombre.toUpperCase()}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}><div className="section-title">JORNADA / FASE</div><input type="text" value={formFixture.jornada} onChange={e => setFormFixture({...formFixture, jornada: e.target.value})} style={inputIndustrial} placeholder="Ej: Fecha 1 o Semifinal" /></div>
            <div style={{ marginBottom: '15px' }}><div className="section-title">FECHA DEL PARTIDO</div><input type="date" value={formFixture.fecha_partido} onChange={e => setFormFixture({...formFixture, fecha_partido: e.target.value})} style={inputIndustrial} /></div>
            
            <div style={{ marginBottom: '20px' }}><div className="section-title">CONDICIÓN</div>
              <select value={formFixture.condicion} onChange={e => setFormFixture({...formFixture, condicion: e.target.value})} style={inputIndustrial}>
                <option value="Local">Local</option><option value="Visitante">Visitante</option><option value="Neutral">Neutral</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setMostrarModalFixture(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardarFixture} className="btn-action" style={{ flex: 1 }}>AGREGAR FECHA</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 99999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px); padding: 20px; }
        .modal-content { width: 100%; border: 1px solid var(--accent); }
        .section-title { color: var(--text-dim); font-size: 0.8rem; font-weight: 800; margin-bottom: 5px; }
      `}</style>
    </div>
  );
}

const selectStyle = { 
  padding: '10px 15px', 
  fontSize: '1rem', 
  background: '#111', 
  color: 'var(--accent)', 
  border: '1px solid var(--accent)', 
  borderRadius: '6px', 
  outline: 'none',
  fontWeight: 800,
  cursor: 'pointer',
  minWidth: '220px'
};

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none' };

export default Torneos;