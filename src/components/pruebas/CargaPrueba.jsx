import React, { useMemo, useState } from 'react';
import { bloquesDeEtapa, esArquero } from '../../pruebas/rubrica';
import { asignadoDelPuesto } from '../../pruebas/configDefault';
import { edadRelativa } from '../../pruebas/edadRelativa';
import { crearSesion, guardarCandidato, guardarEntrega, borrarEntrega, MENSAJE_SIN_ENTREGAS } from '../../pruebas/datos';
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

export default function CargaPrueba({ clubId, categoria, yo, esSuper = false, sesiones, candidatos, evaluaciones, cierres, entregas = null, config = null,
  staff = [], esMovil = false, recargar, puedeCargar, avisar }) {
  const cola = useColaPruebas(yo);
  const [sesionId, setSesionId] = useState(sesiones[0]?.id || '');
  const [modo, setModo] = useState('uno');            // 'uno' | 'cuarteto' (en el celular, siempre uno)
  const [seleccion, setSeleccion] = useState([]);     // ids: uno en modo 'uno', hasta 4 en 'cuarteto'
  const [nBloque, setNBloque] = useState(0);
  const [nueva, setNueva] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // Lo que marqué en esta pantalla (ya subido o en la cola): se ve al instante sin volver a leer la base.
  const [locales, setLocales] = useState(() => new Map());

  const cuarteto = modo === 'cuarteto' && !esMovil;
  const sesion = sesiones.find((s) => s.id === sesionId) || null;
  const etapa = sesion?.etapa || 1;
  const nombreDe = (id) => staff.find((p) => p.id === id)?.nombre_completo || 'otra persona del cuerpo técnico';

  // Quién se puede evaluar en esta sesión.
  const decididos1 = useMemo(() => new Map(cierres.filter((c) => c.etapa === 1 && c.estado === 'decidido').map((c) => [c.candidato_id, c.decision])), [cierres]);
  const cerrados = useMemo(() => new Set(cierres.map((c) => `${c.candidato_id}|${c.etapa}`)), [cierres]);
  const evaluables = candidatos.filter((c) => !['incorporado', 'descartado'].includes(c.estado))
    .filter((c) => (etapa === 2 ? decididos1.has(c.id) && decididos1.get(c.id) !== 'no_incorporar' : true));
  const elegidos = seleccion.map((id) => evaluables.find((c) => c.id === id)).filter(Boolean);
  // Los bloques dependen del puesto (el arquero tiene los suyos). En un cuarteto van todos del mismo tipo.
  const bloques = bloquesDeEtapa(etapa, elegidos[0]?.puesto_principal);
  const bloque = bloques[Math.min(nBloque, bloques.length - 1)];

  // Evaluación guardada (entrega): la mía y cuántos la guardaron.
  const miEntrega = (cid) => (entregas || []).find((e) => e.candidato_id === cid && e.etapa === etapa && e.evaluador_id === yo) || null;
  const guardaron = (cid) => (entregas || []).filter((e) => e.candidato_id === cid && e.etapa === etapa).length;
  const asignado = (c) => asignadoDelPuesto(config, c?.puesto_principal);
  const bloqueado = (c) => { const a = asignado(c); return !!a && a !== yo && !esSuper; };
  const cerrada = (c) => cerrados.has(`${c.id}|${etapa}`);
  const editable = (c) => !cerrada(c) && !miEntrega(c.id) && !bloqueado(c);

  // Mis puntajes: los de la base más los que están en la cola (la cola manda).
  const mios = useMemo(() => {
    const m = new Map();
    evaluaciones.filter((e) => e.evaluador_id === yo).forEach((e) => m.set(claveDePuntaje(e), e));
    locales.forEach((f, k) => m.set(k, f));
    cola.enCola().forEach((f, k) => m.set(k, f));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluaciones, yo, locales, cola.pendientes]);
  const clave = (cid, b, crit) => claveDePuntaje({ sesion_id: sesionId, candidato_id: cid, evaluador_id: yo, bloque: b, criterio: crit });
  const puntajeDe = (cid, b, crit) => mios.get(clave(cid, b, crit)) || null;
  const completos = (cid, b) => b.criterios.every((c) => mios.has(clave(cid, b.id, c.id)));
  const faltan = (c) => bloquesDeEtapa(etapa, c.puesto_principal).filter((b) => !completos(c.id, b));

  const marcar = (cid, criterio, cambios) => {
    const actual = puntajeDe(cid, bloque.id, criterio.id) || {};
    const puntaje = cambios.puntaje ?? actual.puntaje;
    if (!puntaje) return;
    const fila = {
      club_id: clubId, categoria, sesion_id: sesionId, candidato_id: cid, bloque: bloque.id, criterio: criterio.id,
      puntaje, dato_objetivo: 'dato_objetivo' in cambios ? cambios.dato_objetivo : actual.dato_objetivo ?? null,
      comentario: 'comentario' in cambios ? cambios.comentario : actual.comentario ?? null,
    };
    cola.agregar(fila);
    setLocales((m) => new Map(m).set(claveDePuntaje({ ...fila, evaluador_id: yo }), { ...fila, evaluador_id: yo }));
  };

  /* GUARDAR EVALUACIÓN: con todo completo y subido, queda guardada y no se vuelve a cargar
     (en ninguna sesión de esta etapa) salvo que la corrija antes del cierre. */
  const guardar = async (c) => {
    const f = faltan(c);
    if (f.length) { avisar?.(`Falta completar: ${f.map((b) => b.nombre).join(', ')}.`, true); return; }
    setOcupado(true);
    try {
      await cola.reintentar();
      const sinSubir = [...cola.enCola().values()].some((x) => x.candidato_id === c.id);
      if (sinSubir) throw new Error('Hay puntajes sin subir (sin señal). Cuando vuelva la conexión, guardá de nuevo.');
      await guardarEntrega({ candidatoId: c.id, etapa, sesionId });
      await recargar();
      avisar?.(`Evaluación de ${c.apellido || c.nombre} guardada.`);
    } catch (err) { avisar?.(err?.message || 'No se pudo guardar.', true); } finally { setOcupado(false); }
  };
  const corregir = async (c) => {
    const e = miEntrega(c.id);
    if (!e || !window.confirm(`¿Corregir tu evaluación de ${c.apellido || c.nombre}? Vuelve a quedar abierta hasta que la guardes de nuevo.`)) return;
    setOcupado(true);
    try { await borrarEntrega(e.id); await recargar(); } catch (err) { avisar?.(err?.message || 'No se pudo.', true); } finally { setOcupado(false); }
  };

  const elegir = (c) => {
    setNBloque(0);
    if (!cuarteto) { setSeleccion([c.id]); return; }
    if (seleccion.includes(c.id)) { setSeleccion(seleccion.filter((x) => x !== c.id)); return; }
    if (seleccion.length >= 4) { avisar?.('En un cuarteto van hasta 4 candidatos.', true); return; }
    if (elegidos.length && esArquero(elegidos[0].puesto_principal) !== esArquero(c.puesto_principal)) {
      avisar?.('En un cuarteto van todos arqueros o todos de campo (tienen bloques distintos).', true); return;
    }
    setSeleccion([...seleccion, c.id]);
  };
  const cambiarModo = (m) => { setModo(m); setSeleccion((s) => (m === 'uno' ? s.slice(0, 1) : s)); setNBloque(0); };

  const crear = async () => {
    try {
      const s = await crearSesion({ clubId, categoria, fecha: nueva.fecha, etapa: Number(nueva.etapa), evaluadores: [yo] });
      setNueva(null); await recargar(); setSesionId(s.id); setSeleccion([]); setNBloque(0);
      avisar?.(`Sesión del ${s.fecha} (etapa ${s.etapa}) creada.`);
    } catch (err) { avisar?.(err?.message || 'No se pudo crear la sesión.', true); }
  };

  if (!puedeCargar) return <div className="bento-card" style={{ padding: 20, ...dim }}>Cargan puntajes el cuerpo técnico (CT), el manager y el superusuario.</div>;

  const ultimo = nBloque >= bloques.length - 1;
  const uno = !cuarteto ? elegidos[0] || null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Indicador de la cola y modo */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: cola.pendientes ? '#fbbf24' : ACENTO }}>
          {cola.pendientes ? `${cola.pendientes} SIN SUBIR` : '✓ TODO SUBIDO'}
        </span>
        {cola.pendientes > 0 && <button style={{ ...chip(false), minHeight: 32 }} onClick={cola.reintentar}>REINTENTAR</button>}
        {cola.error && <span style={{ fontSize: 11, color: '#ef4444' }}>{cola.error}</span>}
        {!esMovil && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} role="group" aria-label="Modo de carga">
            <button style={chip(!cuarteto)} onClick={() => cambiarModo('uno')}>UNO A UNO</button>
            <button style={chip(cuarteto)} onClick={() => cambiarModo('cuarteto')} title="Hasta 4 candidatos lado a lado">CUARTETO</button>
          </div>
        )}
      </div>
      {entregas === null && <div style={{ fontSize: 12, color: '#fbbf24' }}>{MENSAJE_SIN_ENTREGAS} Mientras tanto se carga como antes, sin GUARDAR.</div>}

      {/* Sesión */}
      <div className="bento-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={rotulo}>SESIÓN</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ ...input, flex: 1, minWidth: 180 }} value={sesionId} onChange={(e) => { setSesionId(e.target.value); setSeleccion([]); setNBloque(0); }} aria-label="Sesión">
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
          <div style={rotulo}>{cuarteto ? `CANDIDATOS · elegí hasta 4 (${elegidos.length}/4)` : 'CANDIDATO'} {etapa === 2 && '· sólo los que no quedaron en "No incorporar" en la etapa 1'}</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, flexWrap: cuarteto ? 'wrap' : 'nowrap' }}>
            {evaluables.length === 0 && <span style={dim}>{etapa === 2 ? 'Nadie tiene la etapa 1 decidida para pasar al juego real.' : 'No hay candidatos para evaluar.'}</span>}
            {evaluables.map((c) => {
              const e = edadRelativa(c.fecha_nacimiento, sesion.fecha);
              const estado = cerrada(c) ? ' · CERRADA' : miEntrega(c.id) ? ' · ✓ GUARDADA' : bloqueado(c) ? ' · LO EVALÚA OTRO' : '';
              return (
                <button key={c.id} style={{ ...chip(seleccion.includes(c.id)), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 52 }}
                  onClick={() => elegir(c)} aria-pressed={seleccion.includes(c.id)}>
                  <span>{c.apellido || c.nombre}</span>
                  {c.senas && <Senas texto={c.senas} />}
                  <small style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{c.puesto_principal}{e ? ` · ${e.etiqueta}` : ''}{estado}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── UNO A UNO ── */}
      {uno && <EstadoCandidato c={uno} etapa={etapa} cerrada={cerrada(uno)} entrega={miEntrega(uno.id)} bloqueadoPor={bloqueado(uno) ? nombreDe(asignado(uno)) : null}
        guardaron={guardaron(uno.id)} corregir={() => corregir(uno)} ocupado={ocupado} />}
      {uno && editable(uno) && <EditarSenas candidato={uno} recargar={recargar} avisar={avisar} />}
      {uno && editable(uno) && (
        <>
          <PestanasBloques bloques={bloques} nBloque={nBloque} setNBloque={setNBloque} completo={(b) => completos(uno.id, b)} />
          <div className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn .2s' }} key={`${uno.id}|${bloque.id}`}>
            <CabezaBloque bloque={bloque} />
            {bloque.criterios.map((c) => <Criterio key={c.id} criterio={c} actual={puntajeDe(uno.id, bloque.id, c.id)} marcar={(cambios) => marcar(uno.id, c, cambios)} />)}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={botonSec} disabled={nBloque === 0} onClick={() => setNBloque((n) => n - 1)}>← ANTERIOR</button>
              {!ultimo && <button style={boton} onClick={() => setNBloque((n) => n + 1)}>SIGUIENTE →</button>}
              {ultimo && entregas !== null && (
                <button style={{ ...boton, opacity: faltan(uno).length ? 0.55 : 1 }} disabled={ocupado} onClick={() => guardar(uno)}
                  title={faltan(uno).length ? `Falta: ${faltan(uno).map((b) => b.nombre).join(', ')}` : 'Guardar la evaluación completa'}>
                  {ocupado ? 'GUARDANDO…' : '✓ GUARDAR EVALUACIÓN'}
                </button>
              )}
            </div>
            {ultimo && entregas !== null && faltan(uno).length > 0 && <div style={{ fontSize: 12, color: '#fbbf24' }}>Para guardar falta completar: {faltan(uno).map((b) => b.nombre).join(', ')}.</div>}
          </div>
        </>
      )}

      {/* ── CUARTETO: hasta 4 candidatos lado a lado, el mismo bloque para todos ── */}
      {cuarteto && elegidos.length > 0 && (
        <>
          <PestanasBloques bloques={bloques} nBloque={nBloque} setNBloque={setNBloque}
            completo={(b) => elegidos.filter(editable).every((c) => completos(c.id, b)) && elegidos.some(editable)} />
          <div className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn .2s' }} key={`q|${bloque.id}`}>
            <CabezaBloque bloque={bloque} />
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${elegidos.length}, minmax(0, 1fr))`, gap: 10 }}>
              {elegidos.map((c) => (
                <div key={c.id} style={{ borderBottom: `2px solid ${miEntrega(c.id) ? ACENTO : 'var(--border)'}`, paddingBottom: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{c.apellido || c.nombre}</div>
                  {c.senas && <Senas texto={c.senas} />}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{c.puesto_principal}{completos(c.id, bloque) ? ' · ✓ bloque completo' : ''}</div>
                </div>
              ))}
            </div>
            {bloque.criterios.map((crit) => (
              <div key={crit.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{crit.nombre}
                  <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>1 · {crit.descriptores[1]} — 5 · {crit.descriptores[5]}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${elegidos.length}, minmax(0, 1fr))`, gap: 10 }}>
                  {elegidos.map((c) => (editable(c)
                    ? <Criterio key={c.id} compacto criterio={crit} actual={puntajeDe(c.id, bloque.id, crit.id)} marcar={(cambios) => marcar(c.id, crit, cambios)} />
                    : <div key={c.id} style={{ ...dim, fontSize: 11, padding: 8, border: '1px dashed var(--border)', borderRadius: 8 }}>
                        {cerrada(c) ? 'Carga cerrada.' : miEntrega(c.id) ? '✓ Guardada.' : `Lo evalúa ${nombreDe(asignado(c))}.`}
                      </div>))}
                </div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${elegidos.length}, minmax(0, 1fr))`, gap: 10 }}>
              {elegidos.map((c) => (
                <div key={c.id}>
                  {miEntrega(c.id) && !cerrada(c)
                    ? <button style={{ ...botonSec, width: '100%' }} disabled={ocupado} onClick={() => corregir(c)}>✓ GUARDADA · CORREGIR</button>
                    : editable(c) && entregas !== null && (
                      <button style={{ ...boton, width: '100%', opacity: faltan(c).length ? 0.5 : 1 }} disabled={ocupado} onClick={() => guardar(c)}
                        title={faltan(c).length ? `Falta: ${faltan(c).map((b) => b.nombre).join(', ')}` : ''}>
                        {faltan(c).length ? `FALTAN ${faltan(c).length} BLOQUES` : '✓ GUARDAR'}
                      </button>
                    )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button style={botonSec} disabled={nBloque === 0} onClick={() => setNBloque((n) => n - 1)}>← ANTERIOR</button>
              <button style={boton} disabled={ultimo} onClick={() => setNBloque((n) => n + 1)}>SIGUIENTE →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PestanasBloques({ bloques, nBloque, setNBloque, completo }) {
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }} role="tablist" aria-label="Bloques">
      {bloques.map((b, i) => (
        <button key={b.id} role="tab" aria-selected={i === nBloque} style={{ ...chip(i === nBloque), position: 'relative' }} onClick={() => setNBloque(i)}>
          {completo(b) ? '✓ ' : ''}{b.nombre}
        </button>
      ))}
    </div>
  );
}

function CabezaBloque({ bloque }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 900 }}>{bloque.nombre}</div>
      <div style={dim}>{bloque.transversal ? 'Transversal: puntuá sobre toda la prueba.' : bloque.nota || `Etapa ${bloque.etapa}`}</div>
    </div>
  );
}

/* Lo que pasa con el candidato elegido: cerrado, guardado (con CORREGIR) o asignado a otro. */
function EstadoCandidato({ c, etapa, cerrada, entrega, bloqueadoPor, guardaron, corregir, ocupado }) {
  const nombre = c.apellido || c.nombre;
  if (cerrada) return <div className="bento-card" style={{ padding: 16, ...dim }}>La carga de {nombre} en la etapa {etapa} ya se cerró: el resultado está en CIERRE.</div>;
  if (entrega) {
    return (
      <div className="bento-card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: ACENTO }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 900, color: ACENTO }}>✓ Ya guardaste tu evaluación de {nombre} (etapa {etapa})</div>
          <div style={dim}>El {new Date(entrega.entregado_at).toLocaleString('es-AR')}. {guardaron > 1 ? `La guardaron ${guardaron} evaluadores.` : ''} No se puede volver a evaluar en otra sesión de esta etapa.</div>
        </div>
        <button style={botonSec} disabled={ocupado} onClick={corregir}>CORREGIR</button>
      </div>
    );
  }
  if (bloqueadoPor) return <div className="bento-card" style={{ padding: 16, ...dim }}>Los candidatos de {c.puesto_principal} los evalúa sólo {bloqueadoPor} (así está en el configurador).</div>;
  return null;
}

/* compacto: para el cuarteto (el nombre del criterio va arriba, una vez para las 4 columnas). */
function Criterio({ criterio, actual, marcar, compacto = false }) {
  const [abrirNota, setAbrirNota] = useState(!!actual?.comentario);
  const p = actual?.puntaje || null;
  const descriptor = p ? (criterio.descriptores[p] || DESCRIPTOR_INTERMEDIO[p]) : null;
  const obj = criterio.objetivo;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 6 : 8, paddingBottom: compacto ? 8 : 12, borderBottom: '1px solid var(--border)', minWidth: 0 }}>
      {!compacto && <div style={{ fontWeight: 800, fontSize: 14 }}>{criterio.nombre}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: compacto ? 4 : 6 }} role="radiogroup" aria-label={criterio.nombre}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={p === n} onClick={() => marcar({ puntaje: n })}
            style={{ minHeight: compacto ? 42 : 52, borderRadius: compacto ? 8 : 10, cursor: 'pointer', fontFamily: MONO, fontSize: compacto ? 16 : 20, fontWeight: 900, padding: 0,
              border: `1px solid ${p === n ? ACENTO : 'var(--border)'}`, background: p === n ? 'rgba(0,230,118,.16)' : 'var(--panel)', color: p === n ? ACENTO : 'var(--text)' }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ fontSize: compacto ? 11 : 12, lineHeight: 1.35, color: descriptor ? 'var(--text)' : 'var(--text-dim)', minHeight: compacto ? 0 : 34 }}>
        {descriptor || (compacto ? null : <>1 · {criterio.descriptores[1]}<br />5 · {criterio.descriptores[5]}</>)}
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
