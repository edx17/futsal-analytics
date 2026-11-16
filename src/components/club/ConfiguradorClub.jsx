import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ToastContext';
import { categoriasDelClub } from '../../utils/categorias';
import { limiteDelClub } from '../../utils/planes';
import {
  RAMAS, TIPOS, PAISES, MODELOS, paisPorId, normalizarConfig, erroresConfig, sumarModelo, sinConfigurar, parecida, idDeLiga,
} from '../../club/configClub';
import { MONO, ACENTO, dim, rotulo, input, boton, botonSec, chip, campo } from '../pruebas/estilos';

/* CONFIG. DE CLUB → RAMAS, PAÍS, LIGAS Y CATEGORÍAS
 *
 * Lo que el club arma acá es lo que el resto de la app ofrece al elegir una
 * categoría (useCategorias). Las categorías se siguen guardando por nombre en
 * cada tabla; si en los datos hay nombres que no están configurados ("3ra"),
 * se unifican con un botón (renombra en toda la base: unificar_categoria).
 */

const MENSAJE_SIN_MIGRACION = 'Falta la migración 20261119120000_club_configurador.sql en Supabase (configurador del club).';
const clon = (x) => JSON.parse(JSON.stringify(x));

export default function ConfiguradorClub({ clubId }) {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const rol = String(perfil?.rol || '').toLowerCase();
  const puedeEditar = ['superuser', 'manager', 'admin'].includes(rol);

  const [club, setClub] = useState(null);
  const [guardado, setGuardado] = useState(null);     // lo que está en la base (para saber si hay cambios)
  const [borrador, setBorrador] = useState(null);
  const [enDatos, setEnDatos] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [sinMigracion, setSinMigracion] = useState(false);
  const [modelo, setModelo] = useState({ id: 'afa', rama: '', liga: '', anioJuego: new Date().getFullYear(), desde: 7, hasta: 12 });
  const [ligaNueva, setLigaNueva] = useState('');

  const cargar = useCallback(async () => {
    if (!clubId) return;
    const [{ data: c }, { data: jug }, { data: par }] = await Promise.all([
      supabase.from('clubes').select('*').eq('id', clubId).maybeSingle(),
      supabase.from('jugadores').select('categoria, activo').eq('club_id', clubId),
      supabase.from('partidos').select('categoria').eq('club_id', clubId),
    ]);
    const cfg = normalizarConfig(c || {});
    setSinMigracion(!!c && !('categorias' in c));
    setClub(c || null);
    setGuardado(cfg);
    setBorrador(clon(cfg));
    setEnDatos(categoriasDelClub(jug || [], par || []).todas);
  }, [clubId]);
  useEffect(() => { cargar(); }, [cargar]);

  const errores = useMemo(() => (borrador ? erroresConfig(borrador) : {}), [borrador]);
  const hayErrores = Object.keys(errores).length > 0;
  const cambios = borrador && guardado && JSON.stringify(borrador) !== JSON.stringify(guardado);
  const limite = limiteDelClub(club);
  const activas = (borrador?.categorias || []).filter((c) => c.activa).length;
  const sueltas = useMemo(() => (borrador ? sinConfigurar(borrador, enDatos) : []), [borrador, enDatos]);

  if (!clubId) return null;
  if (!borrador) return <div className="bento-card" style={{ marginBottom: 30, ...dim }}>Leyendo la configuración del club…</div>;

  const set = (cambio) => setBorrador((b) => ({ ...b, ...(typeof cambio === 'function' ? cambio(b) : cambio) }));
  const setCat = (i, cambio) => set((b) => ({ categorias: b.categorias.map((c, k) => (k === i ? { ...c, ...cambio } : c)) }));
  const moverCat = (i, d) => set((b) => {
    const cs = [...b.categorias]; const j = i + d;
    if (j < 0 || j >= cs.length) return {};
    [cs[i], cs[j]] = [cs[j], cs[i]];
    return { categorias: cs };
  });
  const quitarCat = (i) => set((b) => ({ categorias: b.categorias.filter((_, k) => k !== i) }));
  const nuevaCat = (nombre = '') => set((b) => ({ categorias: [...b.categorias, { nombre, rama: b.ramas[0] || 'Masculino', ligas: [], tipo: 'division', edad_max: null, anio: null, activa: true }] }));
  const toggleRama = (r) => set((b) => ({ ramas: b.ramas.includes(r) ? b.ramas.filter((x) => x !== r) : [...b.ramas, r] }));
  const agregarLiga = (nombre, id = null) => {
    const n = String(nombre || '').trim();
    if (!n) return;
    set((b) => (b.ligas.some((l) => l.nombre.toLowerCase() === n.toLowerCase()) ? {} : { ligas: [...b.ligas, { id: id || idDeLiga(n), nombre: n }] }));
    setLigaNueva('');
  };
  const quitarLiga = (id) => set((b) => ({ ligas: b.ligas.filter((l) => l.id !== id), categorias: b.categorias.map((c) => ({ ...c, ligas: c.ligas.filter((x) => x !== id) })) }));
  const toggleLigaCat = (i, id) => setCat(i, { ligas: borrador.categorias[i].ligas.includes(id) ? borrador.categorias[i].ligas.filter((x) => x !== id) : [...borrador.categorias[i].ligas, id] });

  const pais = paisPorId(borrador.pais);
  const ligasSugeridas = (pais?.ligas || []).filter((l) => !borrador.ligas.some((x) => x.id === l.id || x.nombre.toLowerCase() === l.nombre.toLowerCase()));

  const guardar = async () => {
    if (hayErrores || !cambios) return;
    setOcupado(true);
    try {
      const { error } = await supabase.from('clubes').update({
        pais: borrador.pais, ramas: borrador.ramas, ligas: borrador.ligas, categorias: borrador.categorias,
      }).eq('id', clubId);
      if (error) throw (['42703', 'PGRST204'].includes(error.code) ? new Error(MENSAJE_SIN_MIGRACION) : error);
      showToast('Configuración del club guardada.', 'success');
      await cargar();
    } catch (err) { showToast(err?.message || 'No se pudo guardar.', 'error'); } finally { setOcupado(false); }
  };

  const unificar = async (desde, hacia) => {
    if (!hacia) return;
    if (cambios) { showToast('Primero guardá los cambios de la configuración.', 'warning'); return; }
    if (!window.confirm(`¿Unificar "${desde}" con "${hacia}"?\n\nSe renombra "${desde}" por "${hacia}" en TODO el club: jugadores, partidos, asistencias, torneos, sesiones, videos, pruebas, novedades, usuarios… No hay un botón para deshacerlo.`)) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc('unificar_categoria', { p_club: clubId, p_desde: desde, p_hacia: hacia });
      if (error) throw (['PGRST202', '42883'].includes(error.code) ? new Error(MENSAJE_SIN_MIGRACION) : error);
      const total = Object.values(data || {}).reduce((s, n) => s + Number(n), 0);
      showToast(`"${desde}" unificada con "${hacia}": ${total} registros actualizados.`, 'success');
      await cargar();
    } catch (err) { showToast(err?.message || 'No se pudo unificar.', 'error'); } finally { setOcupado(false); }
  };

  const ramasVisibles = borrador.ramas.length > 1;
  return (
    <div className="bento-card" style={{ marginBottom: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div className="stat-label">RAMAS, LIGAS Y CATEGORÍAS</div>
        <p style={{ ...dim, margin: '6px 0 0', lineHeight: 1.5 }}>
          Lo que armes acá es lo que la app ofrece en todas las pantallas al elegir una categoría, en este orden.
          {borrador.categorias.length === 0 && ' Mientras no cargues ninguna, la app usa las que encuentra en tus jugadores y partidos.'}
        </p>
        {sinMigracion && <p style={{ fontSize: 12, color: '#fbbf24', margin: '6px 0 0' }}>{MENSAJE_SIN_MIGRACION}</p>}
        {!puedeEditar && <p style={{ ...dim, margin: '6px 0 0' }}>Sólo lectura: lo editan el manager y el admin.</p>}
      </div>

      {/* Ramas y país */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={rotulo}>RAMAS</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {RAMAS.map((r) => <button key={r} style={chip(borrador.ramas.includes(r))} disabled={!puedeEditar} onClick={() => toggleRama(r)} aria-pressed={borrador.ramas.includes(r)}>{r}</button>)}
          </div>
        </div>
        <label style={{ ...campo, minWidth: 200 }}>PAÍS
          <select style={input} value={borrador.pais || ''} disabled={!puedeEditar} onChange={(e) => set({ pais: e.target.value || null })}>
            <option value="">Elegí el país…</option>
            {PAISES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
      </div>

      {/* Ligas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={rotulo}>LIGAS EN LAS QUE JUEGA EL CLUB</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {borrador.ligas.length === 0 && <span style={dim}>Ninguna todavía.</span>}
          {borrador.ligas.map((l, i) => (
            <span key={l.id} style={{ ...chip(true), display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'default', borderColor: errores[`liga.${i}`] ? '#ef4444' : undefined }}>
              {l.nombre}
              {puedeEditar && <button onClick={() => quitarLiga(l.id)} aria-label={`Quitar ${l.nombre}`} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: 900 }}>×</button>}
            </span>
          ))}
        </div>
        {puedeEditar && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {ligasSugeridas.map((l) => (
              <button key={l.id} style={chip(false)} onClick={() => agregarLiga(l.nombre, l.id)} title={l.nota || ''}>+ {l.nombre}</button>
            ))}
            <input style={{ ...input, width: 200 }} placeholder="Otra liga…" value={ligaNueva} onChange={(e) => setLigaNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregarLiga(ligaNueva); }} aria-label="Nombre de otra liga" />
            <button style={botonSec} onClick={() => agregarLiga(ligaNueva)} disabled={!ligaNueva.trim()}>AGREGAR</button>
          </div>
        )}
      </div>

      {/* Categorías */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={rotulo}>CATEGORÍAS</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: limite != null && activas > limite ? '#fbbf24' : 'var(--text-dim)' }}>
            {activas} activas{limite != null ? ` · tu plan permite ${limite}` : ''}
          </span>
        </div>
        {borrador.categorias.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: 8, borderRadius: 8, border: `1px solid ${errores[`cat.${i}`] ? '#ef4444' : 'var(--border)'}`, opacity: c.activa ? 1 : 0.55 }}>
            {puedeEditar && (
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <button style={{ ...chip(false), minHeight: 20, padding: '0 6px', fontSize: 10 }} onClick={() => moverCat(i, -1)} disabled={i === 0} aria-label="Subir">▲</button>
                <button style={{ ...chip(false), minHeight: 20, padding: '0 6px', fontSize: 10 }} onClick={() => moverCat(i, 1)} disabled={i === borrador.categorias.length - 1} aria-label="Bajar">▼</button>
              </span>
            )}
            <input style={{ ...input, width: 190, fontWeight: 800 }} value={c.nombre} disabled={!puedeEditar} onChange={(e) => setCat(i, { nombre: e.target.value })} aria-label="Nombre de la categoría" />
            {ramasVisibles && (
              <select style={{ ...input, width: 130 }} value={c.rama} disabled={!puedeEditar} onChange={(e) => setCat(i, { rama: e.target.value })} aria-label="Rama">
                {borrador.ramas.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <select style={{ ...input, width: 190 }} value={c.tipo} disabled={!puedeEditar} onChange={(e) => setCat(i, { tipo: e.target.value })} aria-label="Tipo">
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {c.tipo === 'sub' && <input type="number" style={{ ...input, width: 80, fontFamily: MONO }} placeholder="edad" value={c.edad_max ?? ''} disabled={!puedeEditar}
              onChange={(e) => setCat(i, { edad_max: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Edad máxima" />}
            {c.tipo === 'promocional' && <input type="number" style={{ ...input, width: 90, fontFamily: MONO }} placeholder="año" value={c.anio ?? ''} disabled={!puedeEditar}
              onChange={(e) => setCat(i, { anio: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Año de nacimiento" />}
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 120 }}>
              {borrador.ligas.map((l) => (
                <button key={l.id} style={{ ...chip(c.ligas.includes(l.id)), minHeight: 32, padding: '4px 8px', fontSize: 11 }} disabled={!puedeEditar}
                  onClick={() => toggleLigaCat(i, l.id)} aria-pressed={c.ligas.includes(l.id)}>{c.ligas.includes(l.id) ? '✓ ' : ''}{l.nombre}</button>
              ))}
            </span>
            <button style={{ ...chip(c.activa), minHeight: 32, fontSize: 11 }} disabled={!puedeEditar} onClick={() => setCat(i, { activa: !c.activa })}
              title="Una inactiva no se ofrece para cargar cosas nuevas, pero sus datos se siguen viendo">{c.activa ? 'ACTIVA' : 'INACTIVA'}</button>
            {puedeEditar && <button style={{ ...chip(false), minHeight: 32, width: 32, padding: 0 }} onClick={() => quitarCat(i)} aria-label={`Quitar ${c.nombre}`}>×</button>}
            {errores[`cat.${i}`] && <small style={{ width: '100%', color: '#ef4444', fontSize: 11 }}>{errores[`cat.${i}`]}</small>}
          </div>
        ))}
        {puedeEditar && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'end', paddingTop: 4 }}>
            <button style={botonSec} onClick={() => nuevaCat()}>+ CATEGORÍA</button>
            <span style={{ ...dim, alignSelf: 'center' }}>o sumá varias de un modelo:</span>
            <select style={{ ...input, width: 'auto', minWidth: 220 }} value={modelo.id} onChange={(e) => setModelo({ ...modelo, id: e.target.value })} aria-label="Modelo">
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            {borrador.ramas.length > 1 && (
              <select style={{ ...input, width: 'auto' }} value={modelo.rama || borrador.ramas[0]} onChange={(e) => setModelo({ ...modelo, rama: e.target.value })} aria-label="Rama del modelo">
                {borrador.ramas.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            {borrador.ligas.length > 0 && (
              <select style={{ ...input, width: 'auto' }} value={modelo.liga} onChange={(e) => setModelo({ ...modelo, liga: e.target.value })} aria-label="Liga del modelo">
                <option value="">Sin liga</option>
                {borrador.ligas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            )}
            {modelo.id === 'promocional' && (
              <>
                <label style={{ ...campo, width: 90 }}>TEMPORADA<input type="number" style={{ ...input, fontFamily: MONO }} value={modelo.anioJuego} onChange={(e) => setModelo({ ...modelo, anioJuego: Number(e.target.value) })} /></label>
                <label style={{ ...campo, width: 70 }}>DESDE (AÑOS)<input type="number" style={{ ...input, fontFamily: MONO }} value={modelo.desde} onChange={(e) => setModelo({ ...modelo, desde: Number(e.target.value) })} /></label>
                <label style={{ ...campo, width: 70 }}>HASTA<input type="number" style={{ ...input, fontFamily: MONO }} value={modelo.hasta} onChange={(e) => setModelo({ ...modelo, hasta: Number(e.target.value) })} /></label>
              </>
            )}
            <button style={botonSec} onClick={() => setBorrador((b) => sumarModelo(b, modelo.id, { rama: modelo.rama || b.ramas[0], ligaId: modelo.liga || null, anioJuego: modelo.anioJuego, desde: modelo.desde, hasta: modelo.hasta }))}>SUMAR</button>
          </div>
        )}
      </div>

      {/* En los datos y sin configurar */}
      {sueltas.length > 0 && borrador.categorias.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 10, border: '1px solid #fbbf2455', background: 'rgba(251,191,36,.05)' }}>
          <span style={{ ...rotulo, color: '#fbbf24' }}>EN TUS DATOS PERO SIN CONFIGURAR</span>
          <span style={dim}>Aparecen en jugadores o partidos con un nombre que no está arriba. Unificalas con la que corresponde (renombra en toda la base) o sumalas como están.</span>
          {sueltas.map((s) => <FilaSuelta key={s} nombre={s} config={borrador} puedeEditar={puedeEditar} ocupado={ocupado}
            unificar={(hacia) => unificar(s, hacia)} sumar={() => nuevaCat(s)} />)}
        </div>
      )}

      {puedeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...boton, opacity: cambios && !hayErrores ? 1 : 0.5 }} disabled={!cambios || hayErrores || ocupado} onClick={guardar}>{ocupado ? 'GUARDANDO…' : 'GUARDAR CONFIGURACIÓN'}</button>
          {cambios && <button style={botonSec} disabled={ocupado} onClick={() => setBorrador(clon(guardado))}>DESCARTAR CAMBIOS</button>}
          {hayErrores && <span style={{ fontSize: 12, color: '#ef4444' }}>Hay datos para corregir (en rojo).</span>}
          {cambios && !hayErrores && <span style={{ fontSize: 12, color: ACENTO }}>Hay cambios sin guardar.</span>}
        </div>
      )}
    </div>
  );
}

function FilaSuelta({ nombre, config, puedeEditar, ocupado, unificar, sumar }) {
  const [hacia, setHacia] = useState(() => parecida(config, nombre) || '');
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ minWidth: 120 }}>"{nombre}"</b>
      {puedeEditar && (
        <>
          <span style={dim}>→</span>
          <select style={{ ...input, width: 200 }} value={hacia} onChange={(e) => setHacia(e.target.value)} aria-label={`Unificar ${nombre} con`}>
            <option value="">Unificar con…</option>
            {config.categorias.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <button style={botonSec} disabled={!hacia || ocupado} onClick={() => unificar(hacia)}>UNIFICAR</button>
          <button style={chip(false)} disabled={ocupado} onClick={sumar}>SUMAR COMO ESTÁ</button>
        </>
      )}
    </div>
  );
}
