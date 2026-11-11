import React, { useCallback, useEffect, useState } from 'react';
import { estadoTorneoGod, guardarTorneoGod } from '../../utils/vdraft';

/* MODO GOD · TORNEO (V-Draft)
 *
 * El torneo semanal del V-Draft se arma solo, de lunes a domingo. Acá se
 * cambian la entrada, cuántas partidas da, el premio extra que pone el club
 * (se suma al pozo) y si hay torneo. La semana en curso toma la entrada y las
 * partidas nuevas sólo si todavía no se anotó nadie; el premio extra, siempre.
 * Abajo, las últimas semanas con su reparto.
 */

const MONO = 'JetBrains Mono, monospace';
const fecha = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

export default function GodTorneo({ clubId, avisar }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await estadoTorneoGod(clubId);
      setDatos(d);
      setForm({ entrada: d.config.entrada, partidas: d.config.partidas, extra: d.config.extra, activo: d.config.activo });
    } catch (err) {
      avisar({ texto: err?.message || 'No se pudo leer.', error: true });
      setDatos({ semanas: [] });
    }
  }, [clubId, avisar]);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const guardar = async () => {
    setOcupado(true); avisar(null);
    try {
      await guardarTorneoGod(clubId, {
        entrada: Math.max(0, Math.round(Number(form.entrada) || 0)),
        partidas: Math.min(20, Math.max(1, Math.round(Number(form.partidas) || 1))),
        extra: Math.max(0, Math.round(Number(form.extra) || 0)),
        activo: !!form.activo,
      });
      await cargar();
      avisar({ texto: 'Torneo guardado.' });
    } catch (err) {
      avisar({ texto: err?.message || 'No se pudo guardar.', error: true });
    } finally { setOcupado(false); }
  };

  if (!datos) return <div style={dim}>Cargando…</div>;
  const cambiar = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'activo' ? e.target.checked : e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {form && (
        <div style={caja}>
          <div style={titulo}>TORNEO SEMANAL DEL V-DRAFT</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
            <label style={etiqueta}>ENTRADA (V-COINS)<input type="number" min="0" value={form.entrada} onChange={cambiar('entrada')} style={campo} /></label>
            <label style={etiqueta}>PARTIDAS<input type="number" min="1" max="20" value={form.partidas} onChange={cambiar('partidas')} style={campo} /></label>
            <label style={etiqueta}>PREMIO EXTRA DEL CLUB<input type="number" min="0" value={form.extra} onChange={cambiar('extra')} style={campo} /></label>
            <label style={{ ...etiqueta, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!form.activo} onChange={cambiar('activo')} /> HAY TORNEO
            </label>
            <button type="button" onClick={guardar} disabled={ocupado} style={boton}>{ocupado ? 'GUARDANDO…' : 'GUARDAR'}</button>
          </div>
          <div style={{ ...dim, marginTop: 8 }}>
            Se arma solo de lunes a domingo. El pozo (entradas + premio extra) se reparte el lunes: 50/30/20 entre los 3 primeros;
            con 2 anotados, 60/40; con uno solo, se le devuelve la entrada. La semana en curso toma la entrada y las partidas nuevas
            sólo si todavía no se anotó nadie; el premio extra se puede subir siempre.
          </div>
        </div>
      )}
      <div style={caja}>
        <div style={titulo}>ÚLTIMAS SEMANAS</div>
        {!datos.semanas?.length && <div style={{ ...dim, marginTop: 6 }}>Todavía no hubo torneos.</div>}
        {datos.semanas?.map((s) => (
          <div key={s.semana} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', marginTop: 6 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
              <b>Semana del {fecha(s.semana)}</b>
              <span style={dim}>{s.anotados} anotados · entrada {s.entrada} · {s.partidas} partidas · extra {s.extra}</span>
              <span style={{ ...dim, color: s.pagado_at ? '#22c55e' : '#fbbf24' }}>{s.pagado_at ? `repartido el ${fecha(s.pagado_at)}` : 'en juego'}</span>
            </div>
            {s.resultado?.slice(0, 3).map((r) => (
              <div key={r.dueno} style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: MONO, marginTop: 2 }}>
                <span>{r.puesto}º</span><span style={{ flex: 1 }}>{r.nombre}</span><span>{r.victorias}G</span><span style={{ color: '#fbbf24' }}>+{r.premio}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const caja = { padding: 12, borderRadius: 10, border: '1px solid var(--border)' };
const titulo = { fontSize: '0.75rem', fontWeight: 900, letterSpacing: '.08em', color: '#38bdf8' };
const etiqueta = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 900, letterSpacing: '.06em', color: 'var(--text-dim)' };
const campo = { width: 120, padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const boton = { padding: '8px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: '#38bdf8', color: '#04121c', minHeight: 36 };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
