import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useDatosPlantel } from '../utils/useDatosPlantel';
import { fetchPaginado } from '../utils/supaPaginado';
import { procesarPlantel } from '../analytics/plantel';
import { reporteJugador, AUDIENCIAS } from '../analytics/reporteJugador';
import { reporteCategoria } from '../analytics/reporteCategoria';
import { reporteClub, reporteTorneo, reporteComparativo } from '../analytics/reportesClubTorneo';
import { ordenarJornadas, ruedaDePartido, tieneRuedasConfiguradas } from '../utils/ruedas';
import { esMiEquipo, categoriaLiga } from '../analytics/liga';
import { Bloque } from '../reportes/Bloques';
import Presentacion from '../reportes/Presentacion';
import '../reportes/reportes.css';

/* REPORTES DE CIERRE DE AÑO
 *
 * Cada reporte sale de una función pura (src/analytics/reporte*.js) como
 * secciones de bloques, y se ve de tres maneras: el documento (dashboard),
 * el PDF (se imprime el documento) y la presentación a pantalla completa.
 * Todos son para todos: se elige para quién es y cambia el tono y el detalle.
 *
 * Jugador, categoría, club, torneo y comparativo (jugador contra jugador).
 */

const TIPOS_REPORTE = [
  { id: 'jugador', nombre: 'Jugador', listo: true },
  { id: 'categoria', nombre: 'Categoría', listo: true },
  { id: 'club', nombre: 'Club', listo: true },
  { id: 'torneo', nombre: 'Torneo', listo: true },
  { id: 'comparativo', nombre: 'Jugador vs jugador', listo: true },
];

const anioDe = (f) => String(f || '').slice(0, 4);
const hoyISO = () => new Date().toISOString().slice(0, 10);

/* Presentismo, wellness y lesiones del club (lo que no trae useDatosPlantel). */
function useDatosCompromiso(clubId) {
  const [datos, setDatos] = useState({ asistencias: [], wellness: [], lesiones: [] });
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    const traer = (tabla, campoClub = 'club_id') => fetchPaginado(() => supabase.from(tabla).select('*').eq(campoClub, clubId).order('id')).catch(() => []);
    Promise.all([traer('asistencias'), traer('wellness'), traer('lesiones')])
      .then(([asistencias, wellness, lesiones]) => { if (vivo) setDatos({ asistencias, wellness, lesiones }); });
    return () => { vivo = false; };
  }, [clubId]);
  return datos;
}

/* La liga de cada categoría (Otras competencias): la competencia de su
   división y categoría en esa temporada, con todos sus partidos. La división
   es la Primera donde aparece el club. { categoría → liga | null }. */
function useLigas(categorias, anio, miClub) {
  const [porClave, setPorClave] = useState({});
  const faltan = categorias.filter((c) => !(`${anio}|${c}` in porClave));
  const pedido = faltan.join('|');
  useEffect(() => {
    if (!pedido || !miClub) return undefined;
    let vivo = true;
    const lista = pedido.split('|');
    (async () => {
      const { data: comps } = await supabase.from('liga_competencias').select('*').eq('anio', Number(anio));
      const primeras = (comps || []).filter((c) => c.categoria === '1ra');
      let division = null;
      if (primeras.length) {
        const { data: j } = await supabase.from('liga_partidos').select('competencia_id, local, visitante')
          .in('competencia_id', primeras.map((c) => c.id)).lte('jornada', 2);
        const hit = (j || []).find((p) => esMiEquipo(p.local, miClub) || esMiEquipo(p.visitante, miClub));
        division = hit ? primeras.find((c) => c.id === hit.competencia_id)?.division : null;
      }
      const res = {};
      for (const categoria of lista) {
        const cat = categoriaLiga(categoria);
        const comp = division && cat ? (comps || []).find((c) => c.division === division && c.categoria === cat) : null;
        res[`${anio}|${categoria}`] = comp
          ? { partidos: await fetchPaginado(() => supabase.from('liga_partidos').select('*').eq('competencia_id', comp.id).order('id_externo')), miClub, nombre: `Primera ${division} · ${cat}` }
          : null;
      }
      return res;
    })()
      .catch(() => Object.fromEntries(lista.map((c) => [`${anio}|${c}`, null])))
      .then((r) => { if (vivo) setPorClave((m) => ({ ...m, ...r })); });
    return () => { vivo = false; };
  }, [pedido, anio, miClub]);
  return useMemo(() => Object.fromEntries(categorias.map((c) => [c, porClave[`${anio}|${c}`] ?? null])), [categorias, anio, porClave]);
}

export default function Reportes() {
  const { perfil } = useAuth() || {};
  const clubId = localStorage.getItem('club_id') || perfil?.club_id;
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);
  const { raw, loading, avance } = useDatosPlantel(clubId);
  const compromiso = useDatosCompromiso(clubId);

  const [tipo, setTipo] = useState('jugador');
  const [temporada, setTemporada] = useState('');
  const [categoria, setCategoria] = useState('');
  const [jugadorId, setJugadorId] = useState('');
  const [jugadorB, setJugadorB] = useState('');
  const [torneoId, setTorneoId] = useState('');
  const [audiencia, setAudiencia] = useState('ct');
  const [presentando, setPresentando] = useState(false);

  const temporadas = useMemo(
    () => [...new Set(raw.partidos.map((p) => anioDe(p.fecha)).filter((a) => /^\d{4}$/.test(a)))].sort().reverse(),
    [raw.partidos]
  );
  const anio = temporada || temporadas[0] || String(new Date().getFullYear());

  const partidosAnio = useMemo(() => raw.partidos.filter((p) => anioDe(p.fecha) === anio), [raw.partidos, anio]);
  const categorias = useMemo(() => {
    const cs = [...new Set(partidosAnio.map((p) => p.categoria).filter(Boolean))].sort();
    return misCategorias.length ? cs.filter((c) => misCategorias.includes(c)) : cs;
  }, [partidosAnio, misCategorias]);
  const cat = categoria && categorias.includes(categoria) ? categoria : categorias[0] || '';

  const partidosScope = useMemo(() => partidosAnio.filter((p) => p.categoria === cat), [partidosAnio, cat]);

  /* Los números de la temporada: los mismos que Resumen Plantel. */
  const procesar = useMemo(() => (partidosCat, categoriaP, torneo = null) => {
    if (!categoriaP || !partidosCat.length) return [];
    const r = procesarPlantel({
      raw, partidosScopeCat: partidosCat, filtroTorneo: torneo ? torneo.id : 'Todos', filtroCategoria: categoriaP, misCategorias,
      hayRuedas: false, filtroRueda: 'Todas', torneoElegido: torneo, jornadasOrdenadas: [],
    });
    return [...r.jugadoresProc, ...r.arquerosProc];
  }, [raw, misCategorias]);
  const filas = useMemo(() => procesar(partidosScope, cat), [procesar, partidosScope, cat]);
  const elegibles = useMemo(
    () => filas.filter((f) => f.jugados > 0).sort((a, b) => String(a.apellido || '').localeCompare(String(b.apellido || ''))),
    [filas]
  );
  const idElegido = elegibles.some((f) => String(f.id) === String(jugadorId)) ? jugadorId : String(elegibles[0]?.id ?? '');
  const idB = elegibles.some((f) => String(f.id) === String(jugadorB) && String(f.id) !== idElegido) ? jugadorB
    : String(elegibles.find((f) => String(f.id) !== idElegido)?.id ?? '');

  /* Los torneos del club con partidos en la temporada. */
  const torneos = useMemo(() => {
    const conPartidos = new Set(partidosAnio.map((p) => p.torneo_id).filter(Boolean));
    return raw.torneos.filter((t) => conPartidos.has(t.id) && (!misCategorias.length || !t.categoria || misCategorias.includes(t.categoria)))
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  }, [raw.torneos, partidosAnio, misCategorias]);
  const torneo = torneos.find((t) => t.id === torneoId) || torneos[0] || null;

  const miClub = localStorage.getItem('mi_club') || perfil?.clubes?.nombre || '';
  const catsLiga = useMemo(() => (tipo === 'categoria' ? [cat].filter(Boolean) : tipo === 'club' ? categorias : []), [tipo, cat, categorias]);
  const ligas = useLigas(catsLiga, anio, miClub);
  const liga = ligas[cat] ?? null;
  const club = useMemo(() => ({
    nombre: perfil?.clubes?.nombre || localStorage.getItem('mi_club') || '',
    escudo: perfil?.clubes?.escudo_url || localStorage.getItem('escudo_url') || null,
  }), [perfil]);
  const hasta = anio === hoyISO().slice(0, 4) ? hoyISO() : `${anio}-12-31`;

  const reporte = useMemo(() => {
    const evDe = (ps) => { const ids = new Set(ps.map((p) => p.id)); return raw.eventos.filter((e) => ids.has(e.id_partido)); };
    if (tipo === 'club') {
      return reporteClub({
        temporada: anio, club, audiencia, hasta,
        categorias: categorias.map((c) => {
          const ps = partidosAnio.filter((p) => p.categoria === c);
          return { categoria: c, partidos: ps, filas: procesar(ps, c), liga: ligas[c] ?? null };
        }),
        asistencias: compromiso.asistencias.filter((a) => anioDe(a.fecha) === anio),
        lesiones: compromiso.lesiones.filter((l) => anioDe(l.fecha_lesion) === anio),
      });
    }
    if (tipo === 'torneo') {
      if (!torneo) return null;
      const ps = partidosAnio.filter((p) => p.torneo_id === torneo.id);
      const catT = torneo.categoria || ps[0]?.categoria || '';
      const jornadas = ordenarJornadas(ps.map((p) => p.jornada));
      return reporteTorneo({
        torneo, temporada: anio, club, audiencia, hasta, partidos: ps, eventos: evDe(ps),
        filas: procesar(partidosAnio.filter((p) => p.categoria === catT), catT, torneo),
        rueda: (p) => (p && tieneRuedasConfiguradas(torneo) ? ruedaDePartido(p, torneo, jornadas) : null),
      });
    }
    if (tipo === 'comparativo') {
      const a = filas.find((f) => String(f.id) === idElegido);
      const b = filas.find((f) => String(f.id) === idB);
      return a && b ? reporteComparativo({ a, b, temporada: anio, club, audiencia }) : null;
    }
    if (tipo === 'categoria') {
      if (!cat || !partidosScope.length) return null;
      const ids = new Set(partidosScope.map((p) => p.id));
      return reporteCategoria({
        categoria: cat, temporada: anio, club, audiencia, hasta, liga,
        partidos: partidosScope, eventos: raw.eventos.filter((e) => ids.has(e.id_partido)), filas,
        asistencias: compromiso.asistencias.filter((a) => anioDe(a.fecha) === anio),
        lesiones: compromiso.lesiones.filter((l) => anioDe(l.fecha_lesion) === anio),
      });
    }
    if (tipo !== 'jugador' || !idElegido) return null;
    const jugador = raw.jugadores.find((j) => String(j.id) === idElegido);
    const fila = filas.find((f) => String(f.id) === idElegido);
    if (!jugador || !fila) return null;
    const ids = new Set(partidosScope.map((p) => p.id));
    const delAnio = (x, campo = 'fecha') => anioDe(x[campo]) === anio;
    return reporteJugador({
      jugador, fila, companeros: filas,
      partidos: partidosScope, eventos: raw.eventos.filter((e) => ids.has(e.id_partido)),
      asistencias: compromiso.asistencias.filter((a) => delAnio(a)),
      wellness: compromiso.wellness.filter((w) => delAnio(w)),
      lesiones: compromiso.lesiones.filter((l) => delAnio(l, 'fecha_lesion')),
      sanciones: raw.sanciones.filter((s) => delAnio(s, 'fecha_sancion')),
      temporada: anio,
      club, audiencia, hasta,
    });
  }, [tipo, idElegido, idB, raw, filas, partidosScope, partidosAnio, categorias, procesar, ligas, torneo, compromiso, anio, audiencia, club, hasta, liga, cat]);

  return (
    <div className="rp">
      <div className="rp-doc">
        <div className="rp-no-imprimir" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="rp-rotulo">CIERRE DE AÑO</div>
            <h1 style={{ margin: '4px 0 0', fontSize: '1.4rem', fontWeight: 900 }}>Reportes</h1>
          </div>
          <div className="rp-tipos">
            {TIPOS_REPORTE.map((t) => (
              <button key={t.id} type="button" className={`rp-tipo${tipo === t.id ? ' activo' : ''}`} disabled={!t.listo}
                onClick={() => setTipo(t.id)} title={t.listo ? '' : 'Próximamente'}>
                {t.nombre.toUpperCase()}{!t.listo && ' · PRONTO'}
              </button>
            ))}
          </div>
          <div className="rp-herramientas">
            <label className="rp-campo">Temporada
              <select value={anio} onChange={(e) => setTemporada(e.target.value)}>
                {(temporadas.length ? temporadas : [anio]).map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            {['jugador', 'categoria', 'comparativo'].includes(tipo) && <label className="rp-campo">Categoría
              <select value={cat} onChange={(e) => { setCategoria(e.target.value); setJugadorId(''); setJugadorB(''); }}>
                {categorias.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>}
            {tipo === 'torneo' && <label className="rp-campo" style={{ flexBasis: 220 }}>Torneo
              <select value={torneo?.id || ''} onChange={(e) => setTorneoId(e.target.value)}>
                {torneos.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.categoria ? ` · ${t.categoria}` : ''}</option>)}
              </select>
            </label>}
            {['jugador', 'comparativo'].includes(tipo) && <label className="rp-campo" style={{ flexBasis: 220 }}>{tipo === 'comparativo' ? 'Jugador A' : 'Jugador'}
              <select value={idElegido} onChange={(e) => setJugadorId(e.target.value)}>
                {elegibles.map((f) => <option key={f.id} value={String(f.id)}>{[f.apellido, f.nombre].filter(Boolean).join(', ')}{f.dorsal != null ? ` · ${f.dorsal}` : ''}</option>)}
              </select>
            </label>}
            {tipo === 'comparativo' && <label className="rp-campo" style={{ flexBasis: 220 }}>Jugador B
              <select value={idB} onChange={(e) => setJugadorB(e.target.value)}>
                {elegibles.filter((f) => String(f.id) !== idElegido).map((f) => <option key={f.id} value={String(f.id)}>{[f.apellido, f.nombre].filter(Boolean).join(', ')}{f.dorsal != null ? ` · ${f.dorsal}` : ''}</option>)}
              </select>
            </label>}
            <label className="rp-campo">Para
              <select value={audiencia} onChange={(e) => setAudiencia(e.target.value)}>
                {AUDIENCIAS.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
          </div>
          {reporte && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="rp-boton rp-boton-primario" onClick={() => setPresentando(true)}>▶ PRESENTAR</button>
              <button type="button" className="rp-boton" onClick={() => window.print()}>DESCARGAR PDF</button>
            </div>
          )}
        </div>

        {loading && <p style={{ color: 'var(--text-dim)' }}>Cargando la temporada… {avance.total ? `${Math.round((avance.traidas / avance.total) * 100)}%` : ''}</p>}
        {!loading && !categorias.length && <p style={{ color: 'var(--text-dim)' }}>No hay partidos en {anio}.</p>}
        {!loading && tipo === 'torneo' && !torneos.length && <p style={{ color: 'var(--text-dim)' }}>No hay torneos con partidos en {anio}.</p>}
        {!loading && ['jugador', 'comparativo'].includes(tipo) && cat && !elegibles.length && <p style={{ color: 'var(--text-dim)' }}>Nadie jugó con datos cargados en {cat} en {anio}.</p>}

        {reporte && (
          <div className="rp-imprimible" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {reporte.secciones.map((s) => (
              <section key={s.id} className="rp-seccion">
                {s.id !== 'portada' && <h2 className="rp-seccion-titulo">{s.titulo}</h2>}
                {s.bloques.map((b, k) => <Bloque key={`${s.id}-${k}`} b={b} />)}
              </section>
            ))}
            <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center' }}>
              {reporte.titulo} · {reporte.subtitulo} · para {AUDIENCIAS.find((a) => a.id === reporte.audiencia)?.nombre.toLowerCase()} · VirtualClub
            </p>
          </div>
        )}
      </div>
      {presentando && reporte && <Presentacion reporte={reporte} onCerrar={() => setPresentando(false)} />}
    </div>
  );
}

