import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  crearInvitacion, invitacionesDelClub, activarInvitacion, cuentasDelClub, quitarCuenta, linkInvitacion, estadoInvitacion,
} from '../../utils/cuentasJuego';

/* GMAIL E HINCHAS (Modo GOD y el panel del manager)
 *
 *   LINKS PARA HINCHAS  el club arma un link (con nombre, vencimiento y tope de
 *                       usos opcionales), lo comparte o muestra el QR, y lo
 *                       pausa cuando quiere. Quien entra juega con su propia
 *                       colección, con las cartas de todas las categorías.
 *   CON GMAIL           quiénes juegan con Gmail: los jugadores que lo
 *                       vincularon desde el kiosco y los hinchas. Se puede
 *                       desvincular a cualquiera (la colección del jugador
 *                       no se pierde: es del jugador).
 */
export default function InvitacionesJuego({ clubId, avisar }) {
  const [invs, setInvs] = useState(null);
  const [cuentas, setCuentas] = useState(null);
  const [form, setForm] = useState({ nombre: '', vence: '', maxUsos: '' });
  const [ocupado, setOcupado] = useState(null);
  const [qr, setQr] = useState(null); // { codigo, src }
  const origen = window.location.origin;

  const cargar = useCallback(async () => {
    try {
      const [i, c] = await Promise.all([invitacionesDelClub(clubId), cuentasDelClub(clubId)]);
      setInvs(i); setCuentas(c);
    } catch (err) {
      setInvs([]); setCuentas([]);
      avisar({ texto: err.message, error: true });
    }
  }, [clubId, avisar]);
  useEffect(() => { cargar(); }, [cargar]);

  const hacer = async (id, fn, ok) => {
    setOcupado(id); avisar(null);
    try { const r = await fn(); await cargar(); if (ok) avisar({ texto: ok }); return r; } catch (err) {
      avisar({ texto: err.message, error: true }); return null;
    } finally { setOcupado(null); }
  };

  const crear = async () => {
    const r = await hacer('crear', () => crearInvitacion(clubId, form), 'Link creado: compartilo con los hinchas.');
    if (r) setForm({ nombre: '', vence: '', maxUsos: '' });
  };
  const copiar = async (inv) => {
    const link = linkInvitacion(origen, inv.codigo);
    try {
      if (navigator.share) await navigator.share({ title: 'Jugá con el club', text: 'Entrá al juego del club con tu Gmail:', url: link });
      else { await navigator.clipboard.writeText(link); avisar({ texto: 'Link copiado.' }); }
    } catch { /* cancelado */ }
  };
  const verQr = async (inv) => {
    if (qr?.codigo === inv.codigo) { setQr(null); return; }
    const src = await QRCode.toDataURL(linkInvitacion(origen, inv.codigo), { margin: 1, width: 240 }).catch(() => null);
    setQr(src ? { codigo: inv.codigo, src } : null);
  };

  if (invs === null) return <div style={dim}>Leyendo…</div>;
  const jugadores = (cuentas || []).filter((c) => c.tipo === 'jugador');
  const hinchas = (cuentas || []).filter((c) => c.tipo === 'hincha');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={dim}>
        Los <b>hinchas</b> entran con un link y su Gmail, y juegan con su propia colección (cartas de todas las categorías del club).
        Los <b>jugadores</b> vinculan su Gmail desde el kiosco (con su PIN) y siguen con su misma colección. Con Gmail se ven sólo los juegos.
      </div>

      <div style={rotulo}>NUEVO LINK PARA HINCHAS</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={etiqueta}>NOMBRE (OPCIONAL)
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej.: Hinchas 2026" maxLength={60} style={{ ...campo, width: 180 }} />
        </label>
        <label style={etiqueta}>VENCE (OPCIONAL)
          <input type="date" value={form.vence} onChange={(e) => setForm({ ...form, vence: e.target.value })} style={campo} />
        </label>
        <label style={etiqueta}>TOPE DE USOS
          <input type="number" min="1" value={form.maxUsos} onChange={(e) => setForm({ ...form, maxUsos: e.target.value })} placeholder="Sin tope" style={{ ...campo, width: 100 }} />
        </label>
        <button style={boton} disabled={!!ocupado} onClick={crear}>{ocupado === 'crear' ? 'CREANDO…' : 'CREAR LINK'}</button>
      </div>

      <div style={rotulo}>LINKS · {invs.length}</div>
      {invs.length === 0 && <div style={dim}>Todavía no hay links.</div>}
      {invs.map((inv) => (
        <div key={inv.codigo} style={{ ...fila, opacity: inv.motivo ? 0.6 : 1 }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 13 }}>{inv.nombre || 'Link para hinchas'}</b>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all' }}>
              {linkInvitacion(origen, inv.codigo)}
            </span>
            <span style={{ ...tag, background: inv.motivo ? '#7f1d1d' : '#14532d', display: 'inline-block', marginTop: 4 }}>{estadoInvitacion(inv)}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button style={chip} onClick={() => copiar(inv)}>{navigator.share ? 'COMPARTIR' : 'COPIAR'}</button>
            <button style={chip} onClick={() => verQr(inv)}>{qr?.codigo === inv.codigo ? 'OCULTAR QR' : 'QR'}</button>
            <button style={chip} disabled={!!ocupado} onClick={() => hacer(inv.codigo, () => activarInvitacion(inv.codigo, !inv.activa), inv.activa ? 'Link pausado: ya no entra nadie nuevo.' : 'Link activo de nuevo.')}>
              {inv.activa ? 'PAUSAR' : 'ACTIVAR'}
            </button>
          </div>
          {qr?.codigo === inv.codigo && <img src={qr.src} alt={`QR del link ${inv.codigo}`} width={200} height={200} style={{ borderRadius: 8, background: '#fff', flexBasis: '100%', maxWidth: 200 }} />}
        </div>
      ))}

      <div style={rotulo}>JUEGAN CON GMAIL · {jugadores.length} {jugadores.length === 1 ? 'JUGADOR' : 'JUGADORES'} · {hinchas.length} {hinchas.length === 1 ? 'HINCHA' : 'HINCHAS'}</div>
      {(cuentas || []).length === 0 && <div style={dim}>Nadie todavía.</div>}
      {(cuentas || []).map((c) => (
        <div key={c.user_id} style={fila}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <b style={{ fontSize: 13 }}>{c.nombre}</b>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)' }}>{c.email || 'sin mail'} · {c.cartas} cartas</span>
          </div>
          <span style={{ ...tag, background: c.tipo === 'jugador' ? '#1d4ed8' : '#7c3aed' }}>{c.tipo === 'jugador' ? 'JUGADOR' : 'HINCHA'}</span>
          <button style={chip} disabled={!!ocupado} onClick={() => {
            if (!window.confirm(c.tipo === 'jugador'
              ? `¿Desvincular el Gmail de ${c.nombre}? Sus cartas quedan; puede volver a vincular desde el kiosco.`
              : `¿Sacar a ${c.nombre} del juego? Ya no va a poder entrar con ese Gmail.`)) return;
            hacer(c.user_id, () => quitarCuenta(c.user_id), c.tipo === 'jugador' ? 'Gmail desvinculado.' : 'Hincha fuera del juego.');
          }}>{c.tipo === 'jugador' ? 'DESVINCULAR' : 'QUITAR'}</button>
        </div>
      ))}
    </div>
  );
}

const boton = { padding: '10px 14px', borderRadius: 8, fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', letterSpacing: '.05em', border: 'none', background: 'var(--accent)', color: '#000' };
const chip = {
  padding: '6px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '.05em', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent',
};
const tag = { fontSize: 10, fontWeight: 900, letterSpacing: '.06em', padding: '2px 6px', borderRadius: 4, color: '#fff' };
const campo = { padding: '7px 10px', fontSize: 12, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6 };
const etiqueta = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--text-dim)' };
const fila = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 };
const dim = { fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)' };
