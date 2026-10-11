import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { Icono } from '../iconos';
import { fetchPaginado } from '../utils/supaPaginado';
import {
  DIVISIONES, CATEGORIAS_LIGA, esMiEquipo, esFinalizado, tablaPosiciones, tablaGoleadores,
  fixturePorJornada, jornadaActual, reportesLiga, partidosDeEquipo, parsearGoleadores,
} from '../analytics/liga';

/* ══════════════════════════════════════════════════════════════════════════
   OTRAS COMPETENCIAS  (en el kiosco: AFA STATS)

   La liga entera, no solo el torneo del club: Primera A, B, C y D, de 1ra a
   8va, con tabla, fixture, goleadores y reportes. Los datos salen de
   liga_partidos, que llena la función liga-sync bajando segundopalo.com.
   No dependen de qué club administre la app: son los mismos para todos.

   Lo ve todo el mundo. Actualizar desde segundopalo solo lo puede el staff
   (y nunca desde el kiosco).
   ══════════════════════════════════════════════════════════════════════════ */

const LS_DIVISION = 'liga_division';
const LS_CATEGORIA = 'liga_categoria';
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin storage */ } };

const ROLES_SIN_ACTUALIZAR = ['jugador', 'kiosco'];

const traerPartidos = (competenciaId) => fetchPaginado(() => supabase
  .from('liga_partidos').select('*').eq('competencia_id', competenciaId).order('id_externo'));

const SIN_PARTIDOS = [];

/* Competencias + en qué división juega mi club (por los equipos de las dos
   primeras fechas de cada Primera). */
async function cargarCompetencias(miClub) {
  const { data, error } = await supabase.from('liga_competencias').select('*').eq('activa', true).order('orden');
  if (error) return { error };
  const competencias = data || [];
  const primeras = competencias.filter((c) => c.categoria === '1ra');
  if (!miClub || !primeras.length) return { competencias, miDivision: null };
  const { data: j } = await supabase.from('liga_partidos')
    .select('competencia_id, local, visitante')
    .in('competencia_id', primeras.map((c) => c.id))
    .lte('jornada', 2);
  const hit = (j || []).find((p) => esMiEquipo(p.local, miClub) || esMiEquipo(p.visitante, miClub));
  return { competencias, miDivision: hit ? primeras.find((c) => c.id === hit.competencia_id)?.division || null : null };
}

const haceCuanto = (iso) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

const fechaCorta = (f) => {
  if (!f) return 'a conf.';
  const [, m, d] = String(f).split('-');
  const dia = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'][new Date(`${f}T12:00:00`).getDay()];
  return `${dia} ${d}/${m}`;
};

export default function OtrasCompetencias({ kiosco = false }) {
  const { perfil } = useAuth() || {};
  const { showToast } = useToast();
  const miClub = leer('mi_club') || perfil?.clubes?.nombre || '';
  const puedeActualizar = !kiosco && perfil && !ROLES_SIN_ACTUALIZAR.includes(String(perfil.rol || '').toLowerCase());

  const [competencias, setCompetencias] = useState([]);
  const [division, setDivision] = useState(leer(LS_DIVISION));
  const [miDivision, setMiDivision] = useState(null);
  const [categoria, setCategoria] = useState(leer(LS_CATEGORIA) || '1ra');
  const [porCompetencia, setPorCompetencia] = useState({}); // id → partidos | 'error'
  const [errorCompetencias, setErrorCompetencias] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [tab, setTab] = useState('tabla');
  const [ambito, setAmbito] = useState('general');
  const [equipoAbierto, setEquipoAbierto] = useState(null);
  const [jornadaVista, setJornadaVista] = useState(null);
  const [filtroGol, setFiltroGol] = useState('');
  const [mostrarSync, setMostrarSync] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarCompetencias(miClub).then((r) => {
      if (!vivo) return;
      if (r.error) { setErrorCompetencias(true); return; }
      setErrorCompetencias(false);
      setCompetencias(r.competencias);
      setMiDivision(r.miDivision);
      setDivision((d) => d || r.miDivision || 'A');
    });
    return () => { vivo = false; };
  }, [miClub, recarga]);

  const competencia = useMemo(
    () => competencias.find((c) => c.division === division && c.categoria === categoria) || null,
    [competencias, division, categoria]
  );

  // Cada competencia se baja una vez; volver a una ya vista es instantáneo.
  const idComp = competencia?.id;
  const yaEsta = idComp ? idComp in porCompetencia : true;
  useEffect(() => {
    if (!idComp || yaEsta) return;
    let vivo = true;
    traerPartidos(idComp)
      .then((lista) => { if (vivo) setPorCompetencia((m) => ({ ...m, [idComp]: lista })); })
      .catch(() => { if (vivo) setPorCompetencia((m) => ({ ...m, [idComp]: 'error' })); });
    return () => { vivo = false; };
  }, [idComp, yaEsta]);

  const crudo = idComp ? porCompetencia[idComp] : [];
  const estado = errorCompetencias || crudo === 'error' ? 'error'
    : !competencias.length || crudo === undefined ? 'cargando' : 'ok';
  const partidos = Array.isArray(crudo) ? crudo : SIN_PARTIDOS;

  const elegirDivision = (d) => { setDivision(d); guardar(LS_DIVISION, d); setEquipoAbierto(null); setJornadaVista(null); };
  const elegirCategoria = (c) => { setCategoria(c); guardar(LS_CATEGORIA, c); setEquipoAbierto(null); setJornadaVista(null); };

  const tabla = useMemo(() => tablaPosiciones(partidos, ambito), [partidos, ambito]);
  const goleadores = useMemo(() => tablaGoleadores(partidos), [partidos]);
  const fixture = useMemo(() => fixturePorJornada(partidos), [partidos]);
  const reportes = useMemo(() => reportesLiga(partidos), [partidos]);
  const jornadaHoy = useMemo(() => jornadaActual(fixture), [fixture]);
  const jornada = jornadaVista ?? jornadaHoy;
  const fechaVista = fixture.find((f) => f.jornada === jornada) || null;
  const idxFecha = fixture.findIndex((f) => f.jornada === jornada);

  const esMio = (eq) => esMiEquipo(eq, miClub);
  const conGoleadores = categoria === '1ra';

  const contenedor = { padding: '16px', maxWidth: '760px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '80px' };

  return (
    <div style={contenedor}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' }}>
            <Icono nombre="trofeo" size="1.2em" relleno="propio" style={{ marginRight: 6 }} />LIGA AFA · FUTSAL
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>
            {kiosco ? 'AFA Stats' : 'Otras competencias'}
          </h1>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Datos de segundopalo.com · actualizado {haceCuanto(competencia?.actualizado_at)}
          </div>
        </div>
        {puedeActualizar && (
          <button onClick={() => setMostrarSync(true)} style={btnSecundario}>
            <Icono nombre="actualizar" size={16} /> ACTUALIZAR DESDE SEGUNDOPALO
          </button>
        )}
      </div>

      {/* División y categoría */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {DIVISIONES.map((d) => (
          <button key={d} onClick={() => elegirDivision(d)} style={{ ...chip(division === d), fontSize: '0.64rem', padding: '8px 2px' }}>
            <span style={{ whiteSpace: 'nowrap' }}>PRIMERA {d}{miDivision === d && <span title="Tu división" style={{ marginLeft: 3 }}>●</span>}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '5px', marginBottom: '14px' }}>
        {CATEGORIAS_LIGA.map((c) => (
          <button key={c} onClick={() => elegirCategoria(c)} style={{ ...chip(categoria === c), minWidth: 0, padding: '8px 2px', fontSize: '0.66rem' }}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[['tabla', 'TABLA'], ['fixture', 'FIXTURE'], ['goleadores', 'GOLEADORES'], ['reportes', 'REPORTES']].map(([id, txt]) => (
          <button key={id} onClick={() => setTab(id)} style={btnTab(tab === id)}>{txt}</button>
        ))}
      </div>

      {estado === 'cargando' && <p style={vacio}>Cargando…</p>}
      {estado === 'error' && <p style={vacio}>No se pudieron cargar los datos de la liga.</p>}
      {estado === 'ok' && !partidos.length && (
        <p style={vacio}>
          Todavía no hay partidos de Primera {division} · {categoria}.
          {puedeActualizar && ' Tocá "Actualizar desde segundopalo" para bajarlos.'}
        </p>
      )}

      {estado === 'ok' && partidos.length > 0 && tab === 'tabla' && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {[['general', 'GENERAL'], ['local', 'LOCAL'], ['visitante', 'VISITANTE']].map(([id, txt]) => (
              <button key={id} onClick={() => setAmbito(id)} style={{ ...chip(ambito === id), fontSize: '0.65rem' }}>{txt}</button>
            ))}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '440px' }}>
              <thead>
                <tr style={{ background: 'var(--panel)', color: 'var(--text-dim)', fontSize: '0.62rem' }}>
                  {['#', 'EQUIPO', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'DG', 'PTS', 'FORMA'].map((h) => (
                    <th key={h} style={{ padding: '8px 5px', textAlign: h === 'EQUIPO' ? 'left' : 'center', fontWeight: 900 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabla.map((t) => {
                  const mio = esMio(t.equipo);
                  const abierto = equipoAbierto === t.equipo;
                  return (
                    <React.Fragment key={t.equipo}>
                      <tr onClick={() => setEquipoAbierto(abierto ? null : t.equipo)}
                        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: mio ? 'rgba(0,255,136,0.08)' : 'transparent' }}>
                        <td style={celda}>{t.pos}</td>
                        <td style={{ ...celda, textAlign: 'left', fontWeight: mio ? 900 : 600, color: mio ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap' }}>{t.equipo}</td>
                        <td style={celda}>{t.pj}</td>
                        <td style={celda}>{t.pg}</td>
                        <td style={celda}>{t.pe}</td>
                        <td style={celda}>{t.pp}</td>
                        <td style={celda}>{t.gf}</td>
                        <td style={celda}>{t.gc}</td>
                        <td style={celda}>{t.dg > 0 ? `+${t.dg}` : t.dg}</td>
                        <td style={{ ...celda, fontWeight: 900 }}>{t.pts}</td>
                        <td style={{ ...celda, whiteSpace: 'nowrap' }}>
                          {t.forma.map((r, i) => <span key={i} style={pildora(r)}>{r}</span>)}
                        </td>
                      </tr>
                      {abierto && (
                        <tr><td colSpan={11} style={{ padding: '8px 10px', background: 'var(--panel)' }}>
                          {/* Pegado a la izquierda y del ancho de la pantalla: la tabla
                              puede ser más ancha y scrollear de costado. */}
                          <div style={{ position: 'sticky', left: '10px', maxWidth: 'min(700px, calc(100vw - 64px))' }}>
                          <PartidosDeEquipo partidos={partidosDeEquipo(partidos, t.equipo)} equipo={t.equipo} />
                          </div>
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={nota}>Tocá un equipo para ver sus partidos.</p>
        </>
      )}

      {estado === 'ok' && partidos.length > 0 && tab === 'fixture' && fechaVista && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <button disabled={idxFecha <= 0} onClick={() => setJornadaVista(fixture[idxFecha - 1].jornada)} style={flecha(idxFecha <= 0)}>‹</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '0.95rem' }}>FECHA {fechaVista.jornada}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                {fechaVista.jugados}/{fechaVista.partidos.length} jugados{fechaVista.jornada === jornadaHoy ? ' · fecha actual' : ''}
              </div>
            </div>
            <button disabled={idxFecha >= fixture.length - 1} onClick={() => setJornadaVista(fixture[idxFecha + 1].jornada)} style={flecha(idxFecha >= fixture.length - 1)}>›</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {fechaVista.partidos.map((p) => <TarjetaPartido key={p.id_externo} p={p} esMio={esMio} conGoleadores={conGoleadores} />)}
          </div>
        </>
      )}

      {estado === 'ok' && partidos.length > 0 && tab === 'goleadores' && (
        !conGoleadores ? (
          <p style={vacio}>segundopalo no publica los goleadores de inferiores. Están solo en 1ra.</p>
        ) : (
          <>
            <input value={filtroGol} onChange={(e) => setFiltroGol(e.target.value)} placeholder="Buscar jugador o equipo…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', marginBottom: '10px', fontSize: '0.85rem' }} />
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: 'var(--panel)', color: 'var(--text-dim)', fontSize: '0.62rem' }}>
                    {['#', 'JUGADOR', 'EQUIPO', 'PJ C/GOL', 'GOLES'].map((h) => (
                      <th key={h} style={{ padding: '8px 6px', textAlign: ['JUGADOR', 'EQUIPO'].includes(h) ? 'left' : 'center', fontWeight: 900 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {goleadores
                    .filter((g) => !filtroGol || `${g.nombre} ${g.equipo}`.toLowerCase().includes(filtroGol.toLowerCase()))
                    .slice(0, 60)
                    .map((g) => {
                      const mio = esMio(g.equipo);
                      return (
                        <tr key={`${g.nombre}|${g.equipo}`} style={{ borderTop: '1px solid var(--border)', background: mio ? 'rgba(0,255,136,0.08)' : 'transparent' }}>
                          <td style={celda}>{g.pos ?? ''}</td>
                          <td style={{ ...celda, textAlign: 'left', fontWeight: 800 }}>{g.nombre}</td>
                          <td style={{ ...celda, textAlign: 'left', color: mio ? 'var(--accent)' : 'var(--text-dim)' }}>{g.equipo}</td>
                          <td style={celda}>{g.partidos}</td>
                          <td style={{ ...celda, fontWeight: 900 }}>{g.goles}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <p style={nota}>Según lo que carga la liga en cada planilla: algunos partidos vienen sin goleadores o incompletos.</p>
          </>
        )
      )}

      {estado === 'ok' && partidos.length > 0 && tab === 'reportes' && <Reportes r={reportes} esMio={esMio} />}

      {mostrarSync && (
        <ModalSync
          onCerrar={() => setMostrarSync(false)}
          onListo={async () => {
            setMostrarSync(false);
            showToast('Datos de la liga actualizados', 'success');
            setPorCompetencia({});
            setRecarga((n) => n + 1);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function TarjetaPartido({ p, esMio, conGoleadores }) {
  const fin = esFinalizado(p);
  const mio = esMio(p.local) || esMio(p.visitante);
  const enJuego = /jugand/i.test(p.estado || '');
  const raro = !fin && !enJuego && p.estado && !/pendiente/i.test(p.estado);
  const gl = conGoleadores ? parsearGoleadores(p.goleadores_local) : [];
  const gv = conGoleadores ? parsearGoleadores(p.goleadores_visitante) : [];
  const resumir = (lista) => {
    const n = new Map();
    lista.forEach((x) => n.set(x, (n.get(x) || 0) + 1));
    return [...n.entries()].map(([x, k]) => (k > 1 ? `${x} ×${k}` : x)).join(', ');
  };
  return (
    <div style={{
      padding: '10px 12px', borderRadius: '8px',
      background: mio ? 'rgba(0,255,136,0.07)' : 'var(--panel)',
      border: `1px solid ${mio ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ flex: 1, textAlign: 'right', fontSize: '0.82rem', fontWeight: esMio(p.local) ? 900 : 600 }}>{p.local}</span>
        <span style={{ minWidth: '68px', textAlign: 'center', fontWeight: 900, fontSize: fin || enJuego ? '1rem' : '0.65rem', color: enJuego ? 'var(--accent)' : fin ? 'var(--text)' : 'var(--text-dim)' }}>
          {fin || (enJuego && p.goles_local !== null)
            ? `${p.goles_local ?? '-'} - ${p.goles_visitante ?? '-'}`
            : <>{fechaCorta(p.fecha)}{p.hora ? <><br />{p.hora}</> : null}</>}
        </span>
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: esMio(p.visitante) ? 900 : 600 }}>{p.visitante}</span>
      </div>
      {(gl.length > 0 || gv.length > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          <span style={{ flex: 1, textAlign: 'right' }}>{resumir(gl)}</span>
          <span style={{ minWidth: '68px', textAlign: 'center' }}><Icono nombre="pelota" size={11} /></span>
          <span style={{ flex: 1 }}>{resumir(gv)}</span>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '4px' }}>
        {[fin && p.fecha ? fechaCorta(p.fecha) : null, p.estadio, enJuego ? 'EN JUEGO' : null, raro ? p.estado.toUpperCase() : null].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

function PartidosDeEquipo({ partidos, equipo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.72rem' }}>
      {partidos.map((p) => {
        const local = p.local === equipo;
        const rival = local ? p.visitante : p.local;
        const fin = esFinalizado(p);
        const gf = local ? p.goles_local : p.goles_visitante;
        const gc = local ? p.goles_visitante : p.goles_local;
        const r = fin ? (gf > gc ? 'G' : gf === gc ? 'E' : 'P') : null;
        return (
          <div key={p.id_externo} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ width: '30px', color: 'var(--text-dim)' }}>F{p.jornada}</span>
            <span style={{ width: '14px', color: 'var(--text-dim)' }}>{local ? 'L' : 'V'}</span>
            <span style={{ flex: 1 }}>{rival}</span>
            <span style={{ fontWeight: 800 }}>{fin ? `${gf}-${gc}` : fechaCorta(p.fecha)}</span>
            {r ? <span style={pildora(r)}>{r}</span> : <span style={{ width: '18px' }} />}
          </div>
        );
      })}
    </div>
  );
}

function Reportes({ r, esMio }) {
  const pct = r.total ? Math.round((r.jugados / r.total) * 100) : 0;
  const equipos = (m) => (m ? m.equipos.map((e) => (esMio(e) ? `${e} ★` : e)).join(', ') : '—');
  const marcador = (p) => (p ? `${p.local} ${p.goles_local}-${p.goles_visitante} ${p.visitante}` : '—');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
        <Dato titulo="PARTIDOS JUGADOS" valor={`${r.jugados}/${r.total}`} pie={`${pct}% del torneo`} />
        <Dato titulo="GOLES" valor={r.goles} pie={`${r.promedioGoles.toFixed(2)} por partido`} />
        <Dato titulo="MEJOR ATAQUE" valor={r.mejorAtaque?.valor ?? '—'} pie={`goles a favor · ${equipos(r.mejorAtaque)}`} />
        <Dato titulo="VALLA MENOS VENCIDA" valor={r.mejorDefensa?.valor ?? '—'} pie={`goles en contra · ${equipos(r.mejorDefensa)}`} />
      </div>

      <div style={tarjeta}>
        <div style={tituloTarjeta}>CÓMO TERMINAN LOS PARTIDOS</div>
        <div style={{ display: 'flex', height: '26px', borderRadius: '6px', overflow: 'hidden', margin: '8px 0 6px', fontSize: '0.68rem', fontWeight: 900 }}>
          {[['Local', r.resultados.pctLocal, 'var(--accent)', '#000'], ['Empate', r.resultados.pctEmpate, 'var(--border)', 'var(--text)'], ['Visitante', r.resultados.pctVisita, '#3b82f6', '#fff']]
            .filter(([, v]) => v > 0)
            .map(([t, v, bg, fg]) => (
              <div key={t} style={{ width: `${v}%`, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{v}%</div>
            ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
          <span>Gana el local ({r.resultados.local})</span><span>Empate ({r.resultados.empates})</span><span>Gana la visita ({r.resultados.visita})</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
        <Dato titulo="GOLEADA MÁS GRANDE" valor={marcador(r.goleada)} pie={r.goleada ? `Fecha ${r.goleada.jornada}` : ''} chico />
        <Dato titulo="PARTIDO CON MÁS GOLES" valor={marcador(r.masGoles)} pie={r.masGoles ? `${r.masGoles.goles_local + r.masGoles.goles_visitante} goles · Fecha ${r.masGoles.jornada}` : ''} chico />
        <Dato titulo="VALLA MÁS VENCIDA" valor={r.peorDefensa?.valor ?? '—'} pie={`goles en contra · ${equipos(r.peorDefensa)}`} />
      </div>

      <div style={tarjeta}>
        <div style={tituloTarjeta}>RACHAS VIGENTES</div>
        {[['Invicto', r.rachaInvicto, 'partidos sin perder'], ['Ganando', r.rachaGanadas, 'triunfos seguidos'], ['Sin ganar', r.rachaSinGanar, 'partidos sin ganar']].map(([t, m, txt]) => (
          <div key={t} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: '0.8rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>{t}</span>
            <span style={{ textAlign: 'right' }}>{m ? <><b>{equipos(m)}</b> · {m.valor} {txt}</> : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dato({ titulo, valor, pie, chico }) {
  return (
    <div style={tarjeta}>
      <div style={tituloTarjeta}>{titulo}</div>
      <div style={{ fontSize: chico ? '0.9rem' : '1.5rem', fontWeight: 900, margin: '4px 0', color: 'var(--text)' }}>{valor}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{pie}</div>
    </div>
  );
}

/* Vista previa → aplicar. La previa ya consulta segundopalo; aplicar lo
   vuelve a consultar y guarda (así no guardamos algo viejo si pasó un rato). */
function ModalSync({ onCerrar, onListo, showToast }) {
  const [fase, setFase] = useState('consultando');
  const [res, setRes] = useState(null);

  const llamar = useCallback(async (modo) => {
    const { data, error } = await supabase.functions.invoke('liga-sync', { body: { modo } });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context?.json())?.error || msg; } catch { /* sin cuerpo */ }
      throw new Error(msg);
    }
    return data;
  }, []);

  useEffect(() => {
    let vivo = true;
    llamar('previa')
      .then((d) => { if (vivo) { setRes(d); setFase('previa'); } })
      .catch((e) => { if (vivo) { setRes({ error: e.message }); setFase('error'); } });
    return () => { vivo = false; };
  }, [llamar]);

  const aplicar = async () => {
    setFase('aplicando');
    try {
      const d = await llamar('aplicar');
      const errores = (d.competencias || []).filter((c) => c.error);
      if (errores.length) showToast(`${errores.length} competencia(s) no se pudieron bajar`, 'warning');
      onListo();
    } catch (e) {
      setRes({ error: e.message });
      setFase('error');
    }
  };

  const lista = res?.competencias || [];
  const tot = lista.reduce((a, c) => ({
    nuevos: a.nuevos + (c.nuevos || 0), resultados: a.resultados + (c.resultados || 0),
    reprogramados: a.reprogramados + (c.reprogramados || 0), otros: a.otros + (c.otros || 0),
  }), { nuevos: 0, resultados: 0, reprogramados: 0, otros: 0 });
  const hayCambios = tot.nuevos + tot.resultados + tot.reprogramados + tot.otros > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 900 }}>ACTUALIZAR DESDE SEGUNDOPALO</div>
        <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1, fontSize: '0.8rem' }}>
          {fase === 'consultando' && <p style={vacio}>Consultando segundopalo (Primera A a D, de 1ra a 8va)… tarda unos segundos.</p>}
          {fase === 'aplicando' && <p style={vacio}>Guardando…</p>}
          {fase === 'error' && <p style={{ ...vacio, color: '#ef4444' }}>{res?.error || 'Algo falló.'}</p>}
          {fase === 'previa' && (
            <>
              <p style={{ margin: '0 0 10px' }}>
                {hayCambios
                  ? <><b>{tot.nuevos}</b> partidos nuevos, <b>{tot.resultados}</b> resultados, <b>{tot.reprogramados}</b> cambios de día u hora y <b>{tot.otros}</b> otros cambios.</>
                  : 'Está todo al día: no hay nada nuevo para guardar.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {lista.map((c) => {
                  const n = (c.nuevos || 0) + (c.resultados || 0) + (c.reprogramados || 0) + (c.otros || 0);
                  return (
                    <div key={c.id} style={{ padding: '6px 8px', borderRadius: '6px', background: 'var(--panel)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontWeight: 800 }}>{c.nombre}</span>
                        <span style={{ color: c.error ? '#ef4444' : n ? 'var(--accent)' : 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'right' }}>
                          {c.error ? `Error: ${c.error}` : n
                            ? [c.nuevos && `${c.nuevos} nuevo${c.nuevos > 1 ? 's' : ''}`, c.resultados && `${c.resultados} resultado${c.resultados > 1 ? 's' : ''}`, c.reprogramados && `${c.reprogramados} reprog.`, c.otros && `${c.otros} otro${c.otros > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
                            : `sin cambios (${c.recibidos ?? 0})`}
                        </span>
                      </div>
                      {(c.muestra || []).length > 0 && (
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                          {c.muestra.map((m) => <div key={m}>{m}</div>)}
                          {c.resultados > c.muestra.length && <div>…y {c.resultados - c.muestra.length} más</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={nota}>Lo que ya estaba finalizado no vuelve atrás, y volver a actualizar no duplica partidos.</p>
            </>
          )}
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={btnSecundario}>CERRAR</button>
          {fase === 'previa' && hayCambios && <button onClick={aplicar} style={btnPrimario}>GUARDAR CAMBIOS</button>}
        </div>
      </div>
    </div>
  );
}

const vacio = { color: 'var(--text-dim)', textAlign: 'center', padding: '24px 8px', fontSize: '0.85rem' };
const nota = { color: 'var(--text-dim)', fontSize: '0.68rem', marginTop: '8px' };
const celda = { padding: '8px 5px', textAlign: 'center', color: 'var(--text)' };
const tarjeta = { padding: '12px', borderRadius: '10px', background: 'var(--panel)', border: '1px solid var(--border)' };
const tituloTarjeta = { fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' };
const chip = (activo) => ({
  flex: 1, padding: '8px 6px', borderRadius: '8px', fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', minHeight: '36px',
  border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, background: activo ? 'rgba(0,255,136,0.12)' : 'var(--panel)',
  color: activo ? 'var(--accent)' : 'var(--text-dim)',
});
const btnTab = (activo) => ({
  flex: 1, padding: '10px 4px', borderRadius: '8px', fontWeight: 900, fontSize: '0.68rem', cursor: 'pointer', minHeight: '40px',
  border: '1px solid var(--border)', background: activo ? 'var(--accent)' : 'var(--panel)', color: activo ? '#000' : 'var(--text-dim)',
});
const flecha = (off) => ({
  width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--panel)',
  color: off ? 'var(--border)' : 'var(--text)', fontSize: '1.3rem', fontWeight: 900, cursor: off ? 'default' : 'pointer',
});
const pildora = (r) => ({
  display: 'inline-block', width: '16px', height: '16px', lineHeight: '16px', borderRadius: '4px', marginLeft: '2px',
  fontSize: '0.58rem', fontWeight: 900, textAlign: 'center', color: r === 'E' ? 'var(--text)' : '#000',
  background: r === 'G' ? 'var(--accent)' : r === 'E' ? 'var(--border)' : '#ef4444',
});
const btnSecundario = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 12px', borderRadius: '8px', fontWeight: 900, fontSize: '0.7rem',
  cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)',
};
const btnPrimario = { ...btnSecundario, background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)' };
