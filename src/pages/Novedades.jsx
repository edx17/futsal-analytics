import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';

const EMOJIS = ['⚽', '🏋️‍♂️', '🏆', '⚠️', '🗓️', '🏥', '📊', '🔥', '🚌', '🍔', '💪', '🧠', '✅', '❌', '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🫠', '🤑', '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦','💀','☠️','👻','👽','🤖','🎃'];

const OPCIONES_VENCIMIENTO = [
  { label: 'Sin vencimiento', value: null },
  { label: '1 día',          value: 1 },
  { label: '3 días',         value: 3 },
  { label: '7 días',         value: 7 },
  { label: '15 días',        value: 15 },
  { label: '30 días',        value: 30 },
];

function calcularVencimiento(dias) {
  if (!dias) return null;
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

function labelVencimiento(fechaISO) {
  if (!fechaISO) return null;
  const diff = Math.ceil((new Date(fechaISO) - new Date()) / 86400000);
  if (diff <= 0) return 'Vencida';
  if (diff === 1) return 'Vence mañana';
  return `Vence en ${diff}d`;
}

export default function Novedades() {
  const { perfil } = useAuth();
  const { showToast } = useToast();

  const [mensaje, setMensaje] = useState('');
  const [publico, setPublico] = useState('Ambos');
  const [categoriasDestino, setCategoriasDestino] = useState([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [diasVencimiento, setDiasVencimiento] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [mostrarEmojis, setMostrarEmojis] = useState(false);
  const [eliminando, setEliminando] = useState(null);

  const club_id = localStorage.getItem('club_id') || 'club_default';
  const esCT = perfil?.rol === 'ct';
  const puedeEliminarTodo = ['superuser', 'admin', 'manager'].includes(perfil?.rol);

  const misCategorias = useMemo(
    () => perfil?.categorias_asignadas || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(perfil?.categorias_asignadas)]
  );

  useEffect(() => {
    if (!perfil || club_id === 'club_default') return;
    const cargar = async () => {
      await Promise.all([fetchCategorias(), fetchHistorial()]);
    };
    cargar();
  }, [perfil, club_id]);

  const fetchCategorias = async () => {
    if (club_id === 'club_default') return;
    const { data, error } = await supabase
      .from('jugadores')
      .select('categoria')
      .eq('club_id', club_id);
    if (error) { console.error('fetchCategorias:', error); return; }
    let unicas = [...new Set((data || []).map(j => j.categoria).filter(Boolean))].sort();
    if (esCT && misCategorias.length > 0) {
      unicas = unicas.filter(c => misCategorias.includes(c));
    }
    setCategoriasDisponibles(unicas);
  };

  const fetchHistorial = async () => {
    if (club_id === 'club_default') return;
    const { data, error } = await supabase
      .from('novedades')
      .select('*, perfiles(nombre_completo, rol)')
      .eq('club_id', club_id)
      .order('fecha_creacion', { ascending: false })
      .limit(20);
    if (error) { console.error('fetchHistorial:', error); return; }

    // Filtrar vencidas — las que tienen fecha_vencimiento pasada no se muestran
    const ahora = new Date();
    let resultado = (data || []).filter(h =>
      !h.fecha_vencimiento || new Date(h.fecha_vencimiento) > ahora
    );

    if (esCT && misCategorias.length > 0) {
      resultado = resultado.filter(h =>
        Array.isArray(h.categorias) &&
        h.categorias.some(c => misCategorias.includes(c))
      );
    }
    setHistorial(resultado);
  };

  const toggleCategoria = (cat) => {
    setCategoriasDestino(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const seleccionarTodas = () => {
    setCategoriasDestino(
      categoriasDestino.length === categoriasDisponibles.length
        ? [] : [...categoriasDisponibles]
    );
  };

  const insertarEmoji = (emoji) => {
    setMensaje(prev => prev + emoji);
    setMostrarEmojis(false);
  };

  const enviarNovedad = async (e) => {
    e.preventDefault();
    if (!mensaje.trim()) return showToast('El mensaje no puede estar vacío.', 'error');
    if (categoriasDestino.length === 0) return showToast('Seleccioná al menos una categoría.', 'warning');
    if (!perfil?.id) return showToast('Error de sesión. Volvé a iniciar sesión.', 'error');

    setLoading(true);
    const { error } = await supabase.from('novedades').insert([{
      club_id,
      autor_id: perfil.id,
      publico_objetivo: publico,
      categorias: categoriasDestino,
      mensaje: mensaje.trim(),
      fecha_vencimiento: calcularVencimiento(diasVencimiento),
    }]);
    setLoading(false);

    if (error) {
      console.error('INSERT novedades:', error);
      showToast(error.code === '42501'
        ? 'Sin permiso para publicar. Verificá tu rol.'
        : `Error: ${error.message}`, 'error');
      return;
    }

    showToast('Novedad publicada ✅', 'success');
    setMensaje('');
    setCategoriasDestino([]);
    setDiasVencimiento(null);
    fetchHistorial();
  };

  const eliminarNovedad = async (id) => {
    setEliminando(id);
    const { error } = await supabase.from('novedades').delete().eq('id', id);
    setEliminando(null);
    if (error) {
      showToast('No se pudo eliminar.', 'error');
      return;
    }
    showToast('Novedad eliminada.', 'success');
    setHistorial(prev => prev.filter(h => h.id !== id));
  };

  const todasSeleccionadas =
    categoriasDisponibles.length > 0 &&
    categoriasDestino.length === categoriasDisponibles.length;

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff', margin: 0 }}>
          CENTRO DE <span style={{ color: 'var(--accent)' }}>COMUNICACIONES</span>
        </h1>
      </div>

      {/* ── FORMULARIO ── */}
      <div className="bento-card" style={{ marginBottom: '20px' }}>
        <form onSubmit={enviarNovedad} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="stat-label">PÚBLICO OBJETIVO</label>
              <select value={publico} onChange={(e) => setPublico(e.target.value)} style={inputBase}>
                <option value="Ambos">TODOS (CT Y JUGADORES)</option>
                <option value="Jugadores">SÓLO JUGADORES</option>
                <option value="CT">SÓLO CUERPO TÉCNICO</option>
              </select>
            </div>
            <div>
              <label className="stat-label">VENCIMIENTO</label>
              <select
                value={diasVencimiento ?? ''}
                onChange={(e) => setDiasVencimiento(e.target.value ? Number(e.target.value) : null)}
                style={inputBase}
              >
                {OPCIONES_VENCIMIENTO.map(o => (
                  <option key={o.label} value={o.value ?? ''}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="stat-label">
              CATEGORÍAS DESTINO
              {esCT && (
                <span style={{ color: '#666', fontWeight: 400, fontSize: '0.65rem', marginLeft: '8px' }}>
                  (según tus permisos)
                </span>
              )}
            </label>
            {categoriasDisponibles.length === 0 ? (
              <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '8px' }}>
                {esCT ? 'Sin categorías asignadas. Pedile al manager que te asigne permisos.' : 'No hay categorías en este club todavía.'}
              </p>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '5px' }}>
                <button type="button" onClick={seleccionarTodas}
                  style={{ ...btnFiltro, background: todasSeleccionadas ? 'var(--accent)' : '#111', color: todasSeleccionadas ? '#000' : 'var(--text-dim)' }}>
                  TODAS
                </button>
                {categoriasDisponibles.map(cat => (
                  <button key={cat} type="button" onClick={() => toggleCategoria(cat)}
                    style={{ ...btnFiltro, background: categoriasDestino.includes(cat) ? 'var(--accent)' : '#111', color: categoriasDestino.includes(cat) ? '#000' : 'var(--text-dim)' }}>
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <label className="stat-label">MENSAJE</label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows="4"
              style={{ ...inputBase, resize: 'none' }}
              placeholder="Escribí la novedad acá..."
            />
            <button type="button" onClick={() => setMostrarEmojis(!mostrarEmojis)}
              style={{ position: 'absolute', right: '10px', top: '35px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>
              😀
            </button>
            {mostrarEmojis && (
              <div style={{ position: 'absolute', right: '0', top: '70px', background: '#111', border: '1px solid #333', padding: '10px', borderRadius: '8px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', zIndex: 10 }}>
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => insertarEmoji(e)}
                    style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={loading || categoriasDisponibles.length === 0}
            style={{ background: 'var(--accent)', color: '#000', fontWeight: 900, padding: '15px', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', textTransform: 'uppercase', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'ENVIANDO...' : '📢 PUBLICAR NOVEDAD'}
          </button>
        </form>
      </div>

      {/* ── HISTORIAL ── */}
      <div className="bento-card">
        <h3 className="stat-label" style={{ marginBottom: '15px' }}>ÚLTIMOS ENVÍOS</h3>
        {historial.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>No hay novedades activas.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {historial.map(h => {
              const esPropio = h.autor_id === perfil?.id;
              const puedeEliminar = esPropio || puedeEliminarTodo;
              const labelVenc = labelVencimiento(h.fecha_vencimiento);

              return (
                <div key={h.id} style={{ background: '#000', border: '1px solid #222', padding: '15px', borderRadius: '6px', position: 'relative' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px dashed #333', paddingBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800 }}>
                      {h.perfiles?.nombre_completo || 'Desconocido'}
                      {' '}({h.perfiles?.rol?.toUpperCase() || 'N/A'})
                      {' '}➔{' '}
                      <span style={{ color: 'var(--accent)' }}>{h.publico_objetivo.toUpperCase()}</span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Badge vencimiento */}
                      {labelVenc && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 900, padding: '2px 7px', borderRadius: '20px',
                          background: labelVenc === 'Vence mañana' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                          color: labelVenc === 'Vence mañana' ? '#ef4444' : '#888',
                          border: `1px solid ${labelVenc === 'Vence mañana' ? '#ef4444' : '#333'}`
                        }}>
                          ⏱ {labelVenc}
                        </span>
                      )}
                      <span style={{ fontSize: '0.65rem', color: '#888' }}>
                        {new Date(h.fecha_creacion).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Mensaje */}
                  <p style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: '1.5', paddingRight: puedeEliminar ? '30px' : '0' }}>
                    {h.mensaje}
                  </p>

                  {/* Categorías */}
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {(h.categorias || []).map(c => (
                      <span key={c} style={{ background: '#222', color: 'var(--accent)', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900 }}>
                        {c}
                      </span>
                    ))}
                  </div>

                  {/* Botón eliminar */}
                  {puedeEliminar && (
                    <button
                      onClick={() => eliminarNovedad(h.id)}
                      disabled={eliminando === h.id}
                      title="Eliminar novedad"
                      style={{
                        position: 'absolute', top: '12px', right: '12px',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#555', fontSize: '1rem', lineHeight: 1, padding: '2px',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#555'}
                    >
                      {eliminando === h.id ? '...' : '✕'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const inputBase = {
  width: '100%', padding: '12px', background: '#000',
  border: '1px solid var(--border)', color: '#fff', borderRadius: '4px',
  outline: 'none', marginTop: '5px', boxSizing: 'border-box'
};
const btnFiltro = {
  padding: '8px 14px', borderRadius: '20px', border: '1px solid var(--border)',
  fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', transition: '0.2s', outline: 'none'
};