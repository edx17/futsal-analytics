import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useDatosPlantel } from '../utils/useDatosPlantel';
import { fetchPaginado } from '../utils/supaPaginado';
import { procesarPlantel } from '../analytics/plantel';
import { reporteJugador, AUDIENCIAS } from '../analytics/reporteJugador';
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
 * Primero: el reporte de JUGADOR. Los demás (categoría, club, torneo,
 * comparativos) usan las mismas piezas.
 */

const TIPOS_REPORTE = [
  { id: 'jugador', nombre: 'Jugador', listo: true },
  { id: 'categoria', nombre: 'Categoría' },
  { id: 'club', nombre: 'Club' },
  { id: 'torneo', nombre: 'Torneo' },
  { id: 'comparativo', nombre: 'Comparativos' },
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
  const procesado = useMemo(() => {
    if (!cat || !partidosScope.length) return { jugadoresProc: [], arquerosProc: [] };
    return procesarPlantel({
      raw, partidosScopeCat: partidosScope, filtroTorneo: 'Todos', filtroCategoria: cat, misCategorias,
      hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
    });
  }, [raw, partidosScope, cat, misCategorias]);
  const filas = useMemo(() => [...procesado.jugadoresProc, ...procesado.arquerosProc], [procesado]);
  const elegibles = useMemo(
    () => filas.filter((f) => f.jugados > 0).sort((a, b) => String(a.apellido || '').localeCompare(String(b.apellido || ''))),
    [filas]
  );
  const idElegido = elegibles.some((f) => String(f.id) === String(jugadorId)) ? jugadorId : String(elegibles[0]?.id ?? '');

  const reporte = useMemo(() => {
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
      club: { nombre: perfil?.clubes?.nombre || localStorage.getItem('mi_club') || '', escudo: perfil?.clubes?.escudo_url || localStorage.getItem('escudo_url') || null },
      audiencia, hasta: anio === hoyISO().slice(0, 4) ? hoyISO() : `${anio}-12-31`,
    });
  }, [tipo, idElegido, raw, filas, partidosScope, compromiso, anio, audiencia, perfil]);

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
            <label className="rp-campo">Categoría
              <select value={cat} onChange={(e) => { setCategoria(e.target.value); setJugadorId(''); }}>
                {categorias.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="rp-campo" style={{ flexBasis: 220 }}>Jugador
              <select value={idElegido} onChange={(e) => setJugadorId(e.target.value)}>
                {elegibles.map((f) => <option key={f.id} value={String(f.id)}>{[f.apellido, f.nombre].filter(Boolean).join(', ')}{f.dorsal != null ? ` · ${f.dorsal}` : ''}</option>)}
              </select>
            </label>
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
        {!loading && cat && !elegibles.length && <p style={{ color: 'var(--text-dim)' }}>Nadie jugó con datos cargados en {cat} en {anio}.</p>}

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

