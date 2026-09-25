import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { gruposFamiliares, faltaTabla, rpcInexistente, mensajeError, formatoPesos } from '../../analytics/tesoreria';

/* ══════════════════════════════════════════════════════════════════════════
   CUOTAS: TARIFAS, HERMANOS Y GENERACIÓN DEL MES

   · Cuánto paga cada categoría por mes.
   · Si la cuota se genera sola el día 1 (la genera el smart-service y le
     avisa a cada jugador), qué día vence y cómo se llama.
   · Hermanos: los jugadores con el mismo grupo familiar. Paga completo el de
     la tarifa más alta y el resto tiene el descuento del club.
   · Ver qué se generaría este mes y generarlo ya, sin esperar al día 1.

   Todo pasa por la base (migración 20260927150000): generar_cuotas_mes() es
   la misma que usa el proceso automático, así que la vista previa y lo que
   se genera son iguales.
   ══════════════════════════════════════════════════════════════════════════ */

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const nombrePeriodo = (p) => { const [a, m] = String(p || '').split('-'); return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]} ${a}` : p; };

const CONFIG_VACIA = { cuota_automatica: false, dia_vencimiento: 10, descuento_hermanos: 0, concepto: 'Cuota' };

export default function ConfigCuotas({ clubId, periodo, showToast, onGeneradas }) {
  const [estado, setEstado] = useState('cargando'); // cargando | ok | falta-migracion
  const [config, setConfig] = useState(CONFIG_VACIA);
  const [tarifas, setTarifas] = useState({}); // { categoria: monto (texto) }
  const [jugadores, setJugadores] = useState([]);
  const [previa, setPrevia] = useState(null);
  const [trabajando, setTrabajando] = useState(null);
  const [nuevoHermano, setNuevoHermano] = useState({ jugador: '', grupo: '' });

  const cargar = async () => {
    const [c, t, j] = await Promise.all([
      supabase.from('tesoreria_config').select('*').eq('club_id', clubId).maybeSingle(),
      supabase.from('tesoreria_tarifas').select('categoria, monto').eq('club_id', clubId),
      supabase.from('jugadores').select('*').eq('club_id', clubId).order('apellido'),
    ]);
    if (faltaTabla(c.error) || faltaTabla(t.error)) { setEstado('falta-migracion'); return; }
    setConfig({ ...CONFIG_VACIA, ...(c.data || {}) });
    setTarifas(Object.fromEntries((t.data || []).map((x) => [x.categoria, String(x.monto)])));
    setJugadores((j.data || []).filter((x) => x.activo !== false));
    setEstado('ok');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (clubId) cargar(); }, [clubId]);
  useEffect(() => { setPrevia(null); }, [periodo]);

  const categorias = useMemo(() => {
    const s = new Set([...jugadores.map((j) => j.categoria).filter(Boolean), ...Object.keys(tarifas)]);
    return [...s].sort((a, b) => a.localeCompare(b, 'es'));
  }, [jugadores, tarifas]);
  const cuantosPorCategoria = useMemo(() => {
    const m = {};
    jugadores.forEach((j) => { m[j.categoria] = (m[j.categoria] || 0) + 1; });
    return m;
  }, [jugadores]);
  const grupos = useMemo(() => gruposFamiliares(jugadores), [jugadores]);
  const nombreDe = (id) => { const j = jugadores.find((x) => String(x.id) === String(id)); return j ? `${j.apellido}, ${j.nombre}` : `#${id}`; };

  const guardarConfig = async () => {
    setTrabajando('config');
    const fila = {
      club_id: clubId, cuota_automatica: !!config.cuota_automatica,
      dia_vencimiento: Math.min(28, Math.max(1, parseInt(config.dia_vencimiento, 10) || 10)),
      descuento_hermanos: Math.min(100, Math.max(0, Number(config.descuento_hermanos) || 0)),
      concepto: String(config.concepto || '').trim() || 'Cuota', updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('tesoreria_config').upsert(fila, { onConflict: 'club_id' });
    setTrabajando(null);
    if (error) return showToast(mensajeError(error, 'No se pudo guardar la configuración.'), 'error');
    setConfig({ ...config, ...fila });
    setPrevia(null);
    showToast('Configuración guardada.', 'success');
  };

  const guardarTarifas = async () => {
    const filas = categorias
      .filter((c) => tarifas[c] !== undefined && tarifas[c] !== '')
      .map((c) => ({ club_id: clubId, categoria: c, monto: Math.max(0, Number(tarifas[c]) || 0), updated_at: new Date().toISOString() }));
    if (!filas.length) return showToast('Cargá al menos una tarifa.', 'error');
    setTrabajando('tarifas');
    const { error } = await supabase.from('tesoreria_tarifas').upsert(filas, { onConflict: 'club_id,categoria' });
    setTrabajando(null);
    if (error) return showToast(mensajeError(error, 'No se pudieron guardar las tarifas.'), 'error');
    setPrevia(null);
    showToast('Tarifas guardadas.', 'success');
  };

  const asignarGrupo = async (jugadorId, grupo) => {
    setTrabajando(`grupo-${jugadorId}`);
    const { error } = await supabase.rpc('asignar_grupo_familiar', { p_jugador_id: Number(jugadorId), p_grupo: grupo || '' });
    setTrabajando(null);
    if (error) return showToast(rpcInexistente(error) ? 'Falta correr la migración de tarifas.' : mensajeError(error, 'No se pudo guardar.'), 'error');
    setJugadores((js) => js.map((j) => (String(j.id) === String(jugadorId) ? { ...j, grupo_familiar: grupo || null } : j)));
    setPrevia(null);
  };

  const agregarHermano = async () => {
    if (!nuevoHermano.jugador || !nuevoHermano.grupo.trim()) return showToast('Elegí el jugador y escribí el grupo (ej. el apellido).', 'error');
    await asignarGrupo(nuevoHermano.jugador, nuevoHermano.grupo.trim());
    setNuevoHermano({ jugador: '', grupo: nuevoHermano.grupo });
  };

  const generar = async (simular) => {
    setTrabajando(simular ? 'previa' : 'generar');
    const { data, error } = await supabase.rpc('generar_cuotas_mes', { p_club_id: clubId, p_periodo: periodo, p_simular: simular });
    setTrabajando(null);
    if (error) return showToast(rpcInexistente(error) ? 'Falta correr la migración de tarifas.' : mensajeError(error, 'No se pudo generar.'), 'error');
    if (simular) { setPrevia(data || []); return; }
    setPrevia(null);
    showToast(data?.length ? `Se generaron ${data.length} cuotas.` : 'No había cuotas para generar: ya estaban todas.', data?.length ? 'success' : 'info');
    onGeneradas?.();
  };

  if (estado === 'cargando') return <div className="bento-card" style={{ textAlign: 'center', color: 'var(--text-dim)' }}>Cargando…</div>;
  if (estado === 'falta-migracion') {
    return (
      <div className="bento-card" style={{ color: 'var(--text-dim)' }}>
        Para usar las tarifas y la cuota automática falta correr la migración <code>20260927150000_tarifas_cuotas.sql</code> en Supabase.
      </div>
    );
  }

  const totalPrevia = (previa || []).reduce((a, x) => a + Number(x.monto || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. AUTOMÁTICA */}
      <div className="bento-card">
        <h3 style={{ margin: '0 0 6px', color: '#14b8a6' }}>Cuota mensual automática</h3>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Prendida, el día 1 de cada mes se genera la cuota de cada jugador activo según la tarifa de su categoría, y a cada uno le llega el aviso (en su celular, si activó los avisos en el kiosco).
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
          <input type="checkbox" checked={!!config.cuota_automatica} onChange={(e) => setConfig({ ...config, cuota_automatica: e.target.checked })} style={{ width: '22px', height: '22px', accentColor: '#14b8a6' }} />
          <strong style={{ color: 'var(--text)' }}>Generar la cuota sola cada mes</strong>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '12px' }}>
          <div><label style={lbl}>Nombre del concepto</label><input value={config.concepto} onChange={(e) => setConfig({ ...config, concepto: e.target.value })} style={input} placeholder="Cuota" /></div>
          <div><label style={lbl}>Vence el día</label><input type="number" min="1" max="28" value={config.dia_vencimiento} onChange={(e) => setConfig({ ...config, dia_vencimiento: e.target.value })} style={input} /></div>
          <div><label style={lbl}>Descuento por hermano (%)</label><input type="number" min="0" max="100" value={config.descuento_hermanos} onChange={(e) => setConfig({ ...config, descuento_hermanos: e.target.value })} style={input} /></div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '8px' }}>
          Así se va a llamar: <strong style={{ color: 'var(--text)' }}>{(config.concepto || 'Cuota').trim()} {nombrePeriodo(periodo)}</strong>, con vencimiento el {config.dia_vencimiento || 10} de cada mes.
        </div>
        <button onClick={guardarConfig} disabled={trabajando === 'config'} style={{ ...btn('#14b8a6', '#000'), marginTop: '14px' }}>{trabajando === 'config' ? 'GUARDANDO…' : 'GUARDAR'}</button>
      </div>

      {/* 2. TARIFAS */}
      <div className="bento-card">
        <h3 style={{ margin: '0 0 6px', color: '#3b82f6' }}>Tarifa mensual por categoría</h3>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>Una categoría sin tarifa (o en $0) no genera cuota.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {categorias.map((c) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px', color: 'var(--text)', fontWeight: 'bold' }}>
                {c} <span style={{ color: 'var(--text-dim)', fontWeight: 'normal', fontSize: '0.75rem' }}>· {cuantosPorCategoria[c] || 0} jugadores</span>
              </div>
              <div style={{ flex: '0 1 180px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-dim)' }}>$</span>
                <input type="number" min="0" inputMode="decimal" value={tarifas[c] ?? ''} onChange={(e) => setTarifas({ ...tarifas, [c]: e.target.value })} style={input} placeholder="Sin tarifa" />
              </div>
            </div>
          ))}
          {categorias.length === 0 && <div style={{ color: 'var(--text-dim)' }}>No hay jugadores cargados.</div>}
        </div>
        <button onClick={guardarTarifas} disabled={trabajando === 'tarifas'} style={{ ...btn('#3b82f6', '#fff'), marginTop: '14px' }}>{trabajando === 'tarifas' ? 'GUARDANDO…' : 'GUARDAR TARIFAS'}</button>
      </div>

      {/* 3. HERMANOS */}
      <div className="bento-card">
        <h3 style={{ margin: '0 0 6px', color: '#a855f7' }}>Hermanos</h3>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Los jugadores con el mismo grupo familiar son hermanos. Paga completo el de la tarifa más alta y los demás tienen {Number(config.descuento_hermanos) || 0}% de descuento.
        </p>
        {grupos.map((g) => (
          <div key={g.clave} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 900, color: 'var(--text)', marginBottom: '6px' }}>👨‍👩‍👧 {g.nombre} {g.miembros.length < 2 && <span style={{ color: '#f59e0b', fontSize: '0.7rem', fontWeight: 'bold' }}>(falta el otro hermano)</span>}</div>
            {g.miembros.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '3px 0' }}>
                <span style={{ color: 'var(--text)' }}>{m.apellido}, {m.nombre} <span style={{ color: 'var(--text-dim)' }}>· {m.categoria}</span></span>
                <button onClick={() => asignarGrupo(m.id, '')} disabled={trabajando === `grupo-${m.id}`} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '6px' }}>quitar</button>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '8px', alignItems: 'end', marginTop: '8px' }}>
          <div>
            <label style={lbl}>Jugador</label>
            <select value={nuevoHermano.jugador} onChange={(e) => setNuevoHermano({ ...nuevoHermano, jugador: e.target.value })} style={input}>
              <option value="">Elegí…</option>
              {jugadores.map((j) => <option key={j.id} value={j.id}>{j.apellido}, {j.nombre} · {j.categoria}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Grupo familiar</label>
            <input list="grupos-familiares" value={nuevoHermano.grupo} onChange={(e) => setNuevoHermano({ ...nuevoHermano, grupo: e.target.value })} style={input} placeholder="Ej: Pérez" />
            <datalist id="grupos-familiares">{grupos.map((g) => <option key={g.clave} value={g.nombre} />)}</datalist>
          </div>
          <button onClick={agregarHermano} disabled={!!trabajando} style={btn('#a855f7', '#fff')}>+ AGREGAR</button>
        </div>
      </div>

      {/* 4. EL MES */}
      <div className="bento-card">
        <h3 style={{ margin: '0 0 6px', color: '#00ff88' }}>Cuotas de {nombrePeriodo(periodo).toLowerCase()}</h3>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
          Mirá qué se generaría y, si está bien, generalas ya. No se duplican: a quien ya tiene la cuota del mes no se le vuelve a generar.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => generar(true)} disabled={!!trabajando} style={{ ...btn('transparent', 'var(--text)'), border: '1px solid var(--border)' }}>{trabajando === 'previa' ? 'CALCULANDO…' : '👁 VER QUÉ SE GENERARÍA'}</button>
          {previa && previa.length > 0 && (
            <button onClick={() => { if (window.confirm(`¿Generar ${previa.length} cuotas por ${formatoPesos(totalPrevia)}?`)) generar(false); }} disabled={!!trabajando} style={btn('#00ff88', '#000')}>
              {trabajando === 'generar' ? 'GENERANDO…' : `GENERAR ${previa.length} CUOTAS`}
            </button>
          )}
        </div>
        {previa && (
          previa.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', marginTop: '12px', fontSize: '0.85rem' }}>No hay nada para generar: ya las tienen todos, o falta cargar tarifas.</div>
          ) : (
            <div style={{ marginTop: '12px', maxHeight: '320px', overflowY: 'auto' }}>
              {previa.map((x) => (
                <div key={x.jugador_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '6px 0', borderBottom: '1px dashed var(--border)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text)' }}>{nombreDe(x.jugador_id)} <span style={{ color: 'var(--text-dim)' }}>· {x.categoria}</span></span>
                  <span style={{ color: 'var(--text)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {formatoPesos(x.monto)}
                    {Number(x.descuento) > 0 && <span style={{ color: '#a855f7', fontSize: '0.7rem', marginLeft: '6px' }}>−{formatoPesos(x.descuento)} hermano</span>}
                  </span>
                </div>
              ))}
              <div style={{ textAlign: 'right', fontWeight: 900, color: 'var(--text)', paddingTop: '8px' }}>Total: {formatoPesos(totalPrevia)}</div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

const lbl = { fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' };
const input = { width: '100%', padding: '10px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', outline: 'none', fontSize: '16px', boxSizing: 'border-box' };
const btn = (bg, color) => ({ background: bg, color, border: 'none', borderRadius: '8px', padding: '12px 16px', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', minHeight: '44px' });
