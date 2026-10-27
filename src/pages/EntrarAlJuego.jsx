import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { GameButton } from '../juegos/ui';
import {
  infoInvitacion, unirseConInvitacion, entrarConGoogle, errorDeEntrada, borrarErrorDeEntrada,
} from '../utils/cuentasJuego';
import '../juegos/juegos.css';

/* ENTRAR AL JUEGO (/unirse/<código>)
 *
 * El link que el club comparte con sus hinchas: muestra el club, pide cómo
 * llamarte (opcional) y entra con Google. Al volver, AuthContext lo suma al
 * club y la app abre los juegos.
 *
 * También es donde cae quien volvió de Google y no pudo entrar (un link
 * vencido, un Gmail del cuerpo técnico, un jugador con otro Gmail ya
 * vinculado): se muestra el motivo y se puede probar con otra cuenta.
 */
export default function EntrarAlJuego() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const { user, perfil, recargarPerfil } = useAuth() || {};
  const [info, setInfo] = useState(undefined);       // undefined: leyendo · null: no existe
  const [nombre, setNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(() => errorDeEntrada());
  const conLink = codigo && codigo !== 'error';

  // El motivo se muestra una vez (queda en pantalla, no vuelve a traer acá).
  useEffect(() => { borrarErrorDeEntrada(); }, []);

  useEffect(() => {
    if (!conLink) return undefined;
    let vivo = true;
    infoInvitacion(codigo)
      .then((d) => { if (vivo) setInfo(d || null); })
      .catch((err) => { if (vivo) { setInfo(null); setError({ texto: err.message }); } });
    return () => { vivo = false; };
  }, [codigo, conLink]);

  // Ya juega: directo a los juegos.
  useEffect(() => { if (perfil?.rol === 'juego') navigate('/juegos', { replace: true }); }, [perfil, navigate]);

  const rol = String(perfil?.rol || '').toLowerCase();
  // Logueado con una cuenta sin club (un Gmail suelto): se suma sin volver a Google.
  const yaLogueado = !!user && (!perfil || rol === 'jugador') && localStorage.getItem('kiosco_mode') !== 'true';

  const entrar = async () => {
    setOcupado(true); setError(null); borrarErrorDeEntrada();
    try {
      if (yaLogueado) {
        await unirseConInvitacion(codigo, nombre.trim() || null);
        await recargarPerfil();
      } else {
        await entrarConGoogle({ accion: 'unirse', codigo, nombre: nombre.trim() || null });
      }
    } catch (err) {
      setError({ texto: err.message });
      setOcupado(false);
    }
  };

  const otraCuenta = async () => {
    borrarErrorDeEntrada();
    await supabase.auth.signOut();
    window.location.href = conLink ? `/unirse/${codigo}` : '/kiosco';
  };

  const cerrada = info?.motivo;
  const fueVincular = error?.accion === 'vincular';

  return (
    <div className="jg jg-ui" style={pantalla}>
      <div style={tarjeta} className="jg-panel jg-entra">
        {conLink && info === undefined && <p style={dim}>Buscando la invitación…</p>}

        {conLink && info && (
          <>
            {info.escudo_url
              ? <img src={info.escudo_url} alt="" width={84} height={84} style={{ objectFit: 'contain', margin: '0 auto' }} />
              : <div style={escudoVacio}>{(info.club_nombre || '?').slice(0, 2).toUpperCase()}</div>}
            <div style={rotulo}>TE INVITA A JUGAR</div>
            <h1 style={titulo}>{info.club_nombre}</h1>
            {info.nombre && <div style={dim}>{info.nombre}</div>}
            <p style={{ ...dim, margin: '14px 0 0' }}>
              Abrí sobres con las cartas del club, armá tu equipo en el V-Draft y pateá penales. Tu colección es tuya y queda en tu Gmail.
            </p>
          </>
        )}

        {conLink && info === null && !error && <p style={dim}>Esta invitación no existe. Pedile al club el link de nuevo.</p>}
        {!conLink && !error && <p style={dim}>Para jugar, entrá con el link que te pasó el club.</p>}

        {error && (
          <div style={alerta} role="alert">
            <b style={{ display: 'block', marginBottom: 4 }}>{fueVincular ? 'NO SE PUDO VINCULAR TU GMAIL' : 'NO SE PUDO ENTRAR'}</b>
            {error.texto.charAt(0).toUpperCase() + error.texto.slice(1)}
          </div>
        )}

        {conLink && info && !cerrada && (
          <>
            <label style={{ ...rotulo, textAlign: 'left', marginTop: 18 }} htmlFor="nombre-hincha">¿CÓMO TE LLAMAMOS? (OPCIONAL)</label>
            <input id="nombre-hincha" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40}
              placeholder="Tu nombre o apodo" style={campo} />
            <GameButton grande ancho onClick={entrar} disabled={ocupado} style={{ marginTop: 12 }}>
              {ocupado ? 'ENTRANDO…' : yaLogueado ? 'ENTRAR AL JUEGO' : 'ENTRAR CON GOOGLE'}
            </GameButton>
            <p style={{ ...dim, fontSize: 12, marginTop: 10 }}>Sólo usamos tu Gmail para guardar tu colección. No ves datos del club ni de los jugadores.</p>
          </>
        )}
        {cerrada && <div style={alerta}>{info.motivo} Pedile al club un link nuevo.</div>}

        {(error || user) && (
          <GameButton variante="ghost" ancho onClick={otraCuenta} style={{ marginTop: 10 }}>
            {fueVincular ? 'VOLVER AL KIOSCO' : 'PROBAR CON OTRA CUENTA'}
          </GameButton>
        )}
      </div>
    </div>
  );
}

const pantalla = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' };
const tarjeta = { width: '100%', maxWidth: 400, textAlign: 'center', display: 'flex', flexDirection: 'column', padding: 24 };
const titulo = { fontFamily: 'var(--jg-display)', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: '4px 0 0', textTransform: 'uppercase' };
const rotulo = { fontSize: 11, fontWeight: 900, letterSpacing: '.18em', color: 'var(--jg-texto-3)', marginTop: 14, display: 'block' };
const dim = { fontSize: 14, color: 'var(--jg-texto-2)', lineHeight: 1.5, margin: '6px 0 0' };
const campo = { marginTop: 6, padding: '12px 14px', fontSize: 16, borderRadius: 10, border: '1px solid var(--jg-borde-fuerte)', background: 'rgba(0,0,0,.35)', color: 'var(--jg-texto)', boxSizing: 'border-box', width: '100%' };
const alerta = { marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', color: '#fecaca', fontSize: 14, textAlign: 'left', lineHeight: 1.45 };
const escudoVacio = { width: 84, height: 84, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--jg-sup-2)', border: '1px solid var(--jg-borde-fuerte)', fontWeight: 900, fontSize: 26 };
