import React, { useState } from 'react';
import { AREAS_DEVOLUCION } from '../analytics/reporteJugador';
import { guardarArea, guardarStaff, sugerirStaff } from './devolucion';

/* EDITOR DE LA DEVOLUCIÓN (no se imprime)
 *
 * Un cuadro por área: cada uno lo escribe quien corresponde y se guarda al
 * salir del cuadro (con su nombre como autor). Abajo, el staff de la
 * categoría para el pie del reporte (vale para todos los jugadores de la
 * categoría en esa temporada).
 */
/* Con las seis áreas llenas hasta acá, la hoja 1 (portada + devolución + staff) entra en A4. */
const TOPE = 450;

export default function EditorDevolucion({ clubId, jugadorId, jugadorNombre, temporada, categoria, datos, autorNombre, aMano, setAMano, alGuardar }) {
  const [abierto, setAbierto] = useState(false);
  // Lo guardado, al abrir (el padre remonta el editor al cambiar de jugador o temporada).
  const [textos, setTextos] = useState(() => Object.fromEntries(AREAS_DEVOLUCION.map((x) => [x.id, datos.devolucion[x.id]?.texto || ''])));
  const [staff, setStaff] = useState(() => datos.staff);
  const [estado, setEstado] = useState({});   // area → 'guardando' | 'ok' | mensaje de error
  const [ocupado, setOcupado] = useState(false);

  const guardar = async (area) => {
    const texto = (textos[area] || '').trim();
    if (texto === (datos.devolucion[area]?.texto || '').trim()) return;
    setEstado((e) => ({ ...e, [area]: 'guardando' }));
    try {
      await guardarArea({ clubId, jugadorId, temporada, area, texto, autorNombre });
      setEstado((e) => ({ ...e, [area]: 'ok' }));
      alGuardar();
    } catch (err) { setEstado((e) => ({ ...e, [area]: err?.message || 'No se pudo guardar.' })); }
  };

  const guardarElStaff = async () => {
    setOcupado(true);
    try {
      await guardarStaff({ clubId, categoria, temporada, integrantes: staff.filter((x) => (x.nombre || '').trim()) });
      setEstado((e) => ({ ...e, staff: 'ok' }));
      alGuardar();
    } catch (err) { setEstado((e) => ({ ...e, staff: err?.message || 'No se pudo guardar.' })); } finally { setOcupado(false); }
  };

  const cargadas = AREAS_DEVOLUCION.filter((a) => (datos.devolucion[a.id]?.texto || '').trim()).length;

  return (
    <div className="rp-editor">
      <button type="button" className="rp-boton" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto}>
        {abierto ? '▾' : '▸'} DEVOLUCIÓN Y STAFF · {cargadas} de {AREAS_DEVOLUCION.length} áreas{datos.staff.length ? ` · staff de ${categoria} cargado` : ''}
      </button>
      {datos.sinMigracion && <div className="rp-editor-aviso">Falta correr la migración 20261127120000_reportes_devoluciones.sql en Supabase para guardar la devolución y el staff.</div>}
      {abierto && (
        <div className="rp-editor-cuerpo">
          <div className="rp-editor-ayuda">Lo que escribe cada área sobre {jugadorNombre} en {temporada}. Se guarda solo al salir del cuadro, con tu nombre. En el PDF va en la hoja 1, junto con el staff: para que entre, hasta unos {TOPE} caracteres por área.</div>
          <div className="rp-editor-areas">
            {AREAS_DEVOLUCION.map((a) => {
              const st = estado[a.id];
              const previo = datos.devolucion[a.id];
              return (
                <label key={a.id} className="rp-editor-area">
                  <span className="rp-editor-area-titulo">{a.nombre}
                    <small>{st === 'guardando' ? 'guardando…' : st === 'ok' ? '✓ guardado' : st ? st : previo?.autor_nombre ? `por ${previo.autor_nombre}` : ''}</small>
                  </span>
                  <textarea rows={5} value={textos[a.id] || ''} placeholder="Sin devolución de esta área."
                    onChange={(e) => setTextos((t) => ({ ...t, [a.id]: e.target.value }))} onBlur={() => guardar(a.id)} />
                  <small className={`rp-editor-cuenta${(textos[a.id] || '').length > TOPE ? ' rp-editor-cuenta-pasada' : ''}`}>
                    {(textos[a.id] || '').length} / {TOPE}{(textos[a.id] || '').length > TOPE ? ' · puede no entrar en la hoja 1' : ''}
                  </small>
                </label>
              );
            })}
          </div>
          <label className="rp-editor-check">
            <input type="checkbox" checked={aMano} onChange={(e) => setAMano(e.target.checked)} />
            En el PDF, dejar las áreas vacías con renglones para escribir a mano
          </label>

          <div className="rp-editor-area-titulo" style={{ marginTop: 8 }}>STAFF DE {String(categoria).toUpperCase()} · {temporada} <small>(al pie del reporte de todos los de la categoría)</small></div>
          {staff.map((x, i) => (
            <div key={i} className="rp-editor-staff">
              <input placeholder="Cargo (DT, AT, PF, NUTRI…)" value={x.cargo || ''} onChange={(e) => setStaff((s) => s.map((y, k) => (k === i ? { ...y, cargo: e.target.value } : y)))} />
              <input placeholder="Nombre y apellido" value={x.nombre || ''} onChange={(e) => setStaff((s) => s.map((y, k) => (k === i ? { ...y, nombre: e.target.value } : y)))} />
              <button type="button" className="rp-boton" onClick={() => setStaff((s) => s.filter((_, k) => k !== i))} aria-label="Quitar">✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="rp-boton" onClick={() => setStaff((s) => [...s, { cargo: '', nombre: '' }])}>+ INTEGRANTE</button>
            {!staff.length && <button type="button" className="rp-boton" onClick={async () => setStaff(await sugerirStaff({ clubId, categoria }))}>TRAER EL CUERPO TÉCNICO DE MI STAFF</button>}
            <button type="button" className="rp-boton rp-boton-primario" disabled={ocupado} onClick={guardarElStaff}>{ocupado ? 'GUARDANDO…' : 'GUARDAR STAFF'}</button>
            {estado.staff && <small style={{ color: estado.staff === 'ok' ? 'var(--rp-bien)' : 'var(--rp-mal)' }}>{estado.staff === 'ok' ? '✓ guardado' : estado.staff}</small>}
          </div>
        </div>
      )}
    </div>
  );
}
