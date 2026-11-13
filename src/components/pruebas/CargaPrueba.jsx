import React, { useMemo, useState } from 'react';
import { bloquesDeEtapa } from '../../pruebas/rubrica';
import { edadRelativa } from '../../pruebas/edadRelativa';
import { crearSesion, guardarCandidato } from '../../pruebas/datos';
import { useColaPruebas, claveDePuntaje } from '../../pruebas/useColaPruebas';
import { MONO, ACENTO, dim, rotulo, input, boton, botonSec, chip, campo } from './estilos';

/* PRUEBAS · CARGA (mobile first)
 *
 * Elegís la sesión (o creás una), el candidato y vas bloque por bloque:
 * tap de 1 a 5 con el descriptor a la vista, dato objetivo cuando el criterio
 * lo tiene (goles / intentos) y comentario opcional. Cada tap se guarda en el
 * teléfono y se sube solo (cola offline, como en la toma de datos).
 * Cada evaluador ve sólo sus puntajes hasta que se cierra la carga.
 */

const hoy = () => new Date().toISOString().slice(0, 10);
const DESCRIPTOR_INTERMEDIO = { 2: 'Entre 1 y 3.', 4: 'Entre 3 y 5.' };

export default function CargaPrueba({ clubId, categoria, yo, sesiones, candidatos, evaluaciones, cierres, recargar, puedeCargar, avisar }) {
  const cola = useColaPruebas(yo);
  const [sesionId, setSesionId] = useState(sesiones[0]?.id || '');
  const [candidatoId, setCandidatoId] = useState('');
  const [nBloque, setNBloque] = useState(0);
  const [nueva, setNueva] = useState(null);
  // Lo que marqué en esta pantalla (ya subido o en la cola): se ve al instante sin volver a leer la base.
  const [locales, setLocales] = useState(() => new Map());

  const sesion = sesiones.find((s) => s.id === sesionId) || null;
  const etapa = sesion?.etapa || 1;

  // Quién se puede evaluar en esta sesión.
  const decididos1 = useMemo(() => new Map(cierres.filter((c) => c.etapa === 1 && c.estado === 'decidido').map((c) => [c.candidato_id, c.decision])), [cierres]);
  const cerrados = useMemo(() => new Set(cierres.map((c) => `${c.candidato_id}|${c.etapa}`)), [cierres]);
  const evaluables = candidatos.filter((c) => !['incorporado', 'descartado'].includes(c.estado))
    .filter((c) => (etapa === 2 ? decididos1.has(c.id) && decididos1.get(c.id) !== 'no_incorporar' : true));
  const candidato = evaluables.find((c) => c.id === candidatoId) || null;
  const cerrada = candidato ? cerrados.has(`${candidato.id}|${etapa}`) : false;
  // Los bloques dependen del puesto (el arquero tiene los suyos).
  const bloques = bloquesDeEtapa(etapa, candidato?.puesto_principal);
  const bloque = bloques[Math.min(nBloque, bloques.length - 1)];

  // Mis puntajes: los de la base más los que están en la cola (la cola manda).
  const mios = useMemo(() => {
    const m = new Map();
    evaluaciones.filter((e) => e.evaluador_id === yo).forEach((e) => m.set(claveDePuntaje(e), e));
    locales.forEach((f, k) => m.set(k, f));
    cola.enCola().forEach((f, k) => m.set(k, f));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluaciones, yo, locales, cola.pendientes]);
  const puntajeDe = (criterio) => mios.get(claveDePuntaje({ sesion_id: sesionId, candidato_id: candidatoId, evaluador_id: yo, bloque: bloque.id, criterio })) || null;
  const completos = (b) => b.criterios.every((c) => mios.has(claveDePuntaje({ sesion_id: sesionId, candidato_id: candidatoId, evaluador_id: yo, bloque: b.id, criterio: c.id })));

  const marcar = (criterio, cambios) => {
    const actual = puntajeDe(criterio.id) || {};
    const puntaje = cambios.puntaje ?? actual.puntaje;
    if (!puntaje) return;
    const fila = {
      club_id: clubId, categoria, sesion_id: sesionId, candidato_id: candidatoId, bloque: bloque.id, criterio: criterio.id,
      puntaje, dato_objetivo: 'dato_objetivo' in cambios ? cambios.dato_objetivo : actual.dato_objetivo ?? null,
      comentario: 'comentario' in cambios ? cambios.comentario : actual.comentario ?? null,
    };
    cola.agregar(fila);
    setLocales((m) => new Map(m).set(claveDePuntaje({ ...fila, evaluador_id: yo }), { ...fila, evaluador_id: yo }));
  };

  const crear = async () => {
    try {
      const s = await crearSesion({ clubId, categoria, fecha: nueva.fecha, etapa: Number(nueva.etapa), evaluadores: [yo] });
      setNueva(null); await recargar(); setSesionId(s.id); setCandidatoId(''); setNBloque(0);
      avisar?.(`Sesión del ${s.fecha} (etapa ${s.etapa}) creada.`);
    } catch (err) { avisar?.(err?.message || 'No se pudo crear la sesión.', true); }
  };

  if (!puedeCargar) return <div className="bento-card" style={{ padding: 20, ...dim }}>Cargan puntajes el cuerpo técnico (CT), el manager y el superusuario.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Indicador de la cola */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: cola.pendientes ? '#fbbf24' : ACENTO }}>
          {cola.pendientes ? `${cola.pendientes} SIN SUBIR` : '✓ TODO SUBIDO'}
        </span>
        {cola.pendientes > 0 && <button style={{ ...chip(false), minHeight: 32 }} onClick={cola.reintentar}>REINTENTAR</button>}
        {cola.error && <span style={{ fontSize: 11, color: '#ef4444' }}>{cola.error}</span>}
      </div>

      {/* Sesión */}
      <div className="bento-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={rotulo}>SESIÓN</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...input, flex: 1, minWidth: 180 }} value={sesionId} onChange={(e) => { setSesionId(e.target.value); setCandidatoId(''); setNBloque(0); }} aria-label="Sesión">
            <option value="">Elegí una sesión…</option>
            {sesiones.map((s) => <option key={s.id} value={s.id}>{s.fecha} · Etapa {s.etapa}</option>)}
          </select>
          <button style={botonSec} onClick={() => setNueva(nueva ? null : { fecha: hoy(), etapa: 1 })}>{nueva ? 'CANCELAR' : '+ SESIÓN'}</button>
        </div>
        {nueva && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ ...campo, flex: 1, minWidth: 140 }}>FECHA<input type="date" style={input} value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} /></label>
            <label style={{ ...campo, width: 130 }}>ETAPA
              <select style={input} value={nueva.etapa} onChange={(e) => setNueva({ ...nueva, etapa: e.target.value })}>
                <option value={1}>1 · Evaluación</option><option value={2}>2 · Juego real</option>
              </select>
            </label>
            <button style={boton} onClick={crear}>CREAR</button>
          </div>
        )}
      </div>

      {sesion && (
        <div className="bento-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={rotulo}>CANDIDATO {etapa === 2 && '· sólo los que no quedaron en "No incorporar" en la etapa 1'}</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {evaluables.length === 0 && <span style={dim}>{etapa === 2 ? 'Nadie tiene la etapa 1 decidida para pasar al juego real.' : 'No hay candidatos para evaluar.'}</span>}
            {evaluables.map((c) => {
              const e = edadRelativa(c.fecha_nacimiento, sesion.fecha);
              return (
                <button key={c.id} style={{ ...chip(c.id === candidatoId), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 52 }}
                  onClick={() => { setCandidatoId(c.id); setNBloque(0); }}>
                  <span>{c.apellido || c.nombre}</span>
                  {c.senas && <Senas texto={c.senas} />}
                  <small style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{c.puesto_principal}{e ? ` · ${e.etiqueta}` : ''}{cerrados.has(`${c.id}|${etapa}`) ? ' · CERRADA' : ''}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {candidato && !cerrada && <EditarSenas candidato={candidato} recargar={recargar} avisar={avisar} />}

      {candidato && cerrada && (
        <div className="bento-card" style={{ padding: 16, ...dim }}>La carga de {candidato.apellido || candidato.nombre} en la etapa {etapa} ya se cerró: el resultado está en CIERRE.</div>
      )}

      {candidato && !cerrada && (
        <>
          {/* Navegación de bloques */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }} role="tablist" aria-label="Bloques">
            {bloques.map((b, i) => (
              <button key={b.id} role="tab" aria-selected={i === nBloque} style={{ ...chip(i === nBloque), position: 'relative' }} onClick={() => setNBloque(i)}>
                {completos(b) ? '✓ ' : ''}{b.nombre}
              </button>
            ))}
          </div>

          <div className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn .2s' }} key={`${candidatoId}|${bloque.id}`}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{bloque.nombre}</div>
              <div style={dim}>{bloque.transversal ? 'Transversal: puntuá sobre toda la prueba.' : bloque.nota || `Etapa ${bloque.etapa}`}</div>
            </div>
            {bloque.criterios.map((c) => <Criterio key={c.id} criterio={c} actual={puntajeDe(c.id)} marcar={(cambios) => marcar(c, cambios)} />)}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button style={botonSec} disabled={nBloque === 0} onClick={() => setNBloque((n) => n - 1)}>← ANTERIOR</button>
              <button style={boton} disabled={nBloque >= bloques.length - 1} onClick={() => setNBloque((n) => n + 1)}>SIGUIENTE →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Criterio({ criterio, actual, marcar }) {
  const [abrirNota, setAbrirNota] = useState(!!actual?.comentario);
  const p = actual?.puntaje || null;
  const descriptor = p ? (criterio.descriptores[p] || DESCRIPTOR_INTERMEDIO[p]) : null;
  const obj = criterio.objetivo;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>{criterio.nombre}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }} role="radiogroup" aria-label={criterio.nombre}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={p === n} onClick={() => marcar({ puntaje: n })}
            style={{ minHeight: 52, borderRadius: 10, cursor: 'pointer', fontFamily: MONO, fontSize: 20, fontWeight: 900,
              border: `1px solid ${p === n ? ACENTO : 'var(--border)'}`, background: p === n ? 'rgba(0,230,118,.16)' : 'var(--panel)', color: p === n ? ACENTO : 'var(--text)' }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.4, color: descriptor ? 'var(--text)' : 'var(--text-dim)', minHeight: 34 }}>
        {descriptor || <>1 · {criterio.descriptores[1]}<br />5 · {criterio.descriptores[5]}</>}
      </div>
      {obj && p && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          {obj.campos.map((k) => (
            <label key={k} style={{ ...campo, width: 110 }}>{k.toUpperCase()}
              <input type="number" min={0} inputMode="numeric" style={{ ...input, fontFamily: MONO }} defaultValue={actual?.dato_objetivo?.[k] ?? ''}
                onBlur={(e) => marcar({ dato_objetivo: { ...(actual?.dato_objetivo || {}), [k]: e.target.value === '' ? null : Number(e.target.value) } })} />
            </label>
          ))}
          <span style={dim}>{obj.etiqueta} (opcional)</span>
        </div>
      )}
      {p && (abrirNota ? (
        <textarea style={{ ...input, minHeight: 60 }} placeholder="Comentario (opcional)" defaultValue={actual?.comentario || ''}
          onBlur={(e) => marcar({ comentario: e.target.value.trim() || null })} />
      ) : <button style={{ ...chip(false), alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setAbrirNota(true)}>+ COMENTARIO</button>)}
    </div>
  );
}

/* Las señas para reconocerlo en la cancha ("camiseta naranja, botines blancos"): gris e itálica. */
export function Senas({ texto, estilo = null }) {
  return <small style={{ fontSize: 11, fontStyle: 'italic', fontWeight: 500, color: 'var(--text-dim)', letterSpacing: 0, whiteSpace: 'normal', textAlign: 'left', ...estilo }}>{texto}</small>;
}

/* Editarlas en el momento (la ropa cambia de un día a otro). */
function EditarSenas({ candidato, recargar, avisar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(candidato.senas || '');
  const guardar = async () => {
    try { await guardarCandidato({ id: candidato.id, senas: texto.trim() || null }); setEditando(false); await recargar(); } catch (err) {
      avisar?.(err?.message || 'No se pudieron guardar las señas.', true);
    }
  };
  if (!editando) {
    return (
      <button onClick={() => { setTexto(candidato.senas || ''); setEditando(true); }}
        style={{ ...chip(false), minHeight: 36, alignSelf: 'flex-start', display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'normal', textAlign: 'left' }}>
        {candidato.senas ? <Senas texto={`👕 ${candidato.senas}`} /> : <span>+ SEÑAS PARA RECONOCERLO</span>}
        <span aria-hidden="true">✎</span>
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input autoFocus style={{ ...input, fontStyle: 'italic' }} maxLength={120} placeholder="camiseta naranja, botines blancos" value={texto}
        onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }} aria-label="Señas para reconocerlo" />
      <button style={boton} onClick={guardar}>OK</button>
    </div>
  );
}
