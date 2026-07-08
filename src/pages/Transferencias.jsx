import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import InfoBox from '../components/InfoBox';
import { TablaResponsive } from '../components/TablaResponsive';

const MONO = 'JetBrains Mono, monospace';

function Transferencias() {
  const clubId = localStorage.getItem('club_id');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { perfil } = useAuth();

  const misCategorias = perfil?.categorias_asignadas || [];

  const [transferencias, setTransferencias] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('activos'); // 'activos' | 'historial'
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroTipo, setFiltroTipo] = useState('Todos'); // historial

  const [modalAbierto, setModalAbierto] = useState(false);

  const formInicial = {
    tipo_movimiento: 'Prestamo',
    direccion: 'Saliente',
    jugador_id: '',
    jugador_nombre: '',
    club_destino: '',
    categoria: '',
    fecha_movimiento: new Date().toISOString().slice(0, 10),
    fecha_retorno: '',
    monto: '',
    moneda: 'ARS',
    opcion_compra: '',
    opcion_compra_vence: '',
    porcentaje_futura_venta: '',
    compensacion_extra: '',
    notas: ''
  };
  const [form, setForm] = useState(formInicial);

  useEffect(() => {
    if (clubId) {
      cargarDatos();
    } else {
      setLoading(false);
    }
  }, [clubId]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resTrans, resJug] = await Promise.all([
        supabase.from('transferencias').select('*').eq('club_id', clubId).order('fecha_movimiento', { ascending: false }),
        supabase.from('jugadores').select('id, nombre, apellido, posicion, dorsal, categoria, foto, estado_ficha').eq('club_id', clubId)
      ]);
      if (resTrans.data) setTransferencias(resTrans.data);
      if (resJug.data) setJugadores(resJug.data);
    } catch (err) {
      console.error('Error cargando transferencias:', err);
      showToast('Error al cargar el mercado de pases', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Join en JS vía Map (jugador_id -> jugador), sin embeds de Supabase
  const jugadoresMap = useMemo(() => {
    const m = new Map();
    jugadores.forEach(j => m.set(j.id, j));
    return m;
  }, [jugadores]);

  const infoJugador = (t) => {
    const j = jugadoresMap.get(t.jugador_id);
    const nombre = j ? `${j.nombre || ''} ${j.apellido || ''}`.trim() : (t.jugador_nombre || 'Jugador');
    return { nombre, foto: j?.foto || null, posicion: j?.posicion || null, dorsal: (j?.dorsal ?? null) };
  };

  const iniciales = (txt = '') => {
    const partes = txt.trim().split(/\s+/);
    const ini = (partes[0]?.[0] || '') + (partes[1]?.[0] || partes[0]?.[1] || '');
    return ini.toUpperCase() || '?';
  };

  const diasHasta = (fechaIso) => {
    if (!fechaIso) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const f = new Date(fechaIso); f.setHours(0, 0, 0, 0);
    if (isNaN(f.getTime())) return null;
    return Math.ceil((f - hoy) / 86400000);
  };

  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    if (v === 0) return '$0';
    if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}K`;
    return `$${v.toLocaleString('es-AR')}`;
  };

  // Categorías disponibles para el filtro
  const categoriasDisponibles = useMemo(() => {
    const base = misCategorias.length > 0
      ? misCategorias
      : ['Primera', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava'];
    const desdeData = transferencias.map(t => t.categoria).filter(Boolean);
    const set = Array.from(new Set([...base, ...desdeData]));
    return misCategorias.length > 0 ? set.filter(c => misCategorias.includes(c)) : set;
  }, [misCategorias, transferencias]);

  // Transferencias visibles (scope de categoría como en el resto de la app)
  const transFiltradas = useMemo(() => {
    let base = transferencias;
    if (misCategorias.length > 0) {
      base = base.filter(t => !t.categoria || misCategorias.includes(t.categoria));
    }
    if (filtroCategoria !== 'Todas') {
      base = base.filter(t => t.categoria === filtroCategoria);
    }
    return base;
  }, [transferencias, misCategorias, filtroCategoria]);

  // Dashboard de patrimonio
  const dashboard = useMemo(() => {
    const cedidos = transFiltradas.filter(t => t.tipo_movimiento === 'Prestamo' && t.direccion === 'Saliente' && t.estado === 'Activo');
    const refuerzos = transFiltradas.filter(t => t.tipo_movimiento === 'Prestamo' && t.direccion === 'Entrante' && t.estado === 'Activo');
    const ventas = transFiltradas.filter(t => t.tipo_movimiento === 'Venta' && t.direccion === 'Saliente');
    const ingresosVentas = ventas.reduce((acc, t) => acc + (Number(t.monto) || 0), 0);
    const derechos = transFiltradas.filter(t => (Number(t.porcentaje_futura_venta) || 0) > 0);
    const pctProm = derechos.length > 0
      ? Math.round(derechos.reduce((a, t) => a + (Number(t.porcentaje_futura_venta) || 0), 0) / derechos.length)
      : 0;
    const opciones = transFiltradas.filter(t => {
      if (t.estado !== 'Activo' || !t.opcion_compra) return false;
      const d = diasHasta(t.opcion_compra_vence);
      return d === null || d <= 90; // sin fecha o por vencer dentro de 90 días
    });
    return { cedidos: cedidos.length, refuerzos: refuerzos.length, ingresosVentas, derechos: derechos.length, pctProm, opciones: opciones.length };
  }, [transFiltradas]);

  // Préstamos activos (cualquier dirección) para las cartas
  const prestamosActivos = useMemo(() => {
    return transFiltradas
      .filter(t => t.tipo_movimiento === 'Prestamo' && t.estado === 'Activo')
      .sort((a, b) => {
        const da = diasHasta(a.fecha_retorno);
        const db = diasHasta(b.fecha_retorno);
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db; // los que vuelven antes, primero
      });
  }, [transFiltradas]);

  // Historial completo
  const historial = useMemo(() => {
    let base = transFiltradas;
    if (filtroTipo !== 'Todos') base = base.filter(t => t.tipo_movimiento === filtroTipo);
    return base;
  }, [transFiltradas, filtroTipo]);

  // --- Acciones ---
  const abrirModal = () => { setForm(formInicial); setModalAbierto(true); };

  const seleccionarJugador = (id) => {
    const j = jugadoresMap.get(Number(id));
    setForm(prev => ({
      ...prev,
      jugador_id: id,
      jugador_nombre: j ? `${j.nombre || ''} ${j.apellido || ''}`.trim() : prev.jugador_nombre,
      categoria: j?.categoria || prev.categoria
    }));
  };

  const handleGuardar = async () => {
    const esPrestamo = form.tipo_movimiento === 'Prestamo';
    const nombreFinal = form.jugador_id
      ? (jugadoresMap.get(Number(form.jugador_id)) ? `${jugadoresMap.get(Number(form.jugador_id)).nombre || ''} ${jugadoresMap.get(Number(form.jugador_id)).apellido || ''}`.trim() : form.jugador_nombre)
      : form.jugador_nombre;

    if (!nombreFinal) return showToast('Elegí un jugador o escribí el nombre', 'warning');
    if (!form.club_destino) return showToast(form.direccion === 'Entrante' ? 'Falta el club de origen' : 'Falta el club destino', 'warning');
    if (esPrestamo && form.direccion === 'Saliente' && !form.jugador_id) return showToast('Para ceder un jugador tenés que elegirlo del plantel', 'warning');

    const params = {
      p_club_id: clubId,
      p_jugador_id: form.jugador_id ? Number(form.jugador_id) : null,
      p_jugador_nombre: nombreFinal,
      p_tipo: form.tipo_movimiento,
      p_direccion: form.direccion,
      p_club_destino: form.club_destino,
      p_categoria: form.categoria || null,
      p_fecha_movimiento: form.fecha_movimiento || null,
      p_fecha_retorno: esPrestamo ? (form.fecha_retorno || null) : null,
      p_monto: form.monto ? Number(form.monto) : 0,
      p_moneda: form.moneda || 'ARS',
      p_opcion_compra: (esPrestamo && form.opcion_compra) ? Number(form.opcion_compra) : null,
      p_opcion_compra_vence: (esPrestamo && form.opcion_compra_vence) ? form.opcion_compra_vence : null,
      p_porcentaje_futura_venta: form.porcentaje_futura_venta ? Number(form.porcentaje_futura_venta) : 0,
      p_compensacion_extra: form.compensacion_extra || null,
      p_notas: form.notas || null
    };

    const { error } = await supabase.rpc('registrar_transferencia', params);
    if (error) return showToast('Error al registrar: ' + error.message, 'error');

    setModalAbierto(false);
    await cargarDatos();
    showToast('¡Movimiento registrado!', 'success');
  };

  const handleRetornar = async (t) => {
    if (!window.confirm(`¿Confirmás que ${infoJugador(t).nombre} ya volvió del préstamo?`)) return;
    const { error } = await supabase.rpc('retornar_prestamo', { p_transferencia_id: t.id, p_club_id: clubId });
    if (error) return showToast('Error: ' + error.message, 'error');
    await cargarDatos();
    showToast('Jugador reincorporado al plantel', 'success');
  };

  const handleComprado = async (t) => {
    if (!window.confirm('¿Marcar como COMPRADO? Se cierra el préstamo y la opción de compra queda ejecutada.')) return;
    const { error } = await supabase.from('transferencias').update({ estado: 'Comprado', updated_at: new Date().toISOString() }).eq('id', t.id).eq('club_id', clubId);
    if (error) return showToast('Error: ' + error.message, 'error');
    await cargarDatos();
    showToast('Préstamo marcado como comprado', 'info');
  };

  const handleEliminar = async (t) => {
    if (!window.confirm('¿Eliminar este movimiento del historial? La ficha del jugador no se modifica automáticamente.')) return;
    const { error } = await supabase.from('transferencias').delete().eq('id', t.id).eq('club_id', clubId);
    if (error) return showToast('Error: ' + error.message, 'error');
    await cargarDatos();
    showToast('Movimiento eliminado', 'info');
  };

  // --- Helpers de UI ---
  const chipTipo = (t) => {
    const map = {
      Prestamo: { txt: 'PRÉSTAMO', bg: 'rgba(251,191,36,0.12)', col: '#fbbf24' },
      Venta: { txt: 'VENTA', bg: 'rgba(239,68,68,0.12)', col: '#ef4444' },
      Libre: { txt: 'LIBRE', bg: 'rgba(168,85,247,0.12)', col: '#a855f7' }
    };
    const c = map[t.tipo_movimiento] || map.Libre;
    return <span style={{ ...chipBase, background: c.bg, color: c.col }}>{c.txt}</span>;
  };

  const chipEstado = (estado) => {
    const map = {
      Activo: { col: 'var(--accent)' }, Retornado: { col: 'var(--text-dim)' },
      Comprado: { col: '#00ff88' }, Cerrada: { col: '#3b82f6' }, Cancelada: { col: '#ef4444' }
    };
    const c = map[estado] || { col: '#fff' };
    return <span style={{ ...chipBase, background: 'rgba(255,255,255,0.06)', color: c.col }}>{(estado || '').toUpperCase()}</span>;
  };

  const RingCountdown = ({ dias }) => {
    const r = 28, C = 2 * Math.PI * r;
    const overdue = dias !== null && dias < 0;
    const ref = 120; // ventana visual de referencia (días)
    const frac = dias === null ? 0 : Math.max(0.04, Math.min(1, dias / ref));
    const color = overdue ? '#ef4444' : (dias !== null && dias <= 14 ? '#fbbf24' : 'var(--accent)');
    return (
      <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="#222" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(overdue ? 1 : frac) * C} ${C}`} transform="rotate(-90 36 36)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 900, fontFamily: MONO, color }}>{dias === null ? '∞' : Math.abs(dias)}</span>
          <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '0.5px' }}>
            {dias === null ? 'S/FECHA' : (overdue ? 'VENCIDO' : 'DÍAS')}
          </span>
        </div>
      </div>
    );
  };

  const Avatar = ({ foto, nombre, size = 44 }) => (
    foto ? (
      <img src={foto} alt={nombre} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1px solid #333', flexShrink: 0 }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#1a1a1a', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: size * 0.32, color: 'var(--accent)', flexShrink: 0 }}>
        {iniciales(nombre)}
      </div>
    )
  );

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#ef4444' }}>Debes configurar tu club.</div>;

  const GRUPOS_TRANS = { gen: 'var(--text-dim)', eco: '#00ff88' };
  const GRUPOS_TRANS_LABEL = { gen: 'DATOS', eco: 'ECONÓMICO' };
  const COLS_TRANS = [
    { k: 'tipo', t: 'TIPO', g: 'gen', r: t => chipTipo(t) },
    { k: 'destino', t: 'DESTINO / ORIGEN', g: 'gen', r: t => `${t.direccion === 'Entrante' ? '← ' : '→ '}${t.club_destino || '—'}` },
    { k: 'fecha', t: 'FECHA', g: 'gen', r: t => t.fecha_movimiento || '—' },
    { k: 'monto', t: 'MONTO', g: 'eco', r: t => (Number(t.monto) || 0) > 0 ? fmtMoney(t.monto) : (t.compensacion_extra ? '🤝' : '—') },
    { k: 'pct', t: '% FUT.', g: 'eco', r: t => (Number(t.porcentaje_futura_venta) || 0) > 0 ? `${t.porcentaje_futura_venta}%` : '—' },
    { k: 'estado', t: 'ESTADO', g: 'gen', r: t => chipEstado(t.estado) },
    { k: 'acc', t: 'ACCIÓN', g: 'gen', r: t => <button onClick={() => handleEliminar(t)} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '5px 12px', borderRadius: '6px', minHeight: '40px' }}>🗑️ Eliminar</button> },
  ];

  return (
    <div style={{ paddingBottom: '80px', maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.3s' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '2.5rem' }}>💸</div>
        <div style={{ flex: 1 }}>
          <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>MERCADO DE PASES</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Préstamos, ventas y patrimonio del club.</div>
        </div>
        <button onClick={abrirModal} className="btn-action" style={{ background: 'var(--accent)', color: '#000', fontWeight: 800, padding: '12px 22px', fontSize: '0.85rem' }}>
          + NUEVO MOVIMIENTO
        </button>
      </div>

      {/* FILTRO DE CATEGORÍA */}
      <div className="bento-card" style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <div className="stat-label" style={{ marginBottom: '8px' }}>CATEGORÍA</div>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
            <option value="Todas">TODAS LAS CATEGORÍAS</option>
            {categoriasDisponibles.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      {/* DASHBOARD DE PATRIMONIO */}
      <div className="bento-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px', textAlign: 'center', background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)' }}>
        <div>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: 'var(--accent)', fontFamily: MONO }}>{dashboard.cedidos}</div>
          <div className="stat-label" style={{ fontSize: '0.62rem' }}>CEDIDOS ACTIVOS</div>
        </div>
        <div>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#3b82f6', fontFamily: MONO }}>{dashboard.refuerzos}</div>
          <div className="stat-label" style={{ fontSize: '0.62rem' }}>REFUERZOS A PRÉSTAMO</div>
        </div>
        <div>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#00ff88', fontFamily: MONO }}>{fmtMoney(dashboard.ingresosVentas)}</div>
          <div className="stat-label" style={{ fontSize: '0.62rem' }}>INGRESOS POR VENTAS</div>
        </div>
        <div>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#a855f7', fontFamily: MONO }}>{dashboard.derechos}</div>
          <div className="stat-label" style={{ fontSize: '0.62rem' }}>DERECHOS A FUTURO {dashboard.pctProm > 0 ? `· ${dashboard.pctProm}%` : ''}</div>
        </div>
        <div style={{ borderLeft: '1px solid #333' }}>
          <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#fbbf24', fontFamily: MONO }}>{dashboard.opciones}</div>
          <div className="stat-label" style={{ fontSize: '0.62rem' }}>OPCIONES POR VENCER</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '5px', background: '#0a0a0a', padding: '5px', borderRadius: '8px', border: '1px solid #333', marginBottom: '20px', width: 'fit-content' }}>
        <button onClick={() => setTab('activos')} style={{ ...tabBtn, background: tab === 'activos' ? '#222' : 'transparent', color: tab === 'activos' ? 'var(--accent)' : 'var(--text-dim)' }}>
          PRÉSTAMOS ACTIVOS
        </button>
        <button onClick={() => setTab('historial')} style={{ ...tabBtn, background: tab === 'historial' ? '#222' : 'transparent', color: tab === 'historial' ? 'var(--accent)' : 'var(--text-dim)' }}>
          HISTORIAL
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>Cargando mercado...</div>
      ) : (
        <>
          {/* TAB: PRÉSTAMOS ACTIVOS */}
          {tab === 'activos' && (
            prestamosActivos.length === 0 ? (
              <div className="bento-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                No hay préstamos activos. Cuando cedas o recibas un jugador, su tarjeta con la cuenta regresiva aparece acá.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '15px' }}>
                {prestamosActivos.map(t => {
                  const info = infoJugador(t);
                  const dias = diasHasta(t.fecha_retorno);
                  const entrante = t.direccion === 'Entrante';
                  return (
                    <div key={t.id} className="bento-card" style={{ display: 'flex', alignItems: 'center', gap: '15px', borderLeft: `3px solid ${entrante ? '#3b82f6' : 'var(--accent)'}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <Avatar foto={info.foto} nombre={info.nombre} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {info.dorsal != null && <span style={{ color: 'var(--accent)', fontFamily: MONO }}>#{info.dorsal} </span>}
                              {info.nombre}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {info.posicion && <span style={{ ...chipBase, background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)' }}>{info.posicion.toUpperCase()}</span>}
                              <span style={{ ...chipBase, background: entrante ? 'rgba(59,130,246,0.12)' : 'rgba(0,230,118,0.12)', color: entrante ? '#3b82f6' : 'var(--accent)' }}>
                                {entrante ? 'ENTRANTE' : 'CEDIDO'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                          {entrante ? 'Viene de' : 'Cedido a'} <strong style={{ color: '#fff' }}>{t.club_destino}</strong>
                        </div>

                        {t.opcion_compra ? (
                          <span style={{ ...chipBase, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                            OPCIÓN {fmtMoney(t.opcion_compra)}{t.opcion_compra_vence ? ` · vence ${t.opcion_compra_vence}` : ''}
                          </span>
                        ) : (
                          <span style={{ ...chipBase, background: 'rgba(255,255,255,0.04)', color: 'var(--text-dim)' }}>Sin opción de compra</span>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                          <button onClick={() => handleRetornar(t)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 12px', fontWeight: 800 }}>
                            ↩ RETORNÓ
                          </button>
                          {t.opcion_compra && (
                            <button onClick={() => handleComprado(t)} className="btn-secondary" style={{ fontSize: '0.7rem', padding: '8px 12px', fontWeight: 800, borderColor: '#3b82f6', color: '#3b82f6' }}>
                              ✓ COMPRADO
                            </button>
                          )}
                          <button onClick={() => handleEliminar(t)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', marginLeft: 'auto' }} title="Eliminar">🗑️</button>
                        </div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <RingCountdown dias={dias} />
                        <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                          {dias === null ? 'a definir' : (dias < 0 ? 'debió volver' : 'p/ volver')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* TAB: HISTORIAL */}
          {tab === 'historial' && (
            <div className="bento-card">
              <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', flexWrap: 'wrap' }}>
                {['Todos', 'Prestamo', 'Venta', 'Libre'].map(tp => (
                  <button key={tp} onClick={() => setFiltroTipo(tp)} style={{ ...tabBtn, fontSize: '0.7rem', padding: '7px 14px', background: filtroTipo === tp ? '#222' : 'transparent', color: filtroTipo === tp ? 'var(--accent)' : 'var(--text-dim)', border: '1px solid #333' }}>
                    {tp === 'Prestamo' ? 'PRÉSTAMOS' : tp.toUpperCase()}
                  </button>
                ))}
              </div>

              {historial.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>No hay movimientos con ese filtro.</div>
              ) : (
                <TablaResponsive
                  filas={historial}
                  columnas={COLS_TRANS}
                  colsClave={['tipo', 'monto', 'estado']}
                  grupos={GRUPOS_TRANS}
                  gruposLabel={GRUPOS_TRANS_LABEL}
                  titulo="HISTORIAL DE MOVIMIENTOS"
                  getId={(t) => t.id}
                  getTitulo={(t) => infoJugador(t).nombre}
                  getSubtitulo={(t) => t.categoria || ''}
                  colorCelda={(t, col) => col.k === 'monto' ? '#00ff88' : (col.k === 'pct' ? '#a855f7' : '#fff')}
                >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: '720px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #333', color: 'var(--text-dim)', fontSize: '0.7rem', background: '#0a0a0a' }}>
                        <th style={{ padding: '12px' }}>JUGADOR</th>
                        <th style={{ padding: '12px' }}>TIPO</th>
                        <th style={{ padding: '12px' }}>DESTINO / ORIGEN</th>
                        <th style={{ padding: '12px' }}>FECHA</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>MONTO</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>% FUT.</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>ESTADO</th>
                        <th style={{ padding: '12px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map(t => {
                        const info = infoJugador(t);
                        return (
                          <tr key={t.id} style={{ borderBottom: '1px solid #222' }}>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar foto={info.foto} nombre={info.nombre} size={30} />
                                <div>
                                  <div style={{ fontWeight: 800, color: '#fff', fontSize: '0.85rem' }}>{info.nombre}</div>
                                  {t.categoria && <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{t.categoria}</div>}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>{chipTipo(t)}</td>
                            <td style={{ padding: '12px', color: '#fff', fontSize: '0.85rem' }}>
                              <span style={{ color: 'var(--text-dim)', marginRight: '5px' }}>{t.direccion === 'Entrante' ? '←' : '→'}</span>
                              {t.club_destino}
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '0.8rem', fontFamily: MONO }}>{t.fecha_movimiento || '—'}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, fontFamily: MONO, color: (Number(t.monto) || 0) > 0 ? '#00ff88' : 'var(--text-dim)' }}>
                              {(Number(t.monto) || 0) > 0 ? fmtMoney(t.monto) : (t.compensacion_extra ? '🤝' : '—')}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center', fontFamily: MONO, color: (Number(t.porcentaje_futura_venta) || 0) > 0 ? '#a855f7' : 'var(--text-dim)' }}>
                              {(Number(t.porcentaje_futura_venta) || 0) > 0 ? `${t.porcentaje_futura_venta}%` : '—'}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>{chipEstado(t.estado)}</td>
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <button onClick={() => handleEliminar(t)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }} title="Eliminar">🗑️</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </TablaResponsive>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL NUEVO MOVIMIENTO */}
      {modalAbierto && (
        <div className="modal-overlay">
          <div className="bento-card modal-content" style={{ maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="stat-label" style={{ marginBottom: '20px' }}>NUEVO MOVIMIENTO</div>

            {/* TIPO */}
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">TIPO DE MOVIMIENTO</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Prestamo', 'Venta', 'Libre'].map(tp => (
                  <button key={tp} onClick={() => setForm({ ...form, tipo_movimiento: tp })} style={{ flex: 1, padding: '10px', background: form.tipo_movimiento === tp ? 'rgba(0,230,118,0.1)' : 'transparent', border: `1px solid ${form.tipo_movimiento === tp ? 'var(--accent)' : '#333'}`, color: form.tipo_movimiento === tp ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 800, borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {tp === 'Prestamo' ? 'PRÉSTAMO' : tp.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* DIRECCIÓN (solo préstamo) */}
            {form.tipo_movimiento === 'Prestamo' && (
              <div style={{ marginBottom: '15px' }}>
                <div className="section-title">DIRECCIÓN</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['Saliente', 'CEDO UN JUGADOR'], ['Entrante', 'RECIBO UN JUGADOR']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setForm({ ...form, direccion: val })} style={{ flex: 1, padding: '10px', background: form.direccion === val ? '#222' : 'transparent', border: `1px solid ${form.direccion === val ? '#3b82f6' : '#333'}`, color: form.direccion === val ? '#3b82f6' : 'var(--text-dim)', fontWeight: 800, borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* JUGADOR */}
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">JUGADOR {form.direccion === 'Entrante' ? '(si no está en el plantel, escribí el nombre abajo)' : ''}</div>
              <select value={form.jugador_id} onChange={e => seleccionarJugador(e.target.value)} style={inputIndustrial}>
                <option value="">SELECCIONAR DEL PLANTEL...</option>
                {jugadores.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.dorsal != null ? `#${j.dorsal} ` : ''}{j.nombre} {j.apellido} {j.categoria ? `(${j.categoria})` : ''}
                  </option>
                ))}
              </select>
              {form.direccion === 'Entrante' && !form.jugador_id && (
                <input type="text" value={form.jugador_nombre} onChange={e => setForm({ ...form, jugador_nombre: e.target.value })} style={{ ...inputIndustrial, marginTop: '8px' }} placeholder="Nombre del jugador entrante" />
              )}
            </div>

            {/* CLUB + CATEGORÍA */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <div className="section-title">{form.direccion === 'Entrante' ? 'CLUB DE ORIGEN' : 'CLUB DESTINO'}</div>
                <input type="text" value={form.club_destino} onChange={e => setForm({ ...form, club_destino: e.target.value })} style={inputIndustrial} placeholder="Ej: Defensores FC" />
              </div>
              <div style={{ width: '140px' }}>
                <div className="section-title">CATEGORÍA</div>
                <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={inputIndustrial}>
                  <option value="">—</option>
                  {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* FECHAS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <div className="section-title">FECHA DEL MOVIMIENTO</div>
                <input type="date" value={form.fecha_movimiento} onChange={e => setForm({ ...form, fecha_movimiento: e.target.value })} style={inputIndustrial} />
              </div>
              {form.tipo_movimiento === 'Prestamo' && (
                <div style={{ flex: 1 }}>
                  <div className="section-title">FECHA DE RETORNO</div>
                  <input type="date" value={form.fecha_retorno} onChange={e => setForm({ ...form, fecha_retorno: e.target.value })} style={inputIndustrial} />
                </div>
              )}
            </div>

            {/* ECONÓMICO */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <div className="section-title">MONTO</div>
                <input type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} style={inputIndustrial} placeholder="0" />
              </div>
              <div style={{ width: '90px' }}>
                <div className="section-title">MONEDA</div>
                <select value={form.moneda} onChange={e => setForm({ ...form, moneda: e.target.value })} style={inputIndustrial}>
                  <option value="ARS">ARS</option><option value="USD">USD</option>
                </select>
              </div>
            </div>

            {/* PRÉSTAMO: opción de compra */}
            {form.tipo_movimiento === 'Prestamo' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <div className="section-title">OPCIÓN DE COMPRA</div>
                  <input type="number" value={form.opcion_compra} onChange={e => setForm({ ...form, opcion_compra: e.target.value })} style={inputIndustrial} placeholder="Monto (opcional)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="section-title">VENCE OPCIÓN</div>
                  <input type="date" value={form.opcion_compra_vence} onChange={e => setForm({ ...form, opcion_compra_vence: e.target.value })} style={inputIndustrial} />
                </div>
              </div>
            )}

            {/* VENTA: % futura venta */}
            {form.tipo_movimiento === 'Venta' && (
              <div style={{ marginBottom: '15px' }}>
                <div className="section-title">% DE FUTURA VENTA RETENIDO <InfoBox texto="Porcentaje que tu club se queda de una futura venta del jugador (derechos / plusvalía)." /></div>
                <input type="number" value={form.porcentaje_futura_venta} onChange={e => setForm({ ...form, porcentaje_futura_venta: e.target.value })} style={inputIndustrial} placeholder="Ej: 15" />
              </div>
            )}

            {/* COMPENSACIÓN + NOTAS */}
            <div style={{ marginBottom: '15px' }}>
              <div className="section-title">COMPENSACIÓN EXTRA (no monetaria)</div>
              <input type="text" value={form.compensacion_extra} onChange={e => setForm({ ...form, compensacion_extra: e.target.value })} style={inputIndustrial} placeholder="Ej: 5 pelotas + 2 juegos de pecheras" />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <div className="section-title">NOTAS / SEGUIMIENTO</div>
              <textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} style={{ ...inputIndustrial, minHeight: '60px', resize: 'vertical' }} placeholder="Ej: Lleva 5 goles en 10 partidos, vuelve en diciembre con rodaje." />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalAbierto(false)} className="btn-secondary" style={{ flex: 1 }}>CANCELAR</button>
              <button onClick={handleGuardar} className="btn-action" style={{ flex: 1 }}>REGISTRAR</button>
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

const chipBase = { fontSize: '0.6rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.5px', whiteSpace: 'nowrap' };

const tabBtn = { border: 'none', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', padding: '10px 18px', borderRadius: '4px', fontWeight: 800, fontSize: '0.8rem' };

const selectStyle = { padding: '10px 15px', fontSize: '1rem', background: '#111', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', outline: 'none', fontWeight: 800, cursor: 'pointer', minWidth: '220px' };

const inputIndustrial = { width: '100%', padding: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px', outline: 'none', boxSizing: 'border-box' };

export default Transferencias;