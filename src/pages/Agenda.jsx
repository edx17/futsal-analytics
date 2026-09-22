import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { fetchPaginado } from '../utils/supaPaginado';
import { ordenarCategorias } from '../utils/categorias';
import {
  construirAgenda, porDia, conteoPorTipo, sumarDias, diasEntre,
  TIPOS, ORDEN_TIPOS,
} from '../analytics/agenda';

/* AGENDA ÚNICA
 *
 * Todo lo que tiene fecha en el club, en una sola lista. El partido estaba en
 * Torneos, el entrenamiento en el Microciclo, el apto en Plantel, la cuota en
 * Tesorería y el alta del lesionado en Enfermería: cinco pantallas para
 * contestar "¿qué pasa esta semana?".
 *
 * El armado vive en `src/analytics/agenda.js` y está probado aparte. Acá sólo
 * se baja la ventana una vez y se pinta; mover el rango o cambiar el filtro no
 * vuelve a pegarle a Supabase mientras caiga dentro de lo ya traído.
 */

const MONO = 'JetBrains Mono, monospace';
const hoyISO = () => new Date().toISOString().slice(0, 10);

const RANGOS = [
  { id: 7,  rotulo: '7 DÍAS' },
  { id: 30, rotulo: '30 DÍAS' },
  { id: 90, rotulo: '3 MESES' },
];

/* Se baja siempre la ventana más ancha aunque se muestren 7 días: son pocas
   filas y así cambiar de rango es instantáneo. */
const DIAS_BAJADOS = 120;

const DIAS_SEMANA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const partesDeDia = (dia) => {
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return { dow: DIAS_SEMANA[t.getUTCDay()], dia: d, mes: MESES[m - 1], anio: a };
};

const rotuloRelativo = (dia, hoy) => {
  const n = diasEntre(hoy, dia);
  if (n === 0) return 'HOY';
  if (n === 1) return 'MAÑANA';
  if (n === -1) return 'AYER';
  if (n > 1 && n <= 7) return `EN ${n} DÍAS`;
  return null;
};

export default function Agenda() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const esMovil = useEsMovil();

  const clubId = perfil?.club_id || localStorage.getItem('club_id') || '';
  const esCT = perfil?.rol === 'ct';
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [raw, setRaw] = useState({ partidos: [], sesiones: [], jugadores: [], deudas: [], lesiones: [] });
  const [cargandoBD, setCargandoBD] = useState(true);
  /* Sin club no hay nada que esperar, y derivarlo evita tocar el estado antes
     del primer await (lo que dispara renders en cascada). */
  const cargando = !!clubId && cargandoBD;
  /* Qué fuentes no se pudieron leer. La agenda igual se muestra con el resto. */
  const [fallaron, setFallaron] = useState([]);

  const [dias, setDias] = useState(7);
  const [desplazamiento, setDesplazamiento] = useState(0);   // en ventanas, 0 = la actual
  const [categoria, setCategoria] = useState('Todas');
  const [ocultos, setOcultos] = useState(() => new Set());

  useEffect(() => {
    if (!clubId) return;
    let cancelado = false;

    (async () => {
      setCargandoBD(true);
      setFallaron([]);

      const bajo = sumarDias(hoyISO(), -DIAS_BAJADOS);
      const alto = sumarDias(hoyISO(), DIAS_BAJADOS);

      /* Una sola ventana ancha, y sólo las columnas que la agenda usa. Todo en
         paralelo: son cinco tablas que no dependen entre sí.

         Cada una se pide POR SEPARADO y su error se atrapa acá adentro. Con un
         Promise.all pelado, una sola consulta rota —una columna que no existe,
         una tabla cuya migración todavía no corrió— dejaba la pantalla entera
         en blanco. Ya pasó: el aviso de abajo dice qué falta y el resto de la
         agenda se muestra igual. */
      const fuentes = [
        ['partidos', 'partidos', () => supabase.from('partidos')
          .select('id, fecha, horario, lugar, rival, categoria, condicion, competicion, jornada, estado')
          .eq('club_id', clubId).gte('fecha', bajo).lte('fecha', alto)
          .order('fecha', { ascending: true }).order('id', { ascending: true })],

        ['sesiones', 'entrenamientos', () => supabase.from('sesiones')
          .select('id, fecha, tipo_sesion, objetivo, categoria_equipo, nivel_carga, tareas_ids')
          .eq('club_id', clubId).gte('fecha', bajo).lte('fecha', alto)
          .order('fecha', { ascending: true }).order('id', { ascending: true })],

        ['jugadores', 'jugadores', () => supabase.from('jugadores')
          .select('id, nombre, apellido, categoria, fechanac, vencimiento_apto')
          .eq('club_id', clubId).order('id', { ascending: true })],

        ['deudas', 'cuotas', () => supabase.from('tesoreria_deudas')
          .select('id, jugador_id, concepto, monto_original, monto_pagado, fecha_vencimiento')
          .eq('club_id', clubId).gte('fecha_vencimiento', bajo).lte('fecha_vencimiento', alto)
          .order('id', { ascending: true })],

        ['lesiones', 'altas médicas', () => supabase.from('lesiones')
          .select('id, jugador_id, fecha_alta_estimada, fecha_alta_real, estado, zona, tipo, gravedad')
          .eq('club_id', clubId).gte('fecha_alta_estimada', bajo).lte('fecha_alta_estimada', alto)
          .order('id', { ascending: true })],
      ];

      const resultados = await Promise.all(fuentes.map(async ([clave, rotulo, query]) => {
        try {
          return { clave, filas: await fetchPaginado(query) };
        } catch (e) {
          console.error(`Agenda: falló la lectura de ${clave}:`, e);
          return { clave, filas: [], rotulo };
        }
      }));

      if (cancelado) return;
      const nuevas = {};
      resultados.forEach((r) => { nuevas[r.clave] = r.filas; });
      setRaw(nuevas);
      setFallaron(resultados.filter((r) => r.rotulo).map((r) => r.rotulo));
      setCargandoBD(false);
    })();

    return () => { cancelado = true; };
  }, [clubId]);

  /* Un CT sólo ve lo suyo. El recorte se hace acá y no en la consulta porque
     las cuotas y las lesiones se filtran por la categoría del jugador, que
     recién se conoce con la tabla de jugadores al lado. */
  const datos = useMemo(() => {
    if (!esCT || misCategorias.length === 0) return raw;
    const ok = new Set(misCategorias);
    const jugadores = raw.jugadores.filter((j) => ok.has(j.categoria));
    const ids = new Set(jugadores.map((j) => String(j.id)));
    return {
      partidos: raw.partidos.filter((p) => ok.has(p.categoria)),
      sesiones: raw.sesiones.filter((s) => ok.has(s.categoria_equipo)),
      jugadores,
      deudas: raw.deudas.filter((d) => ids.has(String(d.jugador_id))),
      lesiones: raw.lesiones.filter((l) => ids.has(String(l.jugador_id))),
    };
  }, [raw, esCT, misCategorias]);

  const categorias = useMemo(() => {
    const s = new Set();
    datos.jugadores.forEach((j) => j.categoria && s.add(j.categoria));
    datos.partidos.forEach((p) => p.categoria && s.add(p.categoria));
    datos.sesiones.forEach((x) => x.categoria_equipo && s.add(x.categoria_equipo));
    return ordenarCategorias([...s]);
  }, [datos]);

  /* La ventana visible sale del rango elegido y del corrimiento. Se calcula
     acá adentro, junto con la agenda, para no dejar sueltos dos strings que
     la lista tiene que ver siempre iguales. */
  const { hoy, desde, hasta, agenda } = useMemo(() => {
    const h = hoyISO();
    const d = sumarDias(h, desplazamiento * dias);
    const f = sumarDias(d, dias - 1);
    return { hoy: h, desde: d, hasta: f, agenda: construirAgenda({ ...datos, desde: d, hasta: f, categoria }) };
  }, [datos, dias, desplazamiento, categoria]);

  const conteo = useMemo(() => conteoPorTipo(agenda), [agenda]);
  const visibles = useMemo(() => agenda.filter((e) => !ocultos.has(e.tipo)), [agenda, ocultos]);
  const grupos = useMemo(() => porDia(visibles), [visibles]);

  const alternarTipo = (t) => setOcultos((prev) => {
    const s = new Set(prev);
    if (s.has(t)) s.delete(t); else s.add(t);
    return s;
  });

  if (cargando) {
    return <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>Armando la agenda…</div>;
  }

  const p1 = partesDeDia(desde);
  const p2 = partesDeDia(hasta);
  const rotuloVentana = `${p1.dia} ${p1.mes} — ${p2.dia} ${p2.mes}`;

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)', marginBottom: 6 }}>
        AGENDA
      </div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
        Partidos, entrenamientos, aptos, cuotas, altas y cumpleaños. Todo junto.
      </div>

      {fallaron.length > 0 && (
        <div className="bento-card" style={{ marginBottom: 16, borderColor: '#fbbf24', color: '#fbbf24', fontSize: '0.8rem' }}>
          ⚠️ No se pudo leer: {fallaron.join(', ')}. Lo demás se muestra igual.
        </div>
      )}

      {/* ── controles ─────────────────────────────────────────────────── */}
      <div className="bento-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGOS.map((r) => (
              <button key={r.id} onClick={() => { setDias(r.id); setDesplazamiento(0); }}
                      style={chip(dias === r.id)}>{r.rotulo}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => setDesplazamiento((d) => d - 1)} style={chip(false)} aria-label="Ventana anterior">◀</button>
            <div style={{ fontFamily: MONO, fontSize: '0.75rem', color: 'var(--text-dim)', minWidth: 118, textAlign: 'center' }}>
              {rotuloVentana}
            </div>
            <button onClick={() => setDesplazamiento((d) => d + 1)} style={chip(false)} aria-label="Ventana siguiente">▶</button>
            {desplazamiento !== 0 && (
              <button onClick={() => setDesplazamiento(0)} style={chip(false)}>HOY</button>
            )}
          </div>

          {categorias.length > 1 && (
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
                    style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 6, fontSize: '0.8rem' }}>
              <option value="Todas">Todas las categorías</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Filtros por tipo: el número es lo que hay en la ventana, no un total. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {ORDEN_TIPOS.map((t) => {
            const def = TIPOS[t];
            const activo = !ocultos.has(t);
            return (
              <button key={t} onClick={() => alternarTipo(t)}
                      title={activo ? `Ocultar ${def.rotulo.toLowerCase()}` : `Mostrar ${def.rotulo.toLowerCase()}`}
                      style={{
                        ...chip(activo),
                        borderColor: activo ? def.color : 'var(--border)',
                        color: activo ? def.color : 'var(--text-dim)',
                        opacity: conteo[t] ? 1 : 0.45,
                      }}>
                {def.ico} {def.rotulo} {conteo[t] || 0}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── la lista ──────────────────────────────────────────────────── */}
      {grupos.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          {agenda.length === 0
            ? 'No hay nada agendado en este tramo.'
            : 'Todo lo de este tramo está oculto por los filtros de arriba.'}
        </div>
      ) : (
        grupos.map(({ fecha, eventos }) => {
          const p = partesDeDia(fecha);
          const rel = rotuloRelativo(fecha, hoy);
          const esHoy = fecha === hoy;
          return (
            <div key={fecha} className="bento-card" style={{ marginBottom: 12, borderColor: esHoy ? 'var(--accent)' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: MONO, fontWeight: 900, fontSize: '1rem', color: esHoy ? 'var(--accent)' : 'var(--text)' }}>
                  {p.dow} {String(p.dia).padStart(2, '0')}/{String(MESES.indexOf(p.mes) + 1).padStart(2, '0')}
                </div>
                {rel && (
                  <div style={{ fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.12em', color: esHoy ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {rel}
                  </div>
                )}
              </div>

              {eventos.map((e) => {
                const def = TIPOS[e.tipo];
                return (
                  <div key={e.id} onClick={() => navigate(e.ruta)} role="button" tabIndex={0}
                       onKeyDown={(ev) => { if (ev.key === 'Enter') navigate(e.ruta); }}
                       style={{
                         display: 'grid',
                         gridTemplateColumns: esMovil ? '26px 1fr' : '26px 56px 1fr auto',
                         gap: 10, alignItems: 'center', cursor: 'pointer',
                         padding: '9px 0', borderTop: '1px solid var(--border)',
                       }}>
                    <div style={{ fontSize: '1rem' }} title={def.rotulo}>{def.ico}</div>

                    {!esMovil && (
                      <div style={{ fontFamily: MONO, fontSize: '0.75rem', color: e.hora ? def.color : 'var(--text-dim)' }}>
                        {e.hora || '—'}
                      </div>
                    )}

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {esMovil && e.hora ? <span style={{ fontFamily: MONO, color: def.color, marginRight: 6 }}>{e.hora}</span> : null}
                        {e.titulo}
                      </div>
                      {e.sub && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.sub}
                        </div>
                      )}
                    </div>

                    <div style={{
                      fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.08em',
                      color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap',
                      gridColumn: esMovil ? '2 / 3' : undefined,
                    }}>
                      {e.categoria}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

const chip = (activo) => ({
  background: activo ? 'var(--accent-dim, rgba(0,255,136,0.12))' : 'transparent',
  color: activo ? 'var(--accent)' : 'var(--text-dim)',
  border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontFamily: MONO,
  fontSize: '0.65rem',
  letterSpacing: '0.08em',
  fontWeight: 700,
  cursor: 'pointer',
});
