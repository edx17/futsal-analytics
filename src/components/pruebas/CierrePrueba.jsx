import React, { useMemo, useRef, useState } from 'react';
import RadarBloques from './RadarBloques';
import { Senas } from './CargaPrueba';
import { evaluarCandidato, RECOMENDACIONES, ejesRadar, minimoEvaluadores } from '../../pruebas/evaluacionPrueba';
import { VERSION_RUBRICA } from '../../pruebas/rubrica';
import { edadRelativa } from '../../pruebas/edadRelativa';
import { cerrarCarga, decidir, reabrirCierre, incorporarCandidato } from '../../pruebas/datos';
import { exportarPlaca } from '../../placas/exportar';
import { MONO, ACENTO, dim, rotulo, input, boton, botonSec, chip, campo, ESTADOS_CANDIDATO, etiqueta } from './estilos';

/* PRUEBAS · CIERRE
 *
 * Por candidato y etapa:
 *   carga abierta  → cuántos evaluadores cargaron (mínimo 2) y "Cerrar carga".
 *   en revisión    → el motor calcula con la configuración vigente; el DT
 *                    confirma o cambia la decisión (comentario obligatorio si
 *                    la cambia). Al confirmar queda CONGELADO con el snapshot
 *                    de la configuración y su versión.
 *   decidido       → se muestra lo guardado (no se recalcula aunque cambie la
 *                    configuración). Exportar a PNG e Incorporar.
 */

export default function CierrePrueba({ clubId, categoria, candidatos, sesiones, evaluaciones, cierres, resumen, vigente, recargar, puedeCargar, esSuper, avisar }) {
  const [candidatoId, setCandidatoId] = useState(candidatos[0]?.id || '');
  const candidato = candidatos.find((c) => c.id === candidatoId) || null;
  const etapaDeSesion = useMemo(() => new Map(sesiones.map((s) => [s.id, s.etapa])), [sesiones]);

  const cierresDe = (id) => cierres.filter((c) => c.candidato_id === id);
  const estadoCorto = (c) => {
    const cs = cierresDe(c.id);
    const dec = cs.filter((x) => x.estado === 'decidido').sort((a, b) => b.etapa - a.etapa)[0];
    if (dec) return { texto: `E${dec.etapa} · ${RECOMENDACIONES[dec.decision].texto}`, color: RECOMENDACIONES[dec.decision].color };
    if (cs.some((x) => x.estado === 'revision')) return { texto: 'EN REVISIÓN', color: '#38bdf8' };
    return { texto: 'CARGA ABIERTA', color: '#94a3b8' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {candidatos.length === 0 && <span style={dim}>No hay candidatos en esta categoría.</span>}
        {candidatos.map((c) => {
          const e = estadoCorto(c);
          return (
            <button key={c.id} style={{ ...chip(c.id === candidatoId), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 52 }} onClick={() => setCandidatoId(c.id)}>
              <span>{c.apellido || c.nombre}</span>
              {c.senas && <Senas texto={c.senas} />}
              <small style={{ fontSize: 10, color: e.color }}>{e.texto}</small>
            </button>
          );
        })}
      </div>
      {candidato && (
        <PanelCandidato key={candidato.id} candidato={candidato} clubId={clubId} categoria={categoria} cierres={cierresDe(candidato.id)}
          evaluaciones={evaluaciones.filter((e) => e.candidato_id === candidato.id)} etapaDeSesion={etapaDeSesion}
          resumen={resumen} vigente={vigente} recargar={recargar} puedeCargar={puedeCargar} esSuper={esSuper} avisar={avisar} />
      )}
    </div>
  );
}

function PanelCandidato({ candidato, clubId, categoria, cierres, evaluaciones, etapaDeSesion, resumen, vigente, recargar, puedeCargar, esSuper, avisar }) {
  const c1 = cierres.find((c) => c.etapa === 1) || null;
  const habilitada2 = c1?.estado === 'decidido' && c1.decision !== 'no_incorporar';
  const [etapa, setEtapa] = useState(habilitada2 ? 2 : 1);
  const cierre = cierres.find((c) => c.etapa === etapa) || null;
  const carga = resumen.get(`${candidato.id}|${etapa}`) || { evaluadores: 0, puntajes: 0 };
  const [ocupado, setOcupado] = useState(false);
  const minimo = minimoEvaluadores(vigente.config);

  // Etapa 1: lo cargado en sesiones de etapa 1. Etapa 2: todo.
  const evs = evaluaciones.filter((e) => etapa === 2 || etapaDeSesion.get(e.sesion_id) === 1);
  const enVivo = useMemo(() => evaluarCandidato({ evaluaciones: evs, puesto: candidato.puesto_principal, config: vigente.config, etapa }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluaciones, etapa, vigente, candidato.puesto_principal]);

  const accion = async (fn, ok) => {
    setOcupado(true);
    try { await fn(); await recargar(); if (ok) avisar?.(ok); } catch (err) { avisar?.(err?.message || 'No se pudo.', true); } finally { setOcupado(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={chip(etapa === 1)} onClick={() => setEtapa(1)}>ETAPA 1</button>
        <button style={chip(etapa === 2)} onClick={() => habilitada2 && setEtapa(2)} disabled={!habilitada2}
          title={habilitada2 ? '' : 'Se habilita si la etapa 1 está decidida y no es "No incorporar"'}>ETAPA 2 · JUEGO REAL</button>
      </div>

      {!cierre && (
        <div className="bento-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={rotulo}>CARGA ABIERTA · ETAPA {etapa}</div>
          <div style={{ fontSize: 14 }}>
            Cargaron <b style={{ fontFamily: MONO, color: carga.evaluadores >= minimo ? ACENTO : '#fbbf24' }}>{carga.evaluadores}</b> {carga.evaluadores === 1 ? 'evaluador' : 'evaluadores'}
            ({carga.puntajes} puntajes). {minimo === 1 ? 'Alcanza con uno (así está en el configurador).' : `Hacen falta al menos ${minimo}, cada uno por su lado.`}
          </div>
          <div style={dim}>Mientras la carga está abierta nadie ve los puntajes del otro. Al cerrarla, todo el cuerpo técnico ve el resultado y no se cargan más puntajes en esta etapa.</div>
          {puedeCargar && (
            <button style={{ ...boton, alignSelf: 'flex-start', opacity: carga.evaluadores >= minimo ? 1 : 0.5 }} disabled={ocupado || carga.evaluadores < minimo}
              onClick={() => window.confirm('¿Cerrar la carga? Ya no se van a poder cargar ni corregir puntajes de esta etapa.')
                && accion(() => cerrarCarga({ clubId, categoria, candidatoId: candidato.id, etapa }), 'Carga cerrada. Ya se ve el resultado.')}>
              CERRAR CARGA Y VER RESULTADO
            </button>
          )}
        </div>
      )}

      {cierre?.estado === 'revision' && (
        <>
          <Ficha candidato={candidato} resultado={enVivo} etapa={etapa} nota={`Calculado con la configuración vigente (v${vigente.version}, ${vigente.fuente === 'default' ? 'defaults' : vigente.fuente === 'club' ? 'del club' : 'de la categoría'}).`} />
          {puedeCargar && <Decision resultado={enVivo} ocupado={ocupado}
            confirmar={({ decision, comentario }) => accion(() => decidir(cierre.id, {
              resultado: enVivo, recomendacion: enVivo.recomendacion, decision, comentario,
              config: { ...vigente.config, fuente: vigente.fuente }, configVersion: vigente.version, rubricaVersion: VERSION_RUBRICA,
            }), 'Decisión guardada. Queda congelada con esta configuración.')} />}
          {esSuper && <button style={{ ...botonSec, alignSelf: 'flex-start' }} disabled={ocupado} onClick={() => window.confirm('¿Reabrir la carga? Se borra el cierre de esta etapa.') && accion(() => reabrirCierre(cierre.id), 'Carga reabierta.')}>REABRIR CARGA (SUPERUSUARIO)</button>}
        </>
      )}

      {cierre?.estado === 'decidido' && (
        <Decidido candidato={candidato} cierre={cierre} etapa={etapa} puedeCargar={puedeCargar} esSuper={esSuper} ocupado={ocupado}
          incorporar={() => window.confirm(`¿Incorporar a ${candidato.nombre} ${candidato.apellido || ''} al plantel de ${categoria}?`)
            && accion(async () => { const r = await incorporarCandidato(candidato); avisar?.(`Incorporado al plantel. PIN del kiosco: ${r.pin}`); })}
          reabrir={() => window.confirm('¿Borrar la decisión y reabrir la carga? (sólo superusuario)') && accion(() => reabrirCierre(cierre.id), 'Carga reabierta.')} />
      )}
    </div>
  );
}

function Decision({ resultado, confirmar, ocupado }) {
  const [decision, setDecision] = useState(resultado.recomendacion || 'observar');
  const [comentario, setComentario] = useState('');
  const cambia = resultado.recomendacion && decision !== resultado.recomendacion;
  const falta = cambia && !comentario.trim();
  return (
    <div className="bento-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={rotulo}>DECISIÓN DEL DT</div>
      {!resultado.suficiente && <div style={{ color: '#fbbf24', fontSize: 13 }}>Ojo: hay menos de {resultado.minimoEvaluadores} evaluadores con puntajes.</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.values(RECOMENDACIONES).map((r) => (
          <button key={r.id} onClick={() => setDecision(r.id)} aria-pressed={decision === r.id}
            style={{ ...chip(decision === r.id), borderColor: decision === r.id ? r.color : 'var(--border)', color: decision === r.id ? r.color : 'var(--text-dim)' }}>
            {r.texto}{r.id === resultado.recomendacion ? ' · recomendada' : ''}
          </button>
        ))}
      </div>
      <label style={campo}>{cambia ? 'POR QUÉ CAMBIÁS LA RECOMENDACIÓN (OBLIGATORIO)' : 'COMENTARIO DEL DT (OPCIONAL)'}
        <textarea style={{ ...input, minHeight: 70, borderColor: falta ? '#ef4444' : 'var(--border)' }} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </label>
      <button style={{ ...boton, alignSelf: 'flex-start', opacity: falta || !resultado.recomendacion ? 0.5 : 1 }} disabled={ocupado || falta || !resultado.recomendacion}
        onClick={() => confirmar({ decision, comentario: comentario.trim() })}>CONFIRMAR DECISIÓN</button>
      <div style={dim}>Al confirmar, la decisión se guarda con la configuración usada y no cambia aunque después se modifique el configurador.</div>
    </div>
  );
}

function Decidido({ candidato, cierre, etapa, puedeCargar, esSuper, ocupado, incorporar, reabrir }) {
  const ref = useRef(null);
  const [exportando, setExportando] = useState(false);
  const r = cierre.resultado || {};
  const exportar = async () => {
    setExportando(true);
    try { await exportarPlaca(ref.current, { nombre: `prueba_${(candidato.apellido || candidato.nombre).toLowerCase()}_etapa${etapa}` }); } finally { setExportando(false); }
  };
  return (
    <>
      <div ref={ref}>
        <Ficha candidato={candidato} resultado={r} etapa={etapa} decision={cierre} nota={`Congelado con la configuración v${cierre.config_version ?? 0} (rúbrica v${cierre.rubrica_version ?? 1}) · ${cierre.decidido_at ? new Date(cierre.decidido_at).toLocaleDateString('es-AR') : ''}`} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={botonSec} onClick={exportar} disabled={exportando}>{exportando ? 'EXPORTANDO…' : 'EXPORTAR PNG'}</button>
        {puedeCargar && cierre.decision === 'incorporar' && candidato.estado !== 'incorporado' && (
          <button style={boton} onClick={incorporar} disabled={ocupado}>INCORPORAR AL PLANTEL</button>
        )}
        {candidato.estado === 'incorporado' && <span style={etiqueta(ESTADOS_CANDIDATO.incorporado.color)}>YA INCORPORADO</span>}
        {esSuper && <button style={{ ...botonSec, color: '#ef4444' }} onClick={reabrir} disabled={ocupado}>REABRIR (SUPERUSUARIO)</button>}
      </div>
    </>
  );
}

/* La ficha de cierre (lo que se exporta a PNG). */
function Ficha({ candidato, resultado, etapa, decision = null, nota }) {
  const rec = RECOMENDACIONES[resultado.recomendacion] || null;
  const dec = decision ? RECOMENDACIONES[decision.decision] : null;
  const edad = edadRelativa(candidato.fecha_nacimiento);
  const ejes = ejesRadar(resultado);
  return (
    <div className="bento-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn .3s', background: 'var(--panel, #0d1110)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', flex: '0 0 auto' }}>
          {candidato.foto_url && <img src={candidato.foto_url} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{[candidato.nombre, candidato.apellido].filter(Boolean).join(' ')}</div>
          <div style={dim}>{candidato.categoria} · {candidato.puesto_principal}{candidato.puesto_alternativo ? ` / ${candidato.puesto_alternativo}` : ''} · Etapa {etapa}</div>
          {edad && <div style={{ fontFamily: MONO, fontSize: 12, color: ACENTO, marginTop: 2 }}>Edad relativa {edad.texto}</div>}
          {candidato.senas && <Senas texto={candidato.senas} estilo={{ display: 'block', marginTop: 2 }} />}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: MONO, fontSize: 38, fontWeight: 900, lineHeight: 1, color: rec?.color || 'var(--text)' }}>{resultado.puntaje != null ? Number(resultado.puntaje).toFixed(2) : '—'}</div>
          {rec && <div style={{ ...etiqueta(rec.color), marginTop: 6 }}>RECOMIENDA: {rec.texto.toUpperCase()}</div>}
          {dec && <div style={{ ...etiqueta(dec.color), marginTop: 4 }}>DECISIÓN: {dec.texto.toUpperCase()}</div>}
        </div>
      </div>

      {resultado.limitadoPorBloqueClave && (
        <div style={{ fontSize: 12, color: '#fbbf24' }}>Limitado a "Seguir observando": el bloque clave del puesto ({resultado.bloqueClave?.nombre}) quedó en {resultado.bloqueClave?.puntaje}.</div>
      )}
      {resultado.divergencias?.length > 0 && (
        <div style={{ fontSize: 12, color: '#fbbf24' }}>Para revisar, los evaluadores difieren en: {resultado.divergencias.map((d) => `${d.nombre} (${d.diferencia} pts)`).join(' · ')}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'center' }}>
        <RadarBloques ejes={ejes} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(resultado.bloques || []).map((b) => (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 46px 46px', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <span>{b.nombre}{b.transversal && <small style={{ ...dim, marginLeft: 4 }}>(transversal)</small>}{b.divergencia && ' ⚠️'}</span>
              <span style={{ fontFamily: MONO, fontWeight: 900, textAlign: 'right' }}>{b.puntaje != null ? Number(b.puntaje).toFixed(1) : '—'}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>×{Number(b.peso).toFixed(1)}</span>
            </div>
          ))}
          {(resultado.objetivos || []).map((o) => (
            <div key={`${o.bloque}.${o.criterio}`} style={{ fontSize: 12, ...dim }}>{o.etiqueta}: <b style={{ fontFamily: MONO, color: 'var(--text)' }}>{o.logrados}/{o.total}</b>{o.pct != null && ` (${o.pct}%)`}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <div><div style={rotulo}>FORTALEZAS</div>{(resultado.fortalezas || []).map((f) => <div key={f.id} style={{ fontSize: 13, color: ACENTO }}>▲ {f.nombre} · {f.puntaje}</div>)}</div>
        <div><div style={rotulo}>A MEJORAR</div>{(resultado.aMejorar || []).map((f) => <div key={f.id} style={{ fontSize: 13, color: '#f97316' }}>▼ {f.nombre} · {f.puntaje}</div>)}</div>
      </div>
      {decision?.comentario_dt && <div style={{ fontSize: 13 }}><span style={rotulo}>COMENTARIO DEL DT · </span>{decision.comentario_dt}</div>}
      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{nota} · {resultado.evaluadores ?? 0} evaluadores</div>
    </div>
  );
}
