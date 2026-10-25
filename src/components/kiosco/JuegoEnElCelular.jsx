import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  sePuedeInstalar, alCambiarInstalable, instalar, esApp, esIphone, esCelular, linkAlJuego,
} from '../../utils/instalarApp';

/* EL JUEGO EN TU CELULAR (menú del jugador en el kiosco)
 *
 *  - En la tablet del club: un QR. El jugador lo escanea, entra con su PIN y
 *    queda en Sobres; desde ahí la instala.
 *  - En su celular: el botón INSTALAR (Android) o cómo agregarla en iPhone.
 *  - Ya instalada: no se muestra.
 * La sesión del jugador dura meses, así que después abre directo.
 */
export default function JuegoEnElCelular({ clubId }) {
  const [instalable, setInstalable] = useState(sePuedeInstalar());
  const [qr, setQr] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);
  const enCelular = esCelular();
  const link = linkAlJuego(window.location.origin, clubId, 'sobres');

  useEffect(() => alCambiarInstalable(setInstalable), []);
  useEffect(() => {
    if (enCelular || !abierto) return;
    let vivo = true;
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } })
      .then((u) => { if (vivo) setQr(u); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [link, abierto, enCelular]);

  if (esApp() || listo) return null;

  const pedirInstalar = async () => { if (await instalar()) setListo(true); };

  return (
    <div style={caja}>
      <button onClick={() => setAbierto((v) => !v)} style={cabecera}>
        <span style={{ fontSize: '1.4rem' }}>📲</span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <b style={{ display: 'block', fontSize: '0.85rem', letterSpacing: '0.5px' }}>EL JUEGO EN TU CELULAR</b>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sobres y V-Draft con un toque, desde la pantalla de inicio</span>
        </span>
        <span style={{ color: 'var(--text-dim)' }}>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div style={{ padding: '4px 14px 14px', fontSize: '0.8rem', lineHeight: 1.5 }}>
          {!enCelular ? (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              {qr ? <img src={qr} alt="QR para abrir el juego en el celular" width={160} height={160} style={{ borderRadius: '8px', background: '#fff' }} />
                : <div style={{ width: 160, height: 160 }} />}
              <ol style={{ margin: 0, paddingLeft: '18px', flex: 1, minWidth: '180px' }}>
                <li>Escaneá el QR con la cámara de tu celular.</li>
                <li>Elegí tu nombre y poné tu PIN: entrás directo a Sobres.</li>
                <li>Instalala en la pantalla de inicio (te lo ofrece ahí mismo).</li>
              </ol>
            </div>
          ) : instalable ? (
            <>
              <p style={{ margin: '0 0 10px' }}>Instalala y te queda el ícono en la pantalla de inicio. Si mantenés apretado el ícono, aparecen <b>Sobres</b> y <b>V-Draft</b>.</p>
              <button onClick={pedirInstalar} style={boton}>INSTALAR EN ESTE CELULAR</button>
            </>
          ) : esIphone() ? (
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Abrí esta página en <b>Safari</b>.</li>
              <li>Tocá <b>Compartir</b> (el cuadrado con la flecha para arriba).</li>
              <li>Elegí <b>Agregar a inicio</b> y confirmá.</li>
            </ol>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li>Abrí el menú del navegador (los tres puntitos).</li>
              <li>Elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</li>
            </ol>
          )}
          <p style={{ margin: '10px 0 0', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            Tu sesión queda abierta en tu celular: la próxima vez entrás sin PIN. Si lo prestás, cerrá tu sesión.
          </p>
        </div>
      )}
    </div>
  );
}

const caja = { width: '100%', maxWidth: '380px', margin: '0 auto 16px', border: '1px solid rgba(0,255,136,0.35)', borderRadius: '12px', background: 'rgba(0,255,136,0.06)', boxSizing: 'border-box' };
const cabecera = { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 14px', background: 'none', border: 'none', outline: 'none', boxShadow: 'none', color: 'var(--text)', cursor: 'pointer', lineHeight: 1.3 };
const boton = { width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 900, cursor: 'pointer' };
