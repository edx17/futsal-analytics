import React, { useState } from 'react';
import { supabase } from '../supabase';
import { calcularParticipacion } from '../analytics/engine';
import { calcularXGEvento } from '../analytics/xg';
import { calcularRatingDetallado, elegirMVP } from '../analytics/rating';
import { calcularRatingJugador as ratingV1 } from '../analytics/rating_v1';

/* ═══════════════════════════════════════════════════════════════════════════
   CALIBRACIÓN DE RATING — pantalla temporal de diagnóstico

   Corre el rating v1 y el v2 sobre todo el histórico y compara. NO escribe
   nada en la base: sólo lee.

   Se ejecuta dentro de la app (y no como script de Node) por dos motivos:
     · Vite resuelve los imports internos del motor; Node en ESM no.
     · La RLS exige sesión iniciada. Desde afuera, las queries vuelven vacías.

   Para usarla: agregá la ruta en tu router, por ejemplo
       <Route path="/calibracion" element={<CalibracionRating />} />
   y borrala cuando termines de calibrar.
   ═══════════════════════════════════════════════════════════════════════════ */

const parseQ = (qa) => {
  if (!qa) return [];
  if (Array.isArray(qa)) return qa.map(String);
  try { const j = JSON.parse(qa); return Array.isArray(j) ? j.map(String) : []; }
  catch (e) { return String(qa).split(',').map(s => s.trim()).filter(Boolean); }
};

const nums = (arr) => arr.filter(n => Number.isFinite(n));
const media = (arr) => { const n = nums(arr); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; };
const percentil = (arr, q) => { const s = nums(arr).sort((a, b) => a - b); return s.length ? (s[Math.floor(s.length * q)] ?? s[s.length - 1]) : 0; };

function CalibracionRating() {
  const clubId = localStorage.getItem('club_id');

  const [categoria, setCategoria] = useState('');
  const [limite, setLimite] = useState(0);
  const [estado, setEstado] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const [rep, setRep] = useState(null);

  const correr = async () => {
    if (!clubId) { setEstado('No hay club_id en localStorage. Entrá con tu usuario primero.'); return; }
    setCorriendo(true);
    setRep(null);
    setEstado('Cargando partidos...');

    try {
      /* ── Partidos ── */
      let q = supabase.from('partidos').select('*').eq('club_id', clubId)
        .in('estado', ['Finalizado', 'Jugado']).order('fecha', { ascending: false });
      if (categoria) q = q.eq('categoria', categoria);
      if (limite > 0) q = q.limit(limite);

      const { data: partidos, error: e1 } = await q;
      if (e1) throw new Error('partidos: ' + e1.message);
      if (!partidos?.length) throw new Error('No se encontraron partidos finalizados para este club.');

      setEstado('Cargando jugadores...');
      const { data: jugadores, error: e2 } = await supabase.from('jugadores').select('*').eq('club_id', clubId);
      if (e2) throw new Error('jugadores: ' + e2.message);

      /* ── Eventos paginados ── */
      const ids = partidos.map(p => p.id);
      let eventos = [];
      for (let i = 0; i < ids.length; i += 40) {
        const lote = ids.slice(i, i + 40);
        let desde = 0;
        for (;;) {
          const { data, error } = await supabase.from('eventos').select('*')
            .in('id_partido', lote).order('id', { ascending: true }).range(desde, desde + 999);
          if (error) throw new Error('eventos: ' + error.message);
          eventos = eventos.concat(data || []);
          setEstado(`Cargando eventos... ${eventos.length}`);
          if (!data || data.length < 1000) break;
          desde += 1000;
        }
      }
      if (eventos.length === 0) throw new Error('No hay eventos cargados para esos partidos.');

      setEstado('Calculando ratings...');
      await new Promise(r => setTimeout(r, 10)); // deja repintar

      /* ── Cálculo ── */
      const filas = [];
      const mvpCambios = [];
      let discrepancias = [];

      for (const p of partidos) {
        const evs = eventos.filter(e => e.id_partido === p.id);
        if (evs.length === 0) continue;

        // Marcador desde eventos (fuente que genera el rating) y control contra las columnas
        const golEv = (eq) => evs.filter(e => e.equipo === eq && (e.accion === 'Gol' || e.accion === 'Remate - Gol')).length;
        const gf = golEv('Propio');
        const gc = golEv('Rival');
        const gfCol = Number(p.goles_propios);
        const gcCol = Number(p.goles_rival);
        if (Number.isFinite(gfCol) && Number.isFinite(gcCol) && (gfCol !== gf || gcCol !== gc)) {
          discrepancias.push({ partido: `${p.fecha || ''} vs ${p.rival || '?'}`, col: `${gfCol}-${gcCol}`, ev: `${gf}-${gc}` });
        }

        const { participacion: partMap } = calcularParticipacion(evs);
        const evRival = evs.filter(e => e.equipo === 'Rival');

        const pm = {};
        evs.forEach(ev => {
          if (ev.accion !== 'Gol' && ev.accion !== 'Remate - Gol') return;
          const signo = ev.equipo === 'Propio' ? 1 : -1;
          parseQ(ev.quinteto_activo).forEach(id => { pm[id] = (pm[id] || 0) + signo; });
        });

        const candV1 = [];
        const candV2 = [];

        for (const j of jugadores) {
          const sid = String(j.id);
          const part = partMap[sid];
          if (!part?.presente) continue;

          const evsJ = evs.filter(e => String(e.id_jugador) === sid);
          const esArq = /arquero|portero/i.test(j.posicion || '');

          let ctxArq = {};
          if (esArq) {
            const enfrentados = evRival.filter(e => (e.accion || '').includes('Remate') && parseQ(e.quinteto_activo).includes(sid));
            const alArco = enfrentados.filter(e => e.accion === 'Remate - Gol' || e.accion === 'Gol' || e.accion === 'Remate - Atajado');
            ctxArq = {
              xgRecibido: enfrentados.reduce((s, e) => s + (calcularXGEvento(e) || 0), 0),
              golesRecibidos: alArco.filter(e => e.accion === 'Remate - Gol' || e.accion === 'Gol').length,
              atajadas: alArco.filter(e => e.accion === 'Remate - Atajado').length,
              tirosAlArco: alArco.length,
            };
          }

          const contexto = { golesFavor: gf, golesContra: gc, participacion: part.pct / 100, ...ctxArq };
          const minsEq = part.minutosEquivalentes || 0;

          let v1 = null;
          try { v1 = ratingV1(j, evsJ, esArq ? evRival : [], pm[sid] || 0, minsEq); } catch (e) { /* v1 opcional */ }
          const det = calcularRatingDetallado(j, evsJ, esArq ? evRival : [], pm[sid] || 0, minsEq, contexto);

          const nombre = (j.apellido || j.nombre || '?').toUpperCase();
          filas.push({
            partido: `${p.fecha || ''} vs ${p.rival || '?'}`,
            marcador: `${gf}-${gc}`,
            jugador: nombre,
            posicion: det.desglose.posicion,
            v1, v2: det.rating,
            delta: v1 != null ? Number((det.rating - v1).toFixed(1)) : null,
            part: Math.round(part.pct),
            pm: pm[sid] || 0,
            ...det.desglose.conteo,
            fin: Number(det.desglose.contrib.finalizacion.toFixed(2)),
            cre: Number(det.desglose.contrib.creacion.toFixed(2)),
            def: Number(det.desglose.contrib.defensa.toFixed(2)),
            pos: Number(det.desglose.contrib.posesion.toFixed(2)),
            disc: Number(det.desglose.contrib.disciplina.toFixed(2)),
            pmC: Number(det.desglose.contrib.plusMinus.toFixed(2)),
            techo: det.desglose.techoAplicado,
            golesEvitados: det.desglose.golesEvitados,
            scoreBruto: det.desglose.scoreBruto,
            factorConf: det.desglose.factorConfiabilidad,
          });

          if (v1 != null) candV1.push({ nombre, rating: v1, participacion: part.pct / 100 });
          candV2.push({ nombre, rating: det.rating, participacion: part.pct / 100 });
        }

        if (candV2.length) {
          const m1 = candV1.length ? [...candV1].sort((a, b) => b.rating - a.rating)[0] : null;
          const m2 = elegirMVP(candV2, { golesFavor: gf, golesContra: gc });
          if (m1 && m2 && m1.nombre !== m2.nombre) {
            mvpCambios.push({
              partido: `${p.fecha || ''} vs ${p.rival || '?'} (${gf}-${gc})`,
              v1: `${m1.nombre} ${m1.rating}`,
              v2: `${m2.nombre} ${m2.rating}`,
              etiqueta: m2.etiqueta,
            });
          }
        }
      }

      /* ── Salud del modelo de xG ── */
      let xgP = 0, golP = 0, xgR = 0, golR = 0;
      eventos.forEach(ev => {
        const acc = ev.accion || '';
        if (!acc.includes('Remate') && acc !== 'Gol') return;
        const x = calcularXGEvento(ev) || 0;
        if (ev.equipo === 'Propio') { xgP += x; if (acc === 'Gol' || acc === 'Remate - Gol') golP++; }
        else { xgR += x; if (acc === 'Gol' || acc === 'Remate - Gol') golR++; }
      });

      setRep({
        partidos: partidos.length,
        jugadores: jugadores.length,
        eventos: eventos.length,
        filas,
        mvpCambios,
        discrepancias,
        xg: { xgP, golP, xgR, golR },
      });
      setEstado('');
    } catch (err) {
      setEstado('❌ ' + err.message);
    } finally {
      setCorriendo(false);
    }
  };

  const descargarCSV = () => {
    if (!rep?.filas?.length) return;
    const cols = Object.keys(rep.filas[0]);
    const csv = [cols.join(',')].concat(rep.filas.map(f =>
      cols.map(c => {
        const v = f[c];
        return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${String(v).replace(/"/g, '""')}"` : v;
      }).join(',')
    )).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'calibracion_rating.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ─────────────────────────── Render ─────────────────────────── */
  const v1s = rep ? rep.filas.map(f => f.v1) : [];
  const v2s = rep ? rep.filas.map(f => f.v2) : [];
  const hayV1 = nums(v1s).length > 0;

  const Bloque = ({ titulo, color = 'var(--accent)', children }) => (
    <div className="bento-card" style={{ marginBottom: 18, padding: 18 }}>
      <div className="stat-label" style={{ color, marginBottom: 12 }}>{titulo}</div>
      {children}
    </div>
  );

  const mono = { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>Calibración de Rating</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: 0 }}>
        Compara el rating v1 contra el v2 sobre todo el histórico. Sólo lectura: no modifica nada.
      </p>

      <div className="bento-card" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', padding: 16, marginBottom: 18 }}>
        <div>
          <div className="stat-label" style={{ marginBottom: 5 }}>CATEGORÍA (opcional)</div>
          <input value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Todas"
            style={{ padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4 }} />
        </div>
        <div>
          <div className="stat-label" style={{ marginBottom: 5 }}>ÚLTIMOS N PARTIDOS (0 = todos)</div>
          <input type="number" min="0" value={limite} onChange={e => setLimite(Number(e.target.value) || 0)}
            style={{ padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 4, width: 140 }} />
        </div>
        <button onClick={correr} disabled={corriendo} className="btn-action"
          style={{ padding: '12px 26px', fontWeight: 900, background: corriendo ? 'var(--border)' : 'var(--accent)', color: corriendo ? 'var(--text-dim)' : '#000', border: 'none', borderRadius: 4, cursor: corriendo ? 'wait' : 'pointer' }}>
          {corriendo ? 'PROCESANDO...' : 'CORRER CALIBRACIÓN'}
        </button>
        {rep && (
          <button onClick={descargarCSV} className="btn-secondary" style={{ padding: '12px 20px', fontWeight: 800 }}>
            ⬇ DESCARGAR CSV
          </button>
        )}
      </div>

      {estado && <div style={{ color: estado.startsWith('❌') ? '#ef4444' : 'var(--text-dim)', marginBottom: 18, ...mono }}>{estado}</div>}

      {rep && (
        <>
          <Bloque titulo="MUESTRA">
            <div style={mono}>
              {rep.partidos} partidos · {rep.jugadores} jugadores · {rep.eventos} eventos · {rep.filas.length} actuaciones evaluadas
            </div>
          </Bloque>

          <Bloque titulo="DISTRIBUCIÓN DE NOTAS">
            <table style={{ ...mono, width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)' }}>
                  {['', 'media', 'p10', 'p25', 'mediana', 'p75', 'p90', 'máx'].map(h =>
                    <th key={h} style={{ textAlign: 'right', padding: '5px 10px' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {hayV1 && (
                  <tr>
                    <td style={{ padding: '5px 10px', color: 'var(--text-dim)' }}>v1</td>
                    {[media(v1s), percentil(v1s, .10), percentil(v1s, .25), percentil(v1s, .50), percentil(v1s, .75), percentil(v1s, .90), Math.max(...nums(v1s))]
                      .map((n, i) => <td key={i} style={{ textAlign: 'right', padding: '5px 10px' }}>{n.toFixed(2)}</td>)}
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '5px 10px', color: 'var(--accent)', fontWeight: 900 }}>v2</td>
                  {[media(v2s), percentil(v2s, .10), percentil(v2s, .25), percentil(v2s, .50), percentil(v2s, .75), percentil(v2s, .90), Math.max(...nums(v2s))]
                    .map((n, i) => <td key={i} style={{ textAlign: 'right', padding: '5px 10px', color: 'var(--accent)' }}>{n.toFixed(2)}</td>)}
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: 16 }}>
              {[[0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10.01]].map(([a, b]) => {
                const n = v2s.filter(r => r >= a && r < b).length;
                const p = (n / Math.max(1, v2s.length)) * 100;
                return (
                  <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, ...mono, marginBottom: 3 }}>
                    <span style={{ width: 70, color: 'var(--text-dim)' }}>{a.toFixed(1)}–{b === 10.01 ? '10.0' : b.toFixed(1)}</span>
                    <span style={{ width: 50, textAlign: 'right' }}>{n}</span>
                    <span style={{ width: 55, textAlign: 'right', color: 'var(--text-dim)' }}>{p.toFixed(1)}%</span>
                    <span style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${p}%`, height: '100%', background: 'var(--accent)' }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </Bloque>

          <Bloque titulo="SALUD DEL MODELO DE xG" color="#fbbf24">
            <div style={{ ...mono, lineHeight: 1.9 }}>
              <div>Propio: <strong>{rep.xg.golP}</strong> goles reales vs <strong>{rep.xg.xgP.toFixed(1)}</strong> xG → ratio <strong style={{ color: '#fbbf24' }}>{(rep.xg.golP / Math.max(0.01, rep.xg.xgP)).toFixed(2)}</strong></div>
              <div>Rival: <strong>{rep.xg.golR}</strong> goles reales vs <strong>{rep.xg.xgR.toFixed(1)}</strong> xG → ratio <strong style={{ color: '#fbbf24' }}>{(rep.xg.golR / Math.max(0.01, rep.xg.xgR)).toFixed(2)}</strong></div>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 10, lineHeight: 1.6 }}>
              Un ratio cercano a 1.00 significa que el xG está bien calibrado. Muy por encima de 1 = el modelo
              subestima las ocasiones y hay que subir la curva de <code>xg.js</code> ANTES de tocar los pesos del rating.
            </div>
          </Bloque>

          {rep.discrepancias.length > 0 && (
            <Bloque titulo={`⚠️ MARCADOR: ${rep.discrepancias.length} PARTIDOS NO COINCIDEN`} color="#ef4444">
              <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: 10 }}>
                Las columnas goles_propios/goles_rival difieren del conteo de eventos de gol. El rating usa los EVENTOS.
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', ...mono }}>
                {rep.discrepancias.map((d, i) => (
                  <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                    {d.partido} — columnas: <span style={{ color: '#ef4444' }}>{d.col}</span> · eventos: <span style={{ color: 'var(--accent)' }}>{d.ev}</span>
                  </div>
                ))}
              </div>
            </Bloque>
          )}

          {hayV1 && (
            <>
              <Bloque titulo="MAYORES BAJAS — lo que v1 sobrevaluaba" color="#ef4444">
                <div style={{ ...mono, maxHeight: 340, overflowY: 'auto' }}>
                  {[...rep.filas].filter(f => f.delta != null).sort((a, b) => a.delta - b.delta).slice(0, 20).map((f, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: '#ef4444', fontWeight: 900, display: 'inline-block', width: 48 }}>{f.delta}</span>
                      <strong>{f.jugador}</strong> {f.v1}→{f.v2} · {f.marcador} ·{' '}
                      <span style={{ color: 'var(--text-dim)' }}>
                        G:{f.goles} A:{f.asistencias} Rec:{f.recuperaciones} FRec:{f.faltasRecibidas} +/-:{f.pm}
                        {f.techo ? ` · techo ${f.techo}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </Bloque>

              <Bloque titulo="MAYORES SUBIDAS — lo que v1 subvaluaba" color="#00ff88">
                <div style={{ ...mono, maxHeight: 340, overflowY: 'auto' }}>
                  {[...rep.filas].filter(f => f.delta != null).sort((a, b) => b.delta - a.delta).slice(0, 20).map((f, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: '#00ff88', fontWeight: 900, display: 'inline-block', width: 48 }}>+{f.delta}</span>
                      <strong>{f.jugador}</strong> {f.v1}→{f.v2} · {f.marcador} ·{' '}
                      <span style={{ color: 'var(--text-dim)' }}>
                        G:{f.goles} A:{f.asistencias} Rec:{f.recuperaciones} Part:{f.part}% +/-:{f.pm}
                      </span>
                    </div>
                  ))}
                </div>
              </Bloque>
            </>
          )}

          <Bloque titulo="TOP 20 NOTAS v2 — ¿te parecen actuaciones de esa nota?" color="#0ea5e9">
            <div style={{ ...mono, maxHeight: 380, overflowY: 'auto' }}>
              {[...rep.filas].sort((a, b) => b.v2 - a.v2).slice(0, 20).map((f, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: '#0ea5e9', fontWeight: 900, display: 'inline-block', width: 44 }}>{f.v2}</span>
                  <strong>{f.jugador}</strong> <span style={{ color: 'var(--text-dim)' }}>({f.posicion})</span> · {f.marcador} · {f.partido}
                  <div style={{ color: 'var(--text-dim)', paddingLeft: 44 }}>
                    fin {f.fin} · cre {f.cre} · def {f.def} · pos {f.pos} · disc {f.disc} · +/- {f.pmC}
                    {f.golesEvitados != null ? ` · goles evitados ${f.golesEvitados}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="PEORES 15 NOTAS v2" color="#f97316">
            <div style={{ ...mono, maxHeight: 300, overflowY: 'auto' }}>
              {[...rep.filas].sort((a, b) => a.v2 - b.v2).slice(0, 15).map((f, i) => (
                <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: '#f97316', fontWeight: 900, display: 'inline-block', width: 44 }}>{f.v2}</span>
                  <strong>{f.jugador}</strong> <span style={{ color: 'var(--text-dim)' }}>({f.posicion})</span> · {f.marcador} ·{' '}
                  <span style={{ color: 'var(--text-dim)' }}>
                    Perd:{f.perdidas} FCom:{f.faltasCometidas} Am:{f.amarillas} Ro:{f.rojas} +/-:{f.pm}
                  </span>
                </div>
              ))}
            </div>
          </Bloque>

          {(() => {
            const arq = rep.filas.filter(f => f.posicion === 'arquero');
            if (!arq.length) return null;
            return (
              <Bloque titulo="ARQUEROS" color="#a855f7">
                <div style={{ ...mono, lineHeight: 1.9 }}>
                  <div>{arq.length} actuaciones · media v2 <strong>{media(arq.map(a => a.v2)).toFixed(2)}</strong>
                    {hayV1 ? <> (v1 {media(arq.map(a => a.v1)).toFixed(2)})</> : null}</div>
                  <div>Goles evitados promedio: <strong>{media(arq.map(a => a.golesEvitados)).toFixed(2)}</strong></div>
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 8 }}>
                  Si ese promedio es muy negativo, el problema está en el xG, no en tus arqueros.
                </div>
              </Bloque>
            );
          })()}

          {rep.mvpCambios.length > 0 && (
            <Bloque titulo={`CAMBIOS DE MVP (${rep.mvpCambios.length})`} color="#fbbf24">
              <div style={{ ...mono, maxHeight: 340, overflowY: 'auto' }}>
                {rep.mvpCambios.map((m, i) => (
                  <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text)' }}>{m.partido}</div>
                    <div style={{ color: 'var(--text-dim)', paddingLeft: 14 }}>v1: {m.v1}</div>
                    <div style={{ color: '#fbbf24', paddingLeft: 14 }}>v2: {m.v2} [{m.etiqueta}]</div>
                  </div>
                ))}
              </div>
            </Bloque>
          )}
        </>
      )}
    </div>
  );
}

export default CalibracionRating;