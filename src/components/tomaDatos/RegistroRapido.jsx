import React, { useMemo, useState } from 'react';
import { Icono } from '../../iconos';
import { MODOS_TOMA, ACCIONES_RAPIDAS, etiquetaAccion, camisetasRepetidas } from '../../analytics/tomaRapida';

/* ══════════════════════════════════════════════════════════════════════════
   TOMA DE DATOS: SIMPLIFICADA Y POR VOZ

   · SelectorModo: antes de empezar, tradicional / simplificada / por voz, y
     (para las dos rápidas) qué número de camiseta usa hoy cada convocado.
   · PanelSimplificado: tocaste la cancha → camiseta → acción. En los goles,
     además, quién asistió. Lateral y córner, como siempre.
   · PanelVoz: lo que se está escuchando y lo que se entendió. Si no se
     entendió todo, abre el panel simplificado con lo que sí.
   La lógica (qué se guarda, cómo se interpreta lo dictado) está en
   analytics/tomaRapida.js.
   ══════════════════════════════════════════════════════════════════════════ */

const nombreCorto = (j) => String(j?.apellido || j?.nombre || '').toUpperCase();

/* ── Selector de modo ──────────────────────────────────────────────────── */

export function SelectorModo({ modoActual, jugadores = [], camisetas = {}, vozDisponible, onConfirmar, onCerrar }) {
  const [modo, setModo] = useState(modoActual || 'tradicional');
  const [paso, setPaso] = useState('modo');
  const [nums, setNums] = useState(camisetas);
  const repetidas = camisetasRepetidas(nums);
  const ordenados = useMemo(
    () => [...jugadores].sort((a, b) => (Number(nums[String(a.id)]) || 999) - (Number(nums[String(b.id)]) || 999)),
    // El orden se fija al abrir: no salta mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jugadores],
  );

  const seguir = () => {
    if (modo === 'tradicional') { onConfirmar(modo, null); return; }
    // Los jugadores pueden haber llegado después de abrir el selector: se
    // completa con lo que ya había y, si falta, con el dorsal.
    setNums((prev) => {
      const sig = { ...prev };
      jugadores.forEach((j) => {
        const id = String(j.id);
        if (!sig[id]) sig[id] = camisetas[id] || (j.dorsal != null ? String(j.dorsal) : '');
      });
      return sig;
    });
    setPaso('camisetas');
  };

  return (
    <div style={overlay}>
      <div style={{ ...caja, maxWidth: paso === 'camisetas' ? 520 : 460 }}>
        {paso === 'modo' && (
          <>
            <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: 6 }}>¿CÓMO VAS A CARGAR ESTE PARTIDO?</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 14 }}>Lo podés cambiar después desde el menú.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODOS_TOMA.map((m) => {
                const activo = modo === m.id;
                const sinVoz = m.id === 'voz' && !vozDisponible;
                return (
                  <button key={m.id} onClick={() => setModo(m.id)} style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
                    background: activo ? 'rgba(0,255,136,0.08)' : 'var(--bg)', color: 'var(--text)',
                  }}>
                    <div style={{ fontWeight: 900, fontSize: '0.9rem', color: activo ? 'var(--accent)' : 'var(--text)' }}>
                      <Icono nombre={m.id === 'voz' ? 'microfono' : m.id === 'simplificada' ? 'rayo' : 'lista'} size="1.1em" style={{ marginRight: 8 }} />
                      {m.nombre}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>{m.ayuda}</div>
                    {sinVoz && <div style={{ fontSize: '0.7rem', color: '#f59e0b', marginTop: 4 }}>Este navegador no reconoce voz: probá con Chrome. Si no, se usa la simplificada.</div>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              {onCerrar && <button onClick={onCerrar} style={btnSec}>CANCELAR</button>}
              <button onClick={seguir} style={btnPri}>{modo === 'tradicional' ? 'EMPEZAR' : 'SIGUIENTE: CAMISETAS'}</button>
            </div>
          </>
        )}

        {paso === 'camisetas' && (
          <>
            <div className="stat-label" style={{ color: 'var(--accent)', marginBottom: 6 }}>CAMISETAS DE HOY</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.4 }}>
              El número con el que juega hoy cada convocado. Es el botón que vas a tocar
              {modo === 'voz' ? ' y el número que vas a decir' : ''}. Se recuerda para el próximo partido.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
              {ordenados.map((j) => {
                const id = String(j.id);
                const rep = repetidas.includes(nums[id]);
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, background: 'var(--bg)', border: `1px solid ${rep ? '#ef4444' : 'var(--border)'}` }}>
                    <input inputMode="numeric" value={nums[id] || ''} maxLength={2}
                      onChange={(e) => setNums((n) => ({ ...n, [id]: e.target.value.replace(/\D/g, '') }))}
                      style={{ width: 46, padding: '8px 4px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 6 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreCorto(j)}</span>
                  </label>
                );
              })}
            </div>
            {repetidas.length > 0 && <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 10 }}>Hay números repetidos ({repetidas.join(', ')}): cada camiseta tiene que ser de uno solo.</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setPaso('modo')} style={btnSec}>ATRÁS</button>
              <button disabled={repetidas.length > 0} onClick={() => onConfirmar(modo, nums)} style={{ ...btnPri, opacity: repetidas.length ? 0.5 : 1 }}>EMPEZAR</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Panel simplificado ────────────────────────────────────────────────── */

/**
 * `inicial`: lo que ya se sabe (por ejemplo, lo que se entendió por voz):
 * { equipo, jugadorId, accion }.
 */
export function PanelSimplificado({ enCancha = [], camisetas = {}, inicial = null, aviso = null, onGuardar, onCancelar, onABP, onCompleto }) {
  const [equipo, setEquipo] = useState(inicial?.equipo || null);
  const [jugadorId, setJugadorId] = useState(inicial?.jugadorId ? String(inicial.jugadorId) : null);
  const [accion, setAccion] = useState(inicial?.accion || null);
  const [pidiendoAsistencia, setPidiendoAsistencia] = useState(false);

  const autorElegido = equipo === 'Rival' || (equipo === 'Propio' && jugadorId);
  const conNumero = (j) => camisetas[String(j.id)] ?? j.dorsal ?? '?';

  const elegirJugador = (id) => {
    setEquipo('Propio'); setJugadorId(String(id));
    if (accion) terminar('Propio', String(id), accion);
  };
  const elegirRival = () => {
    setEquipo('Rival'); setJugadorId(null);
    if (accion) terminar('Rival', null, accion);
  };
  const elegirAccion = (acc) => {
    setAccion(acc);
    if (autorElegido) terminar(equipo, jugadorId, acc);
  };
  const terminar = (eq, jid, acc) => {
    if (acc === 'Remate - Gol' && eq === 'Propio') { setPidiendoAsistencia(true); return; }
    onGuardar({ equipo: eq, jugadorId: jid, accion: acc, asistenciaId: null });
  };

  if (pidiendoAsistencia) {
    return (
      <div>
        <Cabecera titulo="¿QUIÉN ASISTIÓ?" onCancelar={onCancelar} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8, marginTop: 12 }}>
          {enCancha.filter((j) => String(j.id) !== jugadorId).map((j) => (
            <BotonCamiseta key={j.id} numero={conNumero(j)} nombre={nombreCorto(j)} color="#06b6d4"
              onClick={() => onGuardar({ equipo: 'Propio', jugadorId, accion: 'Remate - Gol', asistenciaId: String(j.id) })} />
          ))}
        </div>
        <button onClick={() => onGuardar({ equipo: 'Propio', jugadorId, accion: 'Remate - Gol', asistenciaId: null })} style={{ ...btnSec, width: '100%', marginTop: 12, borderStyle: 'dashed' }}>
          SIN ASISTENCIA (JUGADA INDIVIDUAL)
        </button>
      </div>
    );
  }

  return (
    <div>
      <Cabecera titulo={autorElegido ? 'ACCIÓN' : '¿QUIÉN?'} onCancelar={onCancelar} />
      {aviso && <div style={{ fontSize: '0.75rem', color: '#f59e0b', margin: '8px 0 0', lineHeight: 1.4 }}>{aviso}</div>}

      {/* camisetas de los que están en cancha + rival */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8, marginTop: 12 }}>
        {enCancha.map((j) => (
          <BotonCamiseta key={j.id} numero={conNumero(j)} nombre={nombreCorto(j)} activo={equipo === 'Propio' && jugadorId === String(j.id)} onClick={() => elegirJugador(j.id)} />
        ))}
        <button onClick={elegirRival} style={{
          minHeight: 64, borderRadius: 10, cursor: 'pointer', fontWeight: 900, fontSize: '0.85rem',
          border: `2px solid ${equipo === 'Rival' ? '#fff' : '#555'}`, background: equipo === 'Rival' ? 'rgba(255,255,255,0.15)' : 'transparent', color: '#fff',
        }}>RIVAL</button>
      </div>

      <div className="stat-label" style={{ fontSize: '0.6rem', margin: '14px 0 8px' }}>
        {autorElegido ? (equipo === 'Rival' ? 'ACCIÓN DEL RIVAL' : `ACCIÓN DE #${camisetas[jugadorId] ?? ''}`) : 'O ELEGÍ PRIMERO LA ACCIÓN'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        {ACCIONES_RAPIDAS.map((a) => (
          <button key={a.accion} onClick={() => elegirAccion(a.accion)} className="btn-action" style={{
            gridColumn: a.ancho ? 'span 2' : undefined, minHeight: 48, borderRadius: 8, cursor: 'pointer', fontWeight: 900, fontSize: '0.8rem',
            border: `1px solid ${a.color}`, color: accion === a.accion ? '#000' : a.color,
            background: accion === a.accion ? a.color : 'rgba(255,255,255,0.03)',
          }}>{a.accion === 'Falta cometida' && equipo === 'Rival' ? 'FALTA (DEL RIVAL)' : a.etiqueta}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
        <button onClick={() => onABP('Lateral')} style={{ ...btnChico, borderColor: '#06b6d4', color: '#06b6d4' }}>LATERAL</button>
        <button onClick={() => onABP('Córner')} style={{ ...btnChico, borderColor: '#f97316', color: '#f97316' }}>CÓRNER</button>
        <button onClick={onCompleto} style={btnChico}>MÁS… (COMPLETA)</button>
      </div>
    </div>
  );
}

/* ── Panel de voz ──────────────────────────────────────────────────────── */

/**
 * estado: { fase: 'escuchando' | 'pensando' | 'guardado' | 'error', texto, resultado, error }
 */
export function PanelVoz({ estado, camisetas, onListo, onCancelar, onReintentar }) {
  const { fase, texto, resultado, error } = estado || {};
  return (
    <div style={{ textAlign: 'center' }}>
      <Cabecera titulo="POR VOZ" onCancelar={onCancelar} />
      {fase === 'escuchando' && (
        <>
          <div className="td-mic" style={{ margin: '18px auto 10px' }}><Icono nombre="microfono" size="2.2em" /></div>
          <style>{'.td-mic{width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#ef4444;color:#fff;box-shadow:0 0 0 0 rgba(239,68,68,.6);animation:tdMic 1.2s infinite}@keyframes tdMic{0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 22px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}@media (prefers-reduced-motion:reduce){.td-mic{animation:none}}'}</style>
          <div style={{ fontWeight: 900, color: 'var(--text)' }}>Escuchando…</div>
          <div style={{ minHeight: 28, margin: '8px 0', fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 800 }}>{texto || ' '}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: 14 }}>Ej.: "7 remate desviado" · "remate rival atajado" · "gol del 10 asistencia del 4"</div>
          <button onClick={onListo} style={{ ...btnPri, width: '100%' }}>LISTO</button>
        </>
      )}
      {fase === 'pensando' && <div style={{ padding: 30, color: 'var(--text-dim)' }}>Interpretando "{texto}"…</div>}
      {fase === 'guardado' && resultado && (
        <div style={{ padding: '22px 0' }}>
          <div style={{ fontSize: '2.2rem', color: 'var(--accent)' }}><Icono nombre="listo" size="1.2em" /></div>
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text)', marginTop: 6 }}>
            {resultado.equipo === 'Rival' ? 'RIVAL' : `#${camisetas?.[resultado.jugadorId] ?? resultado.dorsal}`} · {etiquetaAccion(resultado.accion)}
            {resultado.asistenciaId ? ` · asist. #${camisetas?.[resultado.asistenciaId]}` : ''}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 6 }}>"{texto}" · si no era eso, tocá DESHACER</div>
        </div>
      )}
      {fase === 'error' && (
        <div style={{ padding: '18px 0' }}>
          <div style={{ color: '#ef4444', fontWeight: 800, marginBottom: 12, lineHeight: 1.4 }}>{error}</div>
          <button onClick={onReintentar} style={{ ...btnPri, width: '100%' }}>VOLVER A INTENTAR</button>
        </div>
      )}
    </div>
  );
}

/* ── piezas ── */

function Cabecera({ titulo, onCancelar }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
      <div className="stat-label">{titulo}</div>
      <button aria-label="Cerrar" onClick={onCancelar} style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: '1.2rem', cursor: 'pointer', display: 'flex' }}><Icono nombre="cerrar" size="1em" /></button>
    </div>
  );
}

function BotonCamiseta({ numero, nombre, activo, color = 'var(--accent)', onClick }) {
  return (
    <button onClick={onClick} style={{
      minHeight: 64, borderRadius: 10, cursor: 'pointer', padding: '6px 4px',
      border: `2px solid ${activo ? color : 'var(--border)'}`, background: activo ? 'rgba(0,255,136,0.15)' : 'var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'JetBrains Mono, monospace', color, lineHeight: 1 }}>{numero}</span>
      <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--text-dim)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
    </button>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 16 };
const caja = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, width: '100%', maxHeight: '92dvh', overflowY: 'auto', boxSizing: 'border-box' };
const btnPri = { flex: 1, padding: '14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 900, cursor: 'pointer' };
const btnSec = { flex: 1, padding: '14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 800, cursor: 'pointer' };
const btnChico = { padding: '10px 4px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' };
