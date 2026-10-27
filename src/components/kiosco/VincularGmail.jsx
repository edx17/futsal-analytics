import React, { useState } from 'react';
import { tokenKiosco } from '../../utils/kiosco';
import { entrarConGoogle } from '../../utils/cuentasJuego';
import { esCelular } from '../../utils/instalarApp';

/* ENTRÁ CON TU GMAIL (menú del jugador en el kiosco)
 *
 * Con el PIN ya puesto, el jugador vincula su Gmail: desde ahí entra con
 * Google en cualquier celular y ve sólo los juegos, con su misma colección,
 * sus V-Coins y su racha. Se hace en SU celular: en la tablet del club la
 * sesión de Google quedaría abierta para el que venga después.
 */
export default function VincularGmail() {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const token = tokenKiosco();
  const enCelular = esCelular();
  if (!token) return null;

  const vincular = async () => {
    setOcupado(true); setError(null);
    try { await entrarConGoogle({ accion: 'vincular', token }); } catch (err) { setError(err.message); setOcupado(false); }
  };

  return (
    <div style={caja}>
      <button onClick={() => setAbierto((v) => !v)} style={cabecera}>
        <span style={g} aria-hidden="true">G</span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <b style={{ display: 'block', fontSize: '0.85rem', letterSpacing: '0.5px' }}>ENTRÁ CON TU GMAIL</b>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Los juegos sin PIN, con tu misma colección</span>
        </span>
        <span style={{ color: 'var(--text-dim)' }}>{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && (
        <div style={{ padding: '4px 14px 14px', fontSize: '0.8rem', lineHeight: 1.5 }}>
          {enCelular ? (
            <>
              <p style={{ margin: '0 0 10px' }}>
                Vinculá tu Gmail con tu jugador. Después entrás con Google y vas directo a los juegos: <b>sobres, V-Draft y penales</b>,
                con tus cartas, tus V-Coins y tu racha.
              </p>
              <button onClick={vincular} disabled={ocupado} style={boton}>{ocupado ? 'ABRIENDO GOOGLE…' : 'VINCULAR MI GMAIL'}</button>
              {error && <p style={{ margin: '8px 0 0', color: '#ef4444' }}>{error}</p>}
              <p style={{ margin: '10px 0 0', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                Con el Gmail ves sólo los juegos. Para el wellness y tus datos seguí entrando con tu PIN.
              </p>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              Hacelo desde <b>tu celular</b>: entrá con tu PIN ahí (con el QR de arriba) y tocá este mismo botón. En la tablet del club no, que
              tu Gmail quedaría abierto para el próximo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const caja = { width: '100%', maxWidth: '380px', margin: '0 auto 16px', border: '1px solid rgba(66,133,244,0.45)', borderRadius: '12px', background: 'rgba(66,133,244,0.07)', boxSizing: 'border-box' };
const cabecera = { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 14px', background: 'none', border: 'none', outline: 'none', boxShadow: 'none', color: 'var(--text)', cursor: 'pointer', lineHeight: 1.3 };
const g = { width: 28, height: 28, borderRadius: '50%', background: '#fff', color: '#4285f4', fontWeight: 900, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' };
const boton = { width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: '#fff', color: '#1f1f1f', fontWeight: 900, cursor: 'pointer' };
