import React, { useMemo, useState } from 'react';
import CartaEspecial from '../quinteto/CartaEspecial';
import { ROLES_HEROE, MAX_RASGOS, normalizarHeroe, erroresHeroe, filaDeHeroe, heroeDeFila, claveHeroe } from '../../analytics/heroes';
import { aplicarAjuste } from '../../analytics/god';
import { publicarCatalogo } from '../../utils/sobres';
import { activarCartas } from '../../utils/god';
import { subirFotoEspecial, quitarFotoEspecial } from '../../utils/cartasFotos';

/* MODO GOD · HÉROES
 *
 * Las figuras que ya no están en el club: se cargan a mano (no hay partidos de
 * donde sacar datos). Cada una: nombre, puesto, media, rasgos y si fue capitán;
 * la foto se sube después de crearla y queda en sepia. Van al catálogo como
 * cartas 'HERO' y, si se marca, sólo salen en el sobre de su evento (la
 * plantilla "Héroes" de EVENTOS las toma todas).
 */

const NUEVO = { nombre: '', apellido: '', rol: 'ALA', ovr: 90, rasgos: '', capitan: false, exclusiva: true };

export default function GodHeroes({ clubId, catalogo, ajustes, fotos, recargar, avisar }) {
  const [editando, setEditando] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const heroes = useMemo(() => (catalogo || []).filter((k) => k.tipo === 'HERO'), [catalogo]);

  const hacer = async (id, fn, ok) => {
    setOcupado(id); avisar(null);
    try { await fn(); await recargar(); if (ok) avisar({ texto: ok }); return true; } catch (err) {
      const msg = /cartas_catalogo_tipo_check|23514/.test(`${err?.message} ${err?.code}`)
        ? 'Falta la migración 20261025120000_heroes.sql en Supabase (para guardar cartas de Héroes).' : err?.message || 'No se pudo.';
      avisar({ texto: msg, error: true });
      return false;
    } finally { setOcupado(null); }
  };

  if (catalogo === null) return <div style={dim}>Leyendo el catálogo…</div>;

  if (editando) {
    return (
      <Editor inicial={editando} existentes={heroes} ocupado={!!ocupado} alCancelar={() => setEditando(null)}
        alGuardar={async (h) => {
          const fila = filaDeHeroe(h);
          if (await hacer('guardar', () => publicarCatalogo(clubId, [fila]), `${fila.carta.nombre} ${fila.carta.apellido}: guardado.`)) setEditando(null);
        }} />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={dim}>
        Figuras que ya no están en el club. Se cargan a mano (no hay partidos de donde sacar datos): nombre, puesto, media y rasgos.
        Después de crearlo, subile la foto: queda en sepia sola. Para que salgan en un sobre, armá el evento con la plantilla
        <b> + HÉROES DEL CLUB</b> en EVENTOS.
      </div>
      <button style={{ ...boton, alignSelf: 'flex-start' }} onClick={() => setEditando(NUEVO)}>+ CREAR HÉROE</button>
      {heroes.length === 0 ? <div style={dim}>Todavía no hay héroes.</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
          {heroes.map((k) => {
            const foto = fotos.get(k.clave);
            const carta = aplicarAjuste({ ...(k.carta || {}), foto: foto || null }, ajustes.get(k.clave));
            return (
              <div key={k.clave} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: k.activa === false ? 0.45 : 1 }}>
                <CartaEspecial carta={carta} tipo="HERO" ancho={176} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {k.activa === false && <span style={{ ...tag, background: '#7f1d1d' }}>DE BAJA</span>}
                  {k.exclusiva_evento && <span style={{ ...tag, background: '#7c5627' }}>SÓLO EVENTO</span>}
                  {!foto && <span style={{ ...tag, background: '#374151' }}>SIN FOTO</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <label style={{ ...chip, cursor: ocupado ? 'wait' : 'pointer' }}>
                    {foto ? 'CAMBIAR FOTO' : 'SUBIR FOTO'}
                    <input type="file" accept="image/*" hidden disabled={!!ocupado} onChange={(e) => {
                      const archivo = e.target.files?.[0]; e.target.value = '';
                      if (archivo) hacer(k.clave, () => subirFotoEspecial({ clubId, clave: k.clave, archivo }), 'Foto guardada (en sepia).');
                    }} />
                  </label>
                  {foto && <button style={chip} disabled={!!ocupado} onClick={() => hacer(k.clave, () => quitarFotoEspecial({ clubId, clave: k.clave }), 'Foto quitada.')}>QUITAR FOTO</button>}
                  <button style={chip} disabled={!!ocupado} onClick={() => setEditando(heroeDeFila(k))}>EDITAR</button>
                  <button style={chip} disabled={!!ocupado} onClick={() => hacer(k.clave, () => activarCartas([k.id], k.activa === false), k.activa === false ? 'Vuelve a estar activa.' : 'Dada de baja (quien la tiene la conserva).')}>
                    {k.activa === false ? 'DAR DE ALTA' : 'DAR DE BAJA'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Editor({ inicial, existentes, ocupado, alGuardar, alCancelar }) {
  const [h, setH] = useState(inicial);
  const cambiar = (k, v) => setH((x) => ({ ...x, [k]: v }));
  const n = normalizarHeroe(h);
  const errores = erroresHeroe({ ...n, claveOriginal: inicial.claveOriginal }, existentes);
  const editandoExistente = !!inicial.claveOriginal;
  const previa = { ...filaDeHeroe(h).carta, foto: null };

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 320px' }}>
        <div style={rotulo}>{editandoExistente ? 'EDITAR HÉROE' : 'CREAR HÉROE'}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={h.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Nombre" maxLength={30} disabled={editandoExistente} style={{ ...campo, width: 150 }} />
          <input value={h.apellido} onChange={(e) => cambiar('apellido', e.target.value)} placeholder="Apellido" maxLength={30} disabled={editandoExistente} style={{ ...campo, width: 150 }} />
        </div>
        {editandoExistente && <div style={dim}>El nombre no se cambia (es la clave de la carta y de su foto). Para otro nombre, creá otro héroe y dá de baja éste.</div>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={etiqueta}>Puesto
            <select value={h.rol} onChange={(e) => cambiar('rol', e.target.value)} style={campo}>
              {ROLES_HEROE.map(([r, t]) => <option key={r} value={r}>{t}</option>)}
            </select>
          </label>
          <label style={etiqueta}>Media
            <input type="number" min={1} max={99} value={h.ovr} onChange={(e) => cambiar('ovr', e.target.value)} style={{ ...campo, width: 70 }} />
          </label>
          <label style={etiqueta}>
            <input type="checkbox" checked={!!h.capitan} onChange={(e) => cambiar('capitan', e.target.checked)} style={{ width: 'auto', margin: 0 }} /> Capitán (lleva la "C")
          </label>
        </div>
        <label style={{ ...etiqueta, flexDirection: 'column', alignItems: 'stretch' }}>
          Rasgos (hasta {MAX_RASGOS}, separados por coma)
          <input value={h.rasgos} onChange={(e) => cambiar('rasgos', e.target.value)} placeholder="Habilidoso, Goleador, Asistidor" style={campo} />
        </label>
        <label style={etiqueta}>
          <input type="checkbox" checked={h.exclusiva !== false} onChange={(e) => cambiar('exclusiva', e.target.checked)} style={{ width: 'auto', margin: 0 }} />
          Sólo en el sobre de su evento (si no, también puede salir como TOTY en los sobres comunes)
        </label>
        {errores.length > 0 && <div style={{ ...dim, color: '#f97316' }}>{errores.join(' ')}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={boton} disabled={ocupado || errores.length > 0} onClick={() => alGuardar(h)}>{ocupado ? 'GUARDANDO…' : 'GUARDAR HÉROE'}</button>
          <button style={chip} onClick={alCancelar}>CANCELAR</button>
        </div>
        {!editandoExistente && n.nombre && <div style={dim}>Clave: {claveHeroe(n)} · después de guardar, subile la foto desde la lista.</div>}
      </div>
      <CartaEspecial carta={previa} tipo="HERO" ancho={240} />
    </div>
  );
}

const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: '#fbbf24', color: '#1a1205' };
const chip = {
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent',
};
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
const campo = { width: 'auto', flex: '0 0 auto', padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
