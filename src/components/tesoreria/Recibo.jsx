import React, { useRef, useState } from 'react';
import { numeroRecibo, textoRecibo, formatoPesos, fechaAR } from '../../analytics/tesoreria';
import { linkWhatsApp } from '../../utils/telefono';

/* ══════════════════════════════════════════════════════════════════════════
   RECIBO DE UN COBRO

   El comprobante con el escudo y el número correlativo del club. Lo abre
   Tesorería al cobrar (o desde los cobros del jugador) y el jugador desde
   "Mis pagos" en el kiosco.

   Compartir: en el celular abre el menú de compartir con la imagen (y de ahí
   WhatsApp); en la compu la descarga. "Mandar por WhatsApp" manda el texto
   al celular del jugador, cuando se tiene.
   ══════════════════════════════════════════════════════════════════════════ */

async function imagenDe(nodo) {
  const html2canvas = (await import('html2canvas')).default;
  const lienzo = await html2canvas(nodo, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  return new Promise((res, rej) => lienzo.toBlob((b) => (b ? res(b) : rej(new Error('sin imagen'))), 'image/png'));
}

export default function Recibo({ club, jugador, pago, telefono, onCerrar }) {
  const ref = useRef(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const anulado = !!pago.anulado_at;
  const archivo = `recibo-${numeroRecibo(pago.recibo_numero)}.png`;

  const compartir = async () => {
    setTrabajando(true); setAviso(null);
    try {
      const blob = await imagenDe(ref.current);
      const file = new File([blob], archivo, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: textoRecibo({ club, jugador, pago }) });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = archivo; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setAviso('Se descargó la imagen del recibo.');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setAviso('No se pudo generar la imagen. Probá con "Mandar por WhatsApp".');
    } finally { setTrabajando(false); }
  };

  const porWhatsApp = () => window.open(linkWhatsApp(telefono || '', textoRecibo({ club, jugador, pago })), '_blank');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}
      onClick={(e) => { if (e.target === e.currentTarget && !trabajando) onCerrar(); }}>
      <div style={{ width: '380px', maxWidth: '100%', maxHeight: '94vh', overflowY: 'auto' }}>

        {/* Lo que se exporta: fondo blanco, se lee bien impreso y en WhatsApp. */}
        <div ref={ref} style={{ background: '#fff', color: '#111', borderRadius: '12px', padding: '22px', fontFamily: 'Arial, sans-serif', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '2px solid #111', paddingBottom: '12px' }}>
            {club?.escudo_url
              ? <img src={club.escudo_url} alt="" crossOrigin="anonymous" style={{ width: '52px', height: '52px', objectFit: 'contain' }} />
              : <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.4rem' }}>{(club?.nombre || 'C').charAt(0)}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', textTransform: 'uppercase', lineHeight: 1.1 }}>{club?.nombre || 'Club'}</div>
              <div style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px' }}>Comprobante de pago</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.65rem', color: '#555', fontWeight: 700 }}>RECIBO N°</div>
              <div style={{ fontWeight: 900, fontSize: '1.05rem', fontFamily: 'monospace' }}>{numeroRecibo(pago.recibo_numero)}</div>
            </div>
          </div>

          <div style={{ padding: '16px 0 6px', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Recibimos de <strong>{[jugador?.nombre, jugador?.apellido].filter(Boolean).join(' ')}</strong>
            {pago.concepto ? <> en concepto de <strong>{pago.concepto}</strong></> : null}.
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 900, margin: '6px 0 12px' }}>{formatoPesos(pago.monto)}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
            <div><div style={{ color: '#555', fontSize: '0.65rem', fontWeight: 700 }}>FECHA</div>{fechaAR(pago.fecha_pago)}</div>
            <div><div style={{ color: '#555', fontSize: '0.65rem', fontWeight: 700 }}>MEDIO DE PAGO</div>{pago.metodo_pago || 'Efectivo'}</div>
          </div>

          {anulado && (
            <div style={{ position: 'absolute', top: '45%', left: '-10%', right: '-10%', transform: 'rotate(-18deg)', textAlign: 'center', color: 'rgba(220,38,38,0.85)', border: '4px solid rgba(220,38,38,0.85)', fontWeight: 900, fontSize: '2rem', letterSpacing: '4px', background: 'rgba(255,255,255,0.6)' }}>
              ANULADO
            </div>
          )}
          <div style={{ marginTop: '16px', fontSize: '0.65rem', color: '#777', textAlign: 'center' }}>Emitido con VirtualClub</div>
        </div>

        {aviso && <div style={{ color: 'var(--text)', fontSize: '0.8rem', textAlign: 'center', marginTop: '10px' }}>{aviso}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
          <button onClick={compartir} disabled={trabajando} style={btn('#3b82f6', '#fff')}>{trabajando ? 'GENERANDO…' : '📤 COMPARTIR / BAJAR'}</button>
          <button onClick={porWhatsApp} style={btn('#25D366', '#000')}>💬 MANDAR POR WHATSAPP</button>
        </div>
        <button onClick={onCerrar} disabled={trabajando} style={{ ...btn('transparent', 'var(--text)'), border: '1px solid var(--border)', width: '100%', marginTop: '8px' }}>CERRAR</button>
      </div>
    </div>
  );
}

const btn = (bg, color) => ({
  background: bg, color, border: 'none', borderRadius: '8px', padding: '12px 8px', fontWeight: 900,
  fontSize: '0.75rem', cursor: 'pointer', minHeight: '46px',
});
