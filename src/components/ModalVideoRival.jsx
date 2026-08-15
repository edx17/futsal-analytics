// ─────────────────────────────────────────────────────────────────────────────
// ModalVideoRival.jsx — el dossier de video de un rival, dentro de Scouting.
//
// Muestra en una sola lista los clips marcados a mano en Videoanalisis y los
// cortes derivados automáticamente de los eventos de TomaDatos. Reproduce con
// un iframe de YouTube acotado por start/end, así que el recorte lo hace el
// reproductor y no hay que tocar el archivo.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEsMovil } from '../utils/useEsMovil';
import {
  cargarDossierRival,
  urlEmbedDeClip,
  fmtTiempo,
  colorEtiqueta,
} from '../analytics/clipsRival';

const MONO = 'JetBrains Mono, monospace';

export default function ModalVideoRival({ rival, clubId, categoria = null, onCerrar }) {
  const navigate = useNavigate();
  const esMovil = useEsMovil();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [dossier, setDossier] = useState(null);

  // Filtros
  // El contexto es el filtro principal: ENFRENTAMIENTOS son partidos que jugaste
  // contra él (tienen eventos ⇒ cortes automáticos); SCOUTING son cruces suyos
  // contra terceros que están en el fixture (sólo clips marcados a mano).
  const [contexto, setContexto] = useState('enfrentamiento');
  const [filtroLado, setFiltroLado] = useState('TODOS');       // TODOS | Rival | Propio
  const [filtroOrigen, setFiltroOrigen] = useState('TODOS');   // TODOS | auto | manual
  const [filtroEtiquetas, setFiltroEtiquetas] = useState(() => new Set());
  const [filtroPartido, setFiltroPartido] = useState('');

  // Reproducción
  const [clipActivo, setClipActivo] = useState(null);
  const [enCola, setEnCola] = useState(false);
  const [indiceCola, setIndiceCola] = useState(0);
  const temporizadorRef = useRef(null);

  const rivalId = rival?.id;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const d = await cargarDossierRival({
          clubId,
          rivalId,
          rivalNombre: rival?.nombre || null,
          categoria,
        });
        if (vivo) {
          setDossier(d);
          // Si no jugaste nunca contra él, arrancamos directo en scouting.
          if (d.stats.enfrentamientos === 0 && d.stats.scouting > 0) setContexto('scouting');
        }
      } catch (e) {
        console.error('[ModalVideoRival] fallo al cargar el dossier:', e);
        if (vivo) {
          const msg = e?.message || String(e);
          setError(
            /column|does not exist|42703|schema/i.test(msg)
              ? `Falta correr migracion_video_scouting_v2.sql en Supabase. Detalle: ${msg}`
              : msg || 'No se pudo cargar el video del rival.'
          );
        }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clubId, rivalId, categoria, rival?.nombre]);

  // Limpieza del temporizador de la cola al desmontar
  useEffect(() => {
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, []);

  // Todo lo de abajo trabaja sobre el contexto elegido: los dos mundos no se
  // mezclan nunca en la misma lista, porque no son comparables.
  const clips = useMemo(
    () => (dossier?.clips || []).filter((c) => c.contexto === contexto),
    [dossier, contexto]
  );

  const partidosDelContexto = useMemo(
    () => (contexto === 'scouting' ? dossier?.scouting : dossier?.enfrentamientos) || [],
    [dossier, contexto]
  );

  const etiquetasDisponibles = useMemo(
    () => [...new Set(clips.map((c) => c.etiqueta))].sort(),
    [clips]
  );

  const clipsFiltrados = useMemo(() => {
    return clips.filter((c) => {
      if (filtroLado !== 'TODOS' && c.lado !== filtroLado) return false;
      if (filtroOrigen !== 'TODOS' && c.origen !== filtroOrigen) return false;
      if (filtroEtiquetas.size > 0 && !filtroEtiquetas.has(c.etiqueta)) return false;
      if (filtroPartido && c.partido_id !== filtroPartido) return false;
      return true;
    });
  }, [clips, filtroLado, filtroOrigen, filtroEtiquetas, filtroPartido]);

  const conteoPorEtiqueta = useMemo(() => {
    const m = {};
    clips.forEach((c) => {
      if (filtroLado !== 'TODOS' && c.lado !== filtroLado) return;
      m[c.etiqueta] = (m[c.etiqueta] || 0) + 1;
    });
    return m;
  }, [clips, filtroLado]);

  const detenerCola = useCallback(() => {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = null;
    setEnCola(false);
  }, []);

  const reproducirClip = useCallback(
    (clip) => {
      detenerCola();
      setClipActivo(clip);
    },
    [detenerCola]
  );

  // Cola: avanza por temporizador. Es aproximado (el iframe simple no expone el
  // evento de fin), pero alcanza para pasar cortes de 10-20 segundos de corrido.
  const avanzarCola = useCallback(
    (indice, lista) => {
      if (indice >= lista.length) {
        setEnCola(false);
        return;
      }
      const clip = lista[indice];
      setClipActivo(clip);
      setIndiceCola(indice);

      const duracion = Math.max(3, (clip.fin || 0) - (clip.inicio || 0));
      temporizadorRef.current = setTimeout(() => {
        avanzarCola(indice + 1, lista);
      }, (duracion + 1.2) * 1000); // +1.2s de margen por el buffering del player
    },
    []
  );

  const reproducirTodo = useCallback(() => {
    const lista = clipsFiltrados.filter((c) => c.reproducible);
    if (lista.length === 0) return;
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    setEnCola(true);
    avanzarCola(0, lista);
  }, [clipsFiltrados, avanzarCola]);

  const toggleEtiqueta = (et) => {
    setFiltroEtiquetas((prev) => {
      const n = new Set(prev);
      n.has(et) ? n.delete(et) : n.add(et);
      return n;
    });
  };

  const limpiarFiltros = () => {
    setFiltroLado('TODOS');
    setFiltroOrigen('TODOS');
    setFiltroEtiquetas(new Set());
    setFiltroPartido('');
  };

  const urlEmbed = clipActivo ? urlEmbedDeClip(clipActivo) : null;
  const stats = dossier?.stats;

  return (
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div
        className="bento-card modal-content"
        style={{ maxWidth: '1100px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}
      >
        {/* ── Cabecera ─────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {rival.escudo && (
              <img
                src={rival.escudo}
                alt=""
                style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
              />
            )}
            <div>
              <div className="stat-label" style={{ color: 'var(--text-dim)', margin: 0 }}>
                DOSSIER DE VIDEO
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--accent)', lineHeight: 1.1 }}>
                {String(rival.nombre || '').toUpperCase()}
              </div>
              {/* La categoria se muestra siempre: el material de Primera y el de
                  Tercera no se mezclan, y conviene que se vea cual estas viendo. */}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, marginTop: '2px' }}>
                {categoria ? `CATEGORÍA ${String(categoria).toUpperCase()}` : 'TODAS LAS CATEGORÍAS'}
              </div>
            </div>
          </div>
          <button onClick={onCerrar} className="close-btn">
            ×
          </button>
        </div>

        {cargando && (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Armando el dossier…
          </div>
        )}

        {!cargando && error && (
          <div
            style={{
              padding: '20px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              color: '#ef4444',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {!cargando && !error && dossier && (
          <>
            {/* ── Resumen numérico ──────────────────────────────────────── */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '10px',
                marginBottom: '15px',
              }}
            >
              <Kpi valor={clips.length} label="CORTES" destacado />
              <Kpi valor={clips.filter((c) => c.origen === 'manual').length} label="MARCADOS" />
              <Kpi valor={clips.filter((c) => c.origen === 'auto').length} label="AUTOMÁTICOS" />
              <Kpi valor={partidosDelContexto.length} label="PARTIDOS" />
              <Kpi valor={partidosDelContexto.filter((p) => p.video_url).length} label="CON VIDEO" />
            </div>

            {/* ── Selector de contexto ──────────────────────────────────── */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setContexto('enfrentamiento'); setFiltroPartido(''); }}
                style={tabContexto(contexto === 'enfrentamiento')}
              >
                ⚔ ENFRENTAMIENTOS ({stats.enfrentamientos})
              </button>
              <button
                onClick={() => { setContexto('scouting'); setFiltroPartido(''); setFiltroLado('TODOS'); }}
                style={tabContexto(contexto === 'scouting')}
              >
                🔍 SCOUTING ({stats.scouting})
              </button>
            </div>

            {/* ── Avisos accionables, distintos según el contexto ───────── */}
            {contexto === 'enfrentamiento' && stats.enfrentamientosSinVideo > 0 && (
              <Aviso>
                {stats.enfrentamientosSinVideo} partido{stats.enfrentamientosSinVideo > 1 ? 's' : ''}{' '}
                que jugaste contra este rival no tiene{stats.enfrentamientosSinVideo > 1 ? 'n' : ''} video
                vinculado. Vinculalo desde el Resumen del partido y los cortes aparecen solos.
              </Aviso>
            )}
            {contexto === 'enfrentamiento' && stats.enfrentamientosSinSincro > 0 && (
              <Aviso>
                {stats.enfrentamientosSinSincro} partido{stats.enfrentamientosSinSincro > 1 ? 's' : ''}{' '}
                con video pero sin el segundo de inicio de PT/ST cargado. Los cortes automáticos van a
                caer corridos hasta que lo cargues en el Resumen.
              </Aviso>
            )}
            {dossier.faltaMigracion && (
              <Aviso>
                El esquema está a medio migrar: falta correr
                migracion_video_scouting_v2.sql. Los cruces donde este rival jugó de
                local se están resolviendo por nombre, y los videos sueltos no se
                filtran por categoría.
              </Aviso>
            )}
            {contexto === 'scouting' && stats.scoutingSinVideo > 0 && (
              <Info>
                Hay {stats.scoutingSinVideo} partido{stats.scoutingSinVideo > 1 ? 's' : ''} de este rival
                contra terceros en el fixture, todavía sin video. Si conseguís la grabación, cargala desde
                el fixture del Torneo y después marcá los cortes con la botonera en Videoanálisis. Acá no
                hay cortes automáticos: no tenés eventos de partidos que no jugaste.
              </Info>
            )}

            {/* ── Reproductor ───────────────────────────────────────────── */}
            {clipActivo && (
              <div style={{ marginBottom: '18px' }}>
                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    aspectRatio: '16/9',
                    width: '100%',
                  }}
                >
                  {urlEmbed ? (
                    <iframe
                      key={clipActivo.id}
                      width="100%"
                      height="100%"
                      src={urlEmbed}
                      title="Corte"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{ border: 'none' }}
                    />
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-dim)',
                        fontSize: '0.8rem',
                        padding: '20px',
                        textAlign: 'center',
                      }}
                    >
                      Este corte es de un video subido al bucket privado y no se puede embeber acá.
                      <button
                        onClick={() => navigate('/videoanalisis')}
                        className="btn-secondary"
                        style={{ fontSize: '0.7rem', padding: '8px 14px' }}
                      >
                        ABRIR EN VIDEOANÁLISIS
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginTop: '8px',
                    fontSize: '0.72rem',
                    color: 'var(--text-dim)',
                    fontFamily: MONO,
                  }}
                >
                  <span>
                    <strong style={{ color: colorEtiqueta(clipActivo.etiqueta) }}>
                      {clipActivo.etiqueta}
                    </strong>
                    {' · '}
                    {clipActivo.fecha} · {fmtTiempo(clipActivo.inicio)}–{fmtTiempo(clipActivo.fin)}
                    {clipActivo.protagonista ? ` · ${clipActivo.protagonista}` : ''}
                  </span>
                  {enCola && (
                    <button
                      onClick={detenerCola}
                      className="btn-secondary"
                      style={{ fontSize: '0.65rem', padding: '5px 10px' }}
                    >
                      ⏹ CORTAR COLA ({indiceCola + 1}/{clipsFiltrados.filter((c) => c.reproducible).length})
                    </button>
                  )}
                </div>
                {clipActivo.notas && (
                  <div
                    style={{
                      marginTop: '6px',
                      fontSize: '0.8rem',
                      color: 'var(--text)',
                      background: 'var(--panel)',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      borderLeft: '2px solid var(--accent)',
                    }}
                  >
                    {clipActivo.notas}
                  </div>
                )}
              </div>
            )}

            {/* ── Filtros ───────────────────────────────────────────────── */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* El lado sólo existe en los cortes automáticos, que sólo hay
                    en enfrentamientos. En scouting el selector no aplica. */}
                {contexto === 'enfrentamiento' && (
                  <>
                    <Grupo
                      opciones={[
                        ['TODOS', 'TODO'],
                        ['Rival', 'ELLOS'],
                        ['Propio', 'NOSOTROS'],
                      ]}
                      valor={filtroLado}
                      onCambio={setFiltroLado}
                    />
                    <span style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
                  </>
                )}
                <Grupo
                  opciones={[
                    ['TODOS', 'TODO'],
                    ['auto', 'AUTO'],
                    ['manual', 'MARCADOS'],
                  ]}
                  valor={filtroOrigen}
                  onCambio={setFiltroOrigen}
                />
                <select
                  value={filtroPartido}
                  onChange={(e) => setFiltroPartido(e.target.value)}
                  style={selectChico}
                >
                  <option value="">Todos los partidos</option>
                  {partidosDelContexto.map((p) => (
                    <option key={p.id} value={p.id}>
                      {contexto === 'scouting'
                        ? `${p.fecha} · ${p.nombre_propio} ${p.goles_propios}-${p.goles_rival} ${p.rival}`
                        : `${p.fecha} · ${p.goles_propios}-${p.goles_rival}`}
                      {p.video_url ? ' 🎬' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {etiquetasDisponibles.map((et) => {
                  const activo = filtroEtiquetas.has(et);
                  const color = colorEtiqueta(et);
                  return (
                    <button
                      key={et}
                      onClick={() => toggleEtiqueta(et)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        border: `1px solid ${color}`,
                        background: activo ? color : 'transparent',
                        color: activo ? '#000' : color,
                      }}
                    >
                      {et} <span style={{ opacity: 0.7 }}>{conteoPorEtiqueta[et] || 0}</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={reproducirTodo}
                  className="btn-action"
                  disabled={clipsFiltrados.filter((c) => c.reproducible).length === 0}
                  style={{
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: '0.72rem',
                    padding: '8px 14px',
                    fontWeight: 900,
                  }}
                >
                  ▶ VER LOS {clipsFiltrados.filter((c) => c.reproducible).length} CORTES
                </button>
                <button
                  onClick={limpiarFiltros}
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '8px 14px' }}
                >
                  LIMPIAR FILTROS
                </button>
                <button
                  onClick={() => navigate('/videoanalisis')}
                  className="btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '8px 14px' }}
                >
                  🎬 IR A VIDEOANÁLISIS
                </button>
              </div>
            </div>

            {/* ── Lista de cortes ───────────────────────────────────────── */}
            <div className="stat-label" style={{ marginBottom: '8px' }}>
              CORTES ({clipsFiltrados.length})
            </div>

            {clipsFiltrados.length === 0 ? (
              <div
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: 'var(--text-dim)',
                  fontSize: '0.82rem',
                  background: 'var(--panel)',
                  borderRadius: '4px',
                }}
              >
                {clips.length > 0
                  ? 'No hay cortes con estos filtros.'
                  : contexto === 'scouting'
                  ? 'Todavía no hay cortes de este rival contra terceros. Cargá el video del cruce desde el fixture del Torneo y marcalo con la botonera en Videoanálisis.'
                  : partidosDelContexto.length === 0
                  ? 'Nunca jugaste contra este rival (o no en las categorías que tenés asignadas). Mirá la solapa de SCOUTING.'
                  : 'Todavía no hay video de estos partidos. Vinculá el video desde el Resumen del partido.'}
              </div>
            ) : (
              <div
                className="custom-scroll"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: esMovil ? '340px' : '420px',
                  overflowY: 'auto',
                  paddingRight: '4px',
                }}
              >
                {clipsFiltrados.map((c) => {
                  const color = colorEtiqueta(c.etiqueta);
                  const activo = clipActivo?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => reproducirClip(c)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        textAlign: 'left',
                        background: activo ? 'rgba(0,255,136,0.08)' : 'var(--bg)',
                        border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
                        borderLeft: `4px solid ${color}`,
                        padding: '8px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 900,
                            color,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {c.etiqueta}
                          {c.lado && (
                            <span
                              style={{
                                fontSize: '0.55rem',
                                padding: '1px 5px',
                                borderRadius: '2px',
                                background: c.lado === 'Rival' ? '#ef4444' : 'var(--accent)',
                                color: c.lado === 'Rival' ? '#fff' : '#000',
                              }}
                            >
                              {c.lado === 'Rival' ? 'ELLOS' : 'NOSOTROS'}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '0.55rem',
                              padding: '1px 5px',
                              borderRadius: '2px',
                              background: 'var(--panel)',
                              color: 'var(--text-dim)',
                            }}
                          >
                            {c.origen === 'auto' ? 'AUTO' : 'MARCADO'}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.65rem',
                            color: 'var(--text-dim)',
                            marginTop: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.fecha} · {c.marcador}
                          {c.protagonista ? ` · ${c.protagonista}` : ''}
                          {c.notas ? ` · ${c.notas}` : ''}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: '0.72rem',
                          color: 'var(--accent)',
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {fmtTiempo(c.inicio)}
                        <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
                          {' '}
                          {Math.round((c.fin || 0) - (c.inicio || 0))}s
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Piezas chicas ────────────────────────────────────────────────────────────

function Kpi({ valor, label, destacado = false }) {
  return (
    <div
      style={{
        background: destacado ? 'rgba(0,255,136,0.08)' : 'var(--panel)',
        border: `1px solid ${destacado ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '4px',
        padding: '10px 6px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '1.3rem',
          fontWeight: 900,
          fontFamily: MONO,
          color: destacado ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontWeight: 800 }}>{label}</div>
    </div>
  );
}

function Info({ children }) {
  return (
    <div
      style={{
        background: 'rgba(59,130,246,0.08)',
        border: '1px solid rgba(59,130,246,0.4)',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '10px',
        fontSize: '0.72rem',
        color: '#3b82f6',
      }}
    >
      ℹ {children}
    </div>
  );
}

function Aviso({ children }) {
  return (
    <div
      style={{
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: '4px',
        padding: '8px 12px',
        marginBottom: '10px',
        fontSize: '0.72rem',
        color: '#f59e0b',
      }}
    >
      ⚠ {children}
    </div>
  );
}

function Grupo({ opciones, valor, onCambio }) {
  return (
    <div style={{ display: 'flex', gap: '3px' }}>
      {opciones.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onCambio(v)}
          style={{
            padding: '5px 11px',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 800,
            background: valor === v ? 'var(--accent)' : 'var(--bg)',
            color: valor === v ? '#000' : 'var(--text-dim)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const tabContexto = (activo) => ({
  padding: '8px 16px',
  border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 900,
  background: activo ? 'var(--accent)' : 'transparent',
  color: activo ? '#000' : 'var(--text-dim)',
});

const selectChico = {
  padding: '5px 8px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: '3px',
  fontSize: '0.68rem',
  maxWidth: '220px',
};