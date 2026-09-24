import React, { useRef, useState } from 'react';
import { supabase } from '../../supabase';
import {
  COLUMNAS, leerPlanilla, planDeCarga, parsearCSV, fechaArgentina,
} from '../../analytics/cargaMasiva';

/* ══════════════════════════════════════════════════════════════════════════
   PLANILLA DEL PLANTEL: BAJAR, COMPLETAR, SUBIR

   La lógica (qué se crea, qué cambia, qué está mal) vive en
   analytics/cargaMasiva.js. Acá sólo se lee el archivo, se muestra el plan
   y, si el club confirma, se guarda.

   Las librerías de Excel se cargan recién cuando se usan: son ~100 KB que
   no tienen por qué bajar todos los que entran a Mi Plantel.
   ══════════════════════════════════════════════════════════════════════════ */

const valorLindo = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  const col = COLUMNAS.find((c) => c.k === k);
  return col?.tipo === 'fecha' ? fechaArgentina(v) : String(v);
};

/* Mismo alta que el formulario de Mi Plantel: PIN de 4 dígitos y username. */
function payloadAlta(datos, clubId) {
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  const username = `${datos.apellido || datos.nombre}_${datos.dorsal ?? ''}_${pin}`.toLowerCase().replace(/\s+/g, '');
  return { ...datos, club_id: clubId, pin_kiosco: pin, username, user_id: null };
}

async function leerArchivo(archivo) {
  if (/\.csv$/i.test(archivo.name) || archivo.type === 'text/csv') {
    return parsearCSV(await archivo.text());
  }
  /* La hoja JUGADORES si está (así la dejamos al bajarla); si la
     renombraron o es un Excel propio del club, la primera. */
  const { default: readExcelFile } = await import('read-excel-file/browser');
  const hojas = await readExcelFile(archivo);
  const hoja = hojas.find((h) => String(h.sheet).trim().toUpperCase() === 'JUGADORES') || hojas[0];
  return hoja?.data || [];
}

/* ── El modal ─────────────────────────────────────────────────────────── */

export default function CargaPlanilla({ jugadores, clubId, onCerrar, onGuardado, showToast }) {
  const inputRef = useRef(null);
  const [archivo, setArchivo] = useState(null);
  const [lectura, setLectura] = useState(null); // { plan, ignoradas } | { error }
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const elegir = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setArchivo(f);
    setResultado(null);
    setLeyendo(true);
    try {
      const matriz = await leerArchivo(f);
      const hoja = leerPlanilla(matriz);
      if (hoja.error) setLectura({ error: hoja.error });
      else setLectura({ plan: planDeCarga(hoja.filas, jugadores), ignoradas: hoja.ignoradas });
    } catch (err) {
      console.error('Leyendo planilla:', err);
      setLectura({ error: 'No pude leer el archivo. Tiene que ser un Excel (.xlsx) o un CSV.' });
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async () => {
    const { plan } = lectura;
    setGuardando(true);
    const fallas = [];
    let actualizados = 0;
    let creados = 0;

    // De a 10 en paralelo: rápido sin saturar la conexión de un celular.
    for (let i = 0; i < plan.cambios.length; i += 10) {
      const tanda = plan.cambios.slice(i, i + 10);
      const r = await Promise.all(tanda.map((c) =>
        supabase.from('jugadores').update(c.datos).eq('id', c.jugador.id).eq('club_id', clubId)));
      r.forEach(({ error }, j) => {
        if (error) fallas.push(`Fila ${tanda[j].nroFila}: ${error.message}`);
        else actualizados++;
      });
    }

    if (plan.nuevos.length > 0) {
      const { error } = await supabase.from('jugadores').insert(plan.nuevos.map((n) => payloadAlta(n.datos, clubId)));
      if (error) fallas.push(`Altas: ${error.message}`);
      else creados = plan.nuevos.length;
    }

    setGuardando(false);
    setResultado({ actualizados, creados, fallas });
    if (fallas.length === 0) showToast?.(`Planilla guardada: ${creados} altas, ${actualizados} actualizados ✅`, 'success');
    onGuardado?.();
  };

  const plan = lectura?.plan;
  const hayAlgo = plan && (plan.nuevos.length + plan.cambios.length) > 0;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}>
      <div className="bento-card modal-content" style={{ maxWidth: '720px', background: 'var(--panel)' }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>📊 CARGA POR PLANILLA</h2>
          <button onClick={onCerrar} disabled={guardando} className="close-btn">×</button>
        </div>

        {!resultado && (
          <>
            <ol style={{ margin: '0 0 16px', paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              <li>Bajá la planilla con <strong style={{ color: 'var(--text)' }}>⬇ BAJAR PLANILLA</strong> (trae todo lo que ya está cargado).</li>
              <li>Completala en Excel o Google Sheets. Para un jugador nuevo, agregá una fila con el ID vacío.</li>
              <li>Subila acá. Antes de guardar vas a ver exactamente qué cambia.</li>
            </ol>

            <input ref={inputRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={elegir} style={{ display: 'none' }} />
            <button onClick={() => inputRef.current?.click()} disabled={leyendo || guardando} className="btn-action" style={{ width: '100%', marginBottom: '16px' }}>
              {leyendo ? 'LEYENDO…' : archivo ? `📄 ${archivo.name} · ELEGIR OTRO` : '⬆ ELEGIR ARCHIVO (.xlsx o .csv)'}
            </button>
          </>
        )}

        {lectura?.error && (
          <div style={{ ...caja('#ef4444'), fontSize: '0.85rem' }}>{lectura.error}</div>
        )}

        {plan && !resultado && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(120px, 100%), 1fr))', gap: '8px', marginBottom: '14px' }}>
              <Numero n={plan.nuevos.length} t="NUEVOS" c="var(--accent)" />
              <Numero n={plan.cambios.length} t="CON CAMBIOS" c="#3b82f6" />
              <Numero n={plan.sinCambios} t="SIN CAMBIOS" c="var(--text-dim)" />
              <Numero n={plan.errores.length} t="CON ERRORES" c="#ef4444" />
            </div>

            {lectura.ignoradas?.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '12px' }}>
                Columnas que no reconozco y no se guardan: {lectura.ignoradas.join(', ')}.
              </div>
            )}

            {plan.errores.length > 0 && (
              <Seccion titulo="⚠️ NO SE VAN A GUARDAR (corregilas y volvé a subir)" color="#ef4444">
                {plan.errores.map((e) => (
                  <div key={e.nroFila} style={fila}>
                    <strong>Fila {e.nroFila} · {e.jugador}</strong>
                    {e.problemas.map((p) => <div key={p} style={{ color: '#ef4444', fontSize: '0.78rem' }}>• {p}</div>)}
                  </div>
                ))}
              </Seccion>
            )}

            {plan.nuevos.length > 0 && (
              <Seccion titulo="➕ JUGADORES NUEVOS" color="var(--accent)">
                {plan.nuevos.map((n) => (
                  <div key={n.nroFila} style={fila}>
                    <strong>{n.datos.apellido}, {n.datos.nombre}</strong>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}> · {n.datos.categoria}{n.datos.dorsal !== undefined ? ` · #${n.datos.dorsal}` : ''}</span>
                  </div>
                ))}
              </Seccion>
            )}

            {plan.cambios.length > 0 && (
              <Seccion titulo="✏️ CAMBIOS" color="#3b82f6">
                {plan.cambios.map((c) => (
                  <div key={c.nroFila} style={fila}>
                    <strong>{c.jugador.apellido}, {c.jugador.nombre}</strong>
                    {c.diffs.map((d) => (
                      <div key={d.k} style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                        {d.t}: <span style={{ textDecoration: 'line-through' }}>{valorLindo(d.k, d.antes)}</span> → <span style={{ color: 'var(--text)', fontWeight: 800 }}>{valorLindo(d.k, d.despues)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </Seccion>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button onClick={onCerrar} disabled={guardando} className="btn-secondary" style={{ flex: '1 1 140px' }}>CANCELAR</button>
              <button onClick={guardar} disabled={!hayAlgo || guardando} className="btn-action" style={{ flex: '2 1 200px', opacity: hayAlgo ? 1 : 0.5 }}>
                {guardando ? 'GUARDANDO…' : hayAlgo ? `GUARDAR ${plan.nuevos.length} ALTAS Y ${plan.cambios.length} CAMBIOS` : 'NO HAY NADA PARA GUARDAR'}
              </button>
            </div>
          </>
        )}

        {resultado && (
          <div>
            <div style={caja(resultado.fallas.length ? '#f59e0b' : 'var(--accent)')}>
              <div style={{ fontWeight: 900, marginBottom: '6px' }}>
                {resultado.fallas.length ? 'Se guardó una parte' : 'Listo ✅'}
              </div>
              <div style={{ fontSize: '0.85rem' }}>{resultado.creados} jugadores nuevos · {resultado.actualizados} actualizados.</div>
              {resultado.creados > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                  Los nuevos ya tienen su PIN del kiosco: lo ves en su ficha o con COPIAR WHATSAPP.
                </div>
              )}
              {resultado.fallas.map((f) => <div key={f} style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: '4px' }}>• {f}</div>)}
            </div>
            <button onClick={onCerrar} className="btn-action" style={{ width: '100%', marginTop: '14px' }}>CERRAR</button>
          </div>
        )}
      </div>
    </div>
  );
}

const caja = (c) => ({ border: `1px solid ${c}`, background: 'var(--bg)', borderRadius: '8px', padding: '12px', marginBottom: '12px', color: 'var(--text)' });
const fila = { padding: '8px 0', borderBottom: '1px dashed var(--border)', fontSize: '0.85rem', color: 'var(--text)' };

function Numero({ n, t, c }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: c, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: '0.6rem', fontWeight: 900, color: 'var(--text-dim)', marginTop: '4px' }}>{t}</div>
    </div>
  );
}

function Seccion({ titulo, color, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 900, color, letterSpacing: '0.5px', marginBottom: '4px' }}>{titulo}</div>
      <div style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '4px' }}>{children}</div>
    </div>
  );
}
