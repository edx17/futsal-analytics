import React, { useEffect, useMemo, useState } from 'react';
import { PUESTOS, bloquesDePuesto } from '../../pruebas/rubrica';
import { CONFIG_DEFAULT, bloquesClaveDe, RANGO_PESO, resolverConfig, erroresDeConfig, distintosDelDefault, restaurar, aPaso } from '../../pruebas/configDefault';
import { simular, RECOMENDACIONES } from '../../pruebas/evaluacionPrueba';
import { guardarConfig, borrarConfig, nombresDePerfiles } from '../../pruebas/datos';
import { MONO, dim, rotulo, input, boton, botonSec, chip, campo } from './estilos';

/* PRUEBAS · CONFIGURADOR
 *
 * Qué pesa cada bloque según el puesto, los umbrales del semáforo, el límite
 * del bloque clave y la divergencia mínima. Se guarda para el club o para la
 * categoría (la de la categoría pisa a la del club; sin ninguna, los defaults).
 * Mientras se edita, la SIMULACIÓN muestra a los candidatos ya evaluados de
 * esta categoría con la configuración vigente y con la que estás armando.
 * Nada se guarda hasta confirmar, y los cierres ya decididos no cambian.
 */

const ORO = '#fbbf24';
const UMBRALES = [
  ['incorporar', 'Incorporar desde', 0.1, 1, 5],
  ['seguir_observando', 'Seguir observando desde', 0.1, 1, 5],
  ['bloque_clave_max', 'Bloque clave: limita si queda en ≤', 0.5, 1, 5],
  ['divergencia_min', 'Divergencia: marcar si difieren ≥', 0.5, 1, 4],
  ['evaluadores_min', 'Evaluadores mínimos para cerrar (1 = sólo el DT)', 1, 1, 5],
];
const clon = (x) => JSON.parse(JSON.stringify(x));

export default function ConfiguradorPruebas({ clubId, categoria, filas, candidatos, evaluaciones, sesiones, cierres, staff = [], ligasClub = [], puedeEditar, recargar, avisar, esMovil }) {
  const [alcance, setAlcance] = useState(() => (filas.some((f) => f.categoria === categoria) ? 'categoria' : 'club'));
  const filaActual = alcance === 'club' ? filas.find((f) => f.categoria == null) || null : filas.find((f) => f.categoria === categoria) || null;
  const base = useMemo(() => (alcance === 'club' ? resolverConfig(filas.filter((f) => f.categoria == null), null) : resolverConfig(filas, categoria)).config,
    [alcance, filas, categoria]);
  const [borrador, setBorrador] = useState(() => clon(base));
  const [ocupado, setOcupado] = useState(false);
  const [quien, setQuien] = useState(null);
  useEffect(() => { setBorrador(clon(base)); }, [base]);
  useEffect(() => {
    let vivo = true;
    if (filaActual?.updated_by) nombresDePerfiles([filaActual.updated_by]).then((m) => { if (vivo) setQuien(m.get(filaActual.updated_by) || null); });
    else setQuien(null);
    return () => { vivo = false; };
  }, [filaActual?.updated_by]);

  const errores = useMemo(() => erroresDeConfig(borrador), [borrador]);
  const distintos = useMemo(() => distintosDelDefault(borrador), [borrador]);
  const cambios = JSON.stringify(borrador) !== JSON.stringify(base);
  const hayErrores = Object.keys(errores).length > 0;

  // Simulación sobre los candidatos de esta categoría con puntajes visibles.
  const vigenteCat = useMemo(() => resolverConfig(filas, categoria).config, [filas, categoria]);
  const nuevaCat = useMemo(() => {
    const otras = filas.filter((f) => (alcance === 'club' ? f.categoria != null : f.categoria !== categoria));
    return resolverConfig([...otras, { categoria: alcance === 'club' ? null : categoria, ...borrador }], categoria).config;
  }, [filas, alcance, categoria, borrador]);
  const etapaDeSesion = useMemo(() => new Map(sesiones.map((s) => [s.id, s.etapa])), [sesiones]);
  const sim = useMemo(() => simular(candidatos.map((c) => {
    const cs = cierres.filter((x) => x.candidato_id === c.id);
    const etapa = cs.some((x) => x.etapa === 2) ? 2 : 1;
    const evs = evaluaciones.filter((e) => e.candidato_id === c.id && (etapa === 2 || etapaDeSesion.get(e.sesion_id) === 1));
    return { candidato: c, evaluaciones: evs, etapa, congelado: cs.some((x) => x.etapa === etapa && x.estado === 'decidido') };
  }), vigenteCat, nuevaCat), [candidatos, cierres, evaluaciones, etapaDeSesion, vigenteCat, nuevaCat]);
  const cambianRec = sim.filter((s) => s.cambia).length;

  const setPeso = (p, b, v) => setBorrador((c) => { const n = clon(c); n.ponderaciones[p][b] = aPaso(Math.max(RANGO_PESO.min, Math.min(RANGO_PESO.max, v))); return n; });
  const setUmbral = (k, v) => setBorrador((c) => ({ ...c, umbrales: { ...c.umbrales, [k]: v === '' ? '' : Number(v) } }));
  const setClave = (p, b) => setBorrador((c) => ({ ...c, bloques_clave: { ...c.bloques_clave, [p]: b } }));
  const setLiga = (i, cambios) => setBorrador((c) => ({ ...c, ligas: c.ligas.map((l, k) => (k === i ? { ...l, ...cambios } : l)) }));
  const agregarLiga = () => setBorrador((c) => ({ ...c, ligas: [...(c.ligas || []), { nombre: '', minimo: Number(c.umbrales.incorporar) || 3.8 }] }));
  const quitarLiga = (i) => setBorrador((c) => ({ ...c, ligas: c.ligas.filter((_, k) => k !== i) }));
  /* Las ligas del configurador general del club (CONFIG. DE CLUB) que todavía no están acá. */
  const ligasDelClubFaltan = ligasClub.filter((l) => !(borrador.ligas || []).some((x) => String(x.nombre).toLowerCase() === l.nombre.toLowerCase()));
  const traerLigasDelClub = () => setBorrador((c) => ({ ...c, ligas: [...(c.ligas || []), ...ligasDelClubFaltan.map((l) => ({ nombre: l.nombre, minimo: Number(c.umbrales.incorporar) || 3.8 }))] }));
  const setEval = (p, cambios) => setBorrador((c) => ({ ...c, evaluadores_puesto: { ...c.evaluadores_puesto, [p]: { ...(c.evaluadores_puesto?.[p] || {}), ...cambios } } }));

  const guardar = async () => {
    if (hayErrores) return;
    if (!window.confirm(`¿Guardar la configuración ${alcance === 'club' ? 'del club' : `de ${categoria}`}? Vale para las evaluaciones nuevas; los cierres ya decididos no cambian.${cambianRec ? `\n\n${cambianRec} candidato(s) cambiarían de recomendación.` : ''}`)) return;
    setOcupado(true);
    try { await guardarConfig({ clubId, categoria: alcance === 'club' ? null : categoria, config: borrador, filaActual }); await recargar(); avisar?.('Configuración guardada.'); } catch (err) {
      avisar?.(err?.message || 'No se pudo guardar.', true);
    } finally { setOcupado(false); }
  };
  const usarLaDelClub = async () => {
    if (!filaActual || !window.confirm(`¿Borrar la configuración propia de ${categoria}? Pasa a usar la del club.`)) return;
    setOcupado(true);
    try { await borrarConfig(filaActual.id); setAlcance('club'); await recargar(); avisar?.(`${categoria} usa la configuración del club.`); } catch (err) {
      avisar?.(err?.message || 'No se pudo.', true);
    } finally { setOcupado(false); }
  };

  const marca = (k) => (distintos.has(k) ? { borderColor: ORO } : {});
  const errorDe = (k) => errores[k] && <small style={{ color: '#ef4444', fontSize: 11 }}>{errores[k]}</small>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="bento-card" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={chip(alcance === 'categoria')} onClick={() => setAlcance('categoria')}>SÓLO {String(categoria).toUpperCase()}</button>
          <button style={chip(alcance === 'club')} onClick={() => setAlcance('club')}>TODO EL CLUB</button>
        </div>
        <span style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-dim)' }}>
          {filaActual
            ? <>Versión <b style={{ fontFamily: MONO, color: 'var(--text)' }}>v{filaActual.version}</b> · {quien || 'alguien del club'} · {new Date(filaActual.updated_at).toLocaleString('es-AR')}</>
            : alcance === 'categoria' ? `${categoria} no tiene configuración propia: usa la del club (o los defaults).` : 'El club todavía no configuró nada: valen los defaults.'}
          {alcance === 'club' && filas.some((f) => f.categoria === categoria) && <><br /><b style={{ color: ORO }}>{categoria} tiene su propia configuración y la pisa.</b></>}
        </span>
        {puedeEditar && (
          <>
            {alcance === 'categoria' && filaActual && <button style={botonSec} disabled={ocupado} onClick={usarLaDelClub}>USAR LA DEL CLUB</button>}
            <button style={botonSec} disabled={ocupado} onClick={() => window.confirm('¿Volver todo a los defaults? (no se guarda hasta que confirmes)') && setBorrador(restaurar(borrador))}>RESTAURAR DEFAULTS</button>
            <button style={{ ...boton, opacity: cambios && !hayErrores ? 1 : 0.5 }} disabled={!cambios || hayErrores || ocupado} onClick={guardar}>{ocupado ? 'GUARDANDO…' : 'GUARDAR'}</button>
          </>
        )}
      </div>
      {!puedeEditar && <div style={dim}>Sólo lectura: la configuración la editan el superusuario, el manager y el CT.</div>}
      {hayErrores && <div role="alert" style={{ color: '#ef4444', fontSize: 13 }}>Hay valores inválidos: corregilos para poder guardar.</div>}
      {cambios && !hayErrores && <div style={{ color: ORO, fontSize: 12 }}>Hay cambios sin guardar · en dorado lo que se aleja del default.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {PUESTOS.map((p) => (
          <section key={p} className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, letterSpacing: '.08em' }}>{p.toUpperCase()}</b>
              {puedeEditar && <button style={{ ...chip(false), minHeight: 32 }} onClick={() => window.confirm(`¿Restaurar los defaults de ${p}?`) && setBorrador(restaurar(borrador, p))}>DEFAULTS</button>}
            </div>
            {bloquesDePuesto(p).map((b) => {
              const k = `${p}.${b.id}`;
              const v = borrador.ponderaciones[p][b.id];
              return (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 40px 52px 40px', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12 }}>{b.nombre}{b.transversal && <small style={dim}> (transv.)</small>}
                    {distintos.has(k) && <small style={{ display: 'block', color: ORO, fontSize: 10 }}>default {CONFIG_DEFAULT.ponderaciones[p][b.id].toFixed(1)}</small>}{errorDe(k)}</span>
                  <button style={{ ...chip(false), minHeight: 36, padding: 0 }} disabled={!puedeEditar} onClick={() => setPeso(p, b.id, Number(v) - RANGO_PESO.paso)} aria-label={`Bajar ${b.nombre}`}>−</button>
                  <span style={{ fontFamily: MONO, fontWeight: 900, textAlign: 'center', padding: '6px 0', borderRadius: 8, border: '1px solid var(--border)', ...marca(k) }}>{Number(v).toFixed(1)}</span>
                  <button style={{ ...chip(false), minHeight: 36, padding: 0 }} disabled={!puedeEditar} onClick={() => setPeso(p, b.id, Number(v) + RANGO_PESO.paso)} aria-label={`Subir ${b.nombre}`}>+</button>
                </div>
              );
            })}
            <label style={{ ...campo, marginTop: 6 }}>BLOQUE CLAVE
              <select style={{ ...input, ...marca(`clave.${p}`) }} value={borrador.bloques_clave[p]} disabled={!puedeEditar} onChange={(e) => setClave(p, e.target.value)}>
                {bloquesClaveDe(p).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
              {errorDe(`clave.${p}`)}
            </label>
          </section>
        ))}

        <section className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ letterSpacing: '.08em' }}>UMBRALES</b>
          {UMBRALES.map(([k, txt, paso, min, max]) => (
            <label key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 92px', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span>{txt}
                {distintos.has(`umbrales.${k}`) && <small style={{ display: 'block', color: ORO, fontSize: 10 }}>default {CONFIG_DEFAULT.umbrales[k]}</small>}{errorDe(`umbrales.${k}`)}</span>
              <input type="number" step={paso} min={min} max={max} value={borrador.umbrales[k]} disabled={!puedeEditar} onChange={(e) => setUmbral(k, e.target.value)}
                style={{ ...input, fontFamily: MONO, fontWeight: 900, ...marca(`umbrales.${k}`), ...(errores[`umbrales.${k}`] ? { borderColor: '#ef4444' } : {}) }} />
            </label>
          ))}
          <div style={dim}>Debajo de "seguir observando" → No incorporar. El bloque clave flojo limita "Incorporar" a "Seguir observando".</div>
        </section>

        <section className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ letterSpacing: '.08em' }}>LIGAS DEL CLUB</b>
          <div style={dim}>En el cierre, la app sugiere las ligas que alcanza el candidato con su puntaje final; el DT tilda las que crea.</div>
          {(borrador.ligas || []).length === 0 && <div style={dim}>Todavía no hay ligas cargadas.</div>}
          {(borrador.ligas || []).map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 82px 36px', gap: 6, alignItems: 'center' }}>
              <input style={{ ...input, ...(errores[`liga.${i}`] ? { borderColor: '#ef4444' } : {}) }} placeholder="AFA, Futsala, LAMBA…" value={l.nombre} disabled={!puedeEditar}
                onChange={(e) => setLiga(i, { nombre: e.target.value })} aria-label="Nombre de la liga" />
              <input type="number" step={0.1} min={1} max={5} style={{ ...input, fontFamily: MONO, fontWeight: 900 }} value={l.minimo} disabled={!puedeEditar}
                onChange={(e) => setLiga(i, { minimo: e.target.value === '' ? '' : Number(e.target.value) })} aria-label="Puntaje mínimo" title="Puntaje final mínimo para sugerirla" />
              {puedeEditar && <button style={{ ...chip(false), minHeight: 36, padding: 0 }} onClick={() => quitarLiga(i)} aria-label={`Quitar ${l.nombre || 'liga'}`}>×</button>}
              {errorDe(`liga.${i}`) && <span style={{ gridColumn: '1 / -1' }}>{errorDe(`liga.${i}`)}</span>}
            </div>
          ))}
          {puedeEditar && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={botonSec} onClick={agregarLiga}>+ AGREGAR LIGA</button>
              {ligasDelClubFaltan.length > 0 && <button style={botonSec} onClick={traerLigasDelClub} title="Las cargadas en CONFIG. DE CLUB">TRAER LAS DEL CLUB ({ligasDelClubFaltan.map((l) => l.nombre).join(', ')})</button>}
            </div>
          )}
          <div style={dim}>El número es el puntaje final (1 a 5) desde el que se sugiere.</div>
        </section>

        <section className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ letterSpacing: '.08em' }}>EVALUADORES POR PUESTO</b>
          <div style={dim}>Si asignás a alguien (por ejemplo, el entrenador de arqueros), sólo esa persona evalúa ese puesto y alcanza con su evaluación. Mínimo vacío = el general ({borrador.umbrales.evaluadores_min}).</div>
          {PUESTOS.map((p) => {
            const e = borrador.evaluadores_puesto?.[p] || {};
            return (
              <div key={p} style={{ display: 'grid', gridTemplateColumns: '70px 64px minmax(0,1fr)', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <b>{p}</b>
                <input type="number" min={1} max={5} step={1} placeholder="—" value={e.min ?? ''} disabled={!puedeEditar} aria-label={`Mínimo de evaluadores para ${p}`}
                  onChange={(ev) => setEval(p, { min: ev.target.value === '' ? null : Number(ev.target.value) })}
                  style={{ ...input, fontFamily: MONO, fontWeight: 900, ...marca(`evaluadores.${p}`), ...(errores[`evaluadores.${p}`] ? { borderColor: '#ef4444' } : {}) }} />
                <select style={{ ...input, ...marca(`evaluadores.${p}`) }} value={e.asignado || ''} disabled={!puedeEditar} aria-label={`Quién evalúa ${p}`}
                  onChange={(ev) => setEval(p, { asignado: ev.target.value || null })}>
                  <option value="">Cualquiera del cuerpo técnico</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>Sólo {s.nombre_completo || 'sin nombre'}</option>)}
                  {e.asignado && !staff.some((s) => s.id === e.asignado) && <option value={e.asignado}>Sólo (perfil que ya no está)</option>}
                </select>
                {errorDe(`evaluadores.${p}`) && <span style={{ gridColumn: '1 / -1' }}>{errorDe(`evaluadores.${p}`)}</span>}
              </div>
            );
          })}
        </section>
      </div>

      <section className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ letterSpacing: '.08em' }}>SIMULACIÓN · {String(categoria).toUpperCase()}</b>
          <span style={dim}>Vigente vs. la que estás armando, sobre los candidatos con puntajes. {cambianRec ? <b style={{ color: ORO }}>{cambianRec} cambian de recomendación.</b> : 'Nadie cambia de recomendación.'}</span>
        </div>
        {sim.length === 0 ? <div style={dim}>Todavía no hay candidatos con puntajes visibles en esta categoría (los puntajes se ven al cerrar la carga).</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sim.map((s) => (
              <div key={s.candidato.id} style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : 'minmax(0,1.4fr) 1fr 1fr', gap: 8, alignItems: 'center', padding: 8, borderRadius: 8,
                border: `1px solid ${s.cambia ? ORO : 'var(--border)'}`, background: s.cambia ? 'rgba(251,191,36,.06)' : 'transparent' }}>
                <span style={{ fontSize: 13, gridColumn: esMovil ? '1 / -1' : 'auto' }}>
                  <b>{s.candidato.apellido || s.candidato.nombre}</b> <small style={dim}>{s.candidato.puesto_principal} · E{s.etapa}{s.congelado ? ' · decidido (no cambia)' : ''}</small>
                </span>
                <Sem titulo="VIGENTE" r={s.actual} />
                <Sem titulo="CON ESTA CONFIG" r={s.nueva} resaltar={s.cambia} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Sem({ titulo, r, resaltar = false }) {
  const rec = RECOMENDACIONES[r.recomendacion];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ ...rotulo, fontSize: 9 }}>{titulo}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <b style={{ fontFamily: MONO, fontSize: 15 }}>{r.puntaje != null ? r.puntaje.toFixed(2) : '—'}</b>
        {rec && <span style={{ width: 10, height: 10, borderRadius: '50%', background: rec.color, boxShadow: resaltar ? `0 0 0 3px ${rec.color}44` : 'none' }} />}
        <small style={{ color: rec?.color || 'var(--text-dim)', fontWeight: resaltar ? 900 : 600 }}>{rec?.texto || 'sin datos'}</small>
      </span>
    </div>
  );
}

