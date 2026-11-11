import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACCIONES_MISION, accionPorId, DIAS_SEMANA, LIMITES, nuevaMision, erroresDeMisiones, paraGuardar, misionesDelDia, tituloSugerido, diaIso,
} from '../../analytics/misionesGod';
import { leerMisionesGod, guardarMisionesGod, restablecerMisionesGod } from '../../utils/god';

/* CONFIGURADOR GOD › MISIONES
 *
 * Las misiones diarias del club: qué hay que hacer (una acción que la base
 * cuenta sola), cuántas veces, cuánto paga, qué días y si está prendida. Se
 * edita la lista entera y se guarda de una vez. Mientras no se toque, valen
 * las 4 de siempre. Cambiar una misión no borra lo que ya se cobró hoy.
 */

const ORO = '#fbbf24';
const NOMBRE_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export default function GodMisiones({ clubId, esMovil }) {
  const [lista, setLista] = useState(null);
  const [original, setOriginal] = useState('');
  const [personalizadas, setPersonalizadas] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = useCallback((d) => {
    const misiones = (d?.misiones || []).map((m) => ({ ...m, dias: m.dias || [1, 2, 3, 4, 5, 6, 7] }));
    setLista(misiones);
    setOriginal(JSON.stringify(paraGuardar(misiones)));
    setPersonalizadas(!!d?.personalizadas);
  }, []);
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    leerMisionesGod(clubId)
      .then((d) => { if (vivo) aplicar(d); })
      .catch((err) => { if (vivo) { setAviso({ texto: err?.message || 'No se pudieron leer las misiones.', error: true }); setLista([]); } });
    return () => { vivo = false; };
  }, [clubId, aplicar]);

  const errores = useMemo(() => erroresDeMisiones(lista || []), [lista]);
  const cambios = lista !== null && JSON.stringify(paraGuardar(lista)) !== original;
  const hoy = diaIso();
  const delDia = misionesDelDia(lista || [], hoy);

  const cambiar = (i, campos) => setLista((l) => l.map((m, n) => {
    if (n !== i) return m;
    const nueva = { ...m, ...campos };
    // Si el título era el sugerido, sigue a la acción y la meta.
    if (('accion' in campos || 'meta' in campos) && m.titulo === tituloSugerido(m.accion, m.meta)) nueva.titulo = tituloSugerido(nueva.accion, nueva.meta);
    if ('accion' in campos && accionPorId[nueva.accion]?.metaFija) nueva.meta = accionPorId[nueva.accion].metaFija;
    return nueva;
  }));
  const mover = (i, d) => setLista((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const quitar = (i) => setLista((l) => l.filter((_, n) => n !== i));
  const alternarDia = (i, d) => {
    const dias = new Set(lista[i].dias);
    if (dias.has(d)) dias.delete(d); else dias.add(d);
    cambiar(i, { dias: [...dias].sort((a, b) => a - b) });
  };

  const guardar = async () => {
    if (errores.length) return;
    setOcupado(true); setAviso(null);
    try { aplicar(await guardarMisionesGod(clubId, paraGuardar(lista))); setAviso({ texto: 'Misiones guardadas. Los jugadores ya las ven.' }); } catch (err) {
      setAviso({ texto: err?.message || 'No se pudieron guardar.', error: true });
    } finally { setOcupado(false); }
  };
  const restablecer = async () => {
    if (!window.confirm('¿Volver a las 4 misiones de siempre? Se borran las que armaste.')) return;
    setOcupado(true); setAviso(null);
    try { aplicar(await restablecerMisionesGod(clubId)); setAviso({ texto: 'Volvieron las misiones de siempre.' }); } catch (err) {
      setAviso({ texto: err?.message || 'No se pudo.', error: true });
    } finally { setOcupado(false); }
  };

  if (lista === null) return <div style={dim}>Leyendo las misiones…</div>;
  const errorDe = (i) => errores.filter((e) => e.i === i).map((e) => e.texto).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...dim, lineHeight: 1.5 }}>
        El progreso lo cuenta la base sola con lo que juega cada uno (no se puede inflar). Cambiar una misión no borra lo que ya se cobró hoy.
        {!personalizadas && <> Ahora valen <b style={{ color: 'var(--text)' }}>las de siempre</b>.</>}
      </div>

      <div className="bento-card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: `${ORO}55` }}>
        <span style={{ fontSize: 13 }}>Hoy ({NOMBRE_DIA[hoy]}) se ven <b>{delDia.misiones.length}</b> misiones · hasta <b style={{ color: ORO }}>{delDia.vcoins} V-Coins</b> por jugador</span>
        <span style={{ flex: 1 }} />
        {personalizadas && <button style={chip(false)} disabled={ocupado} onClick={restablecer}>VOLVER A LAS DE SIEMPRE</button>}
        <button style={chip(false)} disabled={lista.length >= LIMITES.misiones} onClick={() => setLista((l) => [...l, nuevaMision(l)])}>+ AGREGAR MISIÓN</button>
        <button style={{ ...boton, background: ORO, color: '#1a1205', opacity: cambios && !errores.length ? 1 : 0.5 }}
          disabled={!cambios || errores.length > 0 || ocupado} onClick={guardar}>{ocupado ? 'GUARDANDO…' : 'GUARDAR'}</button>
      </div>
      {aviso && <div role="status" style={{ fontSize: 13, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</div>}
      {cambios && !aviso && <div style={{ fontSize: 12, color: ORO }}>Hay cambios sin guardar.</div>}

      {lista.length === 0 && (
        <div className="bento-card" style={{ padding: 24, textAlign: 'center', ...dim }}>Sin misiones: los jugadores no van a ver ninguna. Agregá una o volvé a las de siempre.</div>
      )}

      {lista.map((m, i) => (
        <div key={m.id} className="bento-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, opacity: m.activa === false ? 0.6 : 1,
          borderColor: errorDe(i) ? '#ef4444' : undefined }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22 }} aria-hidden="true">{accionPorId[m.accion]?.icono || '★'}</span>
            <input value={m.titulo} maxLength={LIMITES.titulo} onChange={(e) => cambiar(i, { titulo: e.target.value })} aria-label="Título"
              style={{ ...input, flex: 1, minWidth: 180, fontWeight: 800 }} />
            <button style={chip(m.activa !== false)} onClick={() => cambiar(i, { activa: m.activa === false })} aria-pressed={m.activa !== false}>
              {m.activa === false ? 'APAGADA' : 'PRENDIDA'}
            </button>
            <button style={chipChico} onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">▲</button>
            <button style={chipChico} onClick={() => mover(i, 1)} disabled={i === lista.length - 1} aria-label="Bajar">▼</button>
            <button style={{ ...chipChico, color: '#ef4444' }} onClick={() => quitar(i)} aria-label="Borrar">✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : 'minmax(200px, 2fr) 90px 110px minmax(240px, 2fr)', gap: 10, alignItems: 'end' }}>
            <label style={{ ...campo, gridColumn: esMovil ? '1 / -1' : 'auto' }}>QUÉ HAY QUE HACER
              <select value={m.accion} onChange={(e) => cambiar(i, { accion: e.target.value })} style={input}>
                {ACCIONES_MISION.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
            <label style={campo}>VECES
              <input type="number" min={1} max={LIMITES.meta} value={m.meta} disabled={!!accionPorId[m.accion]?.metaFija}
                onChange={(e) => cambiar(i, { meta: Number(e.target.value) })} style={input} />
            </label>
            <label style={campo}>PREMIO (V-COINS)
              <input type="number" min={0} max={LIMITES.premio} value={m.premio} onChange={(e) => cambiar(i, { premio: Number(e.target.value) })} style={input} />
            </label>
            <div style={{ ...campo, gridColumn: esMovil ? '1 / -1' : 'auto' }}>DÍAS
              <div style={{ display: 'flex', gap: 4 }}>
                {DIAS_SEMANA.map(([d, l]) => (
                  <button key={d} onClick={() => alternarDia(i, d)} aria-pressed={m.dias.includes(d)} title={NOMBRE_DIA[d]}
                    style={{ ...chipDia, borderColor: m.dias.includes(d) ? ORO : 'var(--border)', color: m.dias.includes(d) ? ORO : 'var(--text-dim)',
                      background: m.dias.includes(d) ? 'rgba(251,191,36,.1)' : 'transparent' }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          {errorDe(i) && <div style={{ fontSize: 12, color: '#ef4444' }}>{errorDe(i)}</div>}
        </div>
      ))}
    </div>
  );
}

const dim = { color: 'var(--text-dim)', fontSize: '0.8rem' };
const campo = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-dim)' };
const input = { width: '100%', padding: '8px 10px', minHeight: 40, borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14 };
const boton = { padding: '10px 18px', minHeight: 44, borderRadius: 8, border: 'none', fontWeight: 900, letterSpacing: '.06em', cursor: 'pointer', fontSize: 13 };
const chip = (activo) => ({
  padding: '8px 12px', minHeight: 40, whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800, letterSpacing: '.06em',
  border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, color: activo ? 'var(--accent)' : 'var(--text-dim)', background: 'transparent',
});
const chipChico = { ...chip(false), padding: '8px 10px', minWidth: 40 };
const chipDia = { flex: 1, minWidth: 30, minHeight: 40, borderRadius: 8, border: '1px solid', cursor: 'pointer', fontWeight: 900, fontSize: 12 };
