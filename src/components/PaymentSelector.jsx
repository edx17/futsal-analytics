import React, { useState } from 'react';
import { paymentsAR } from '../utils/paymentsAR';

function PaymentSelector({ onMethodSelect }) {
  const [metodoGeneral, setMetodoGeneral] = useState('Efectivo');

  // ACÁ CONFIGURAMOS LA URL DE TU BUCKET DE SUPABASE
  // Toma el ID del banco/billetera + .png
  const SUPABASE_ICONS_URL = 'https://xwjskbhmwdeadgepsbns.supabase.co/storage/v1/object/public/icons/';

  // Lógica principal de redirección (Deep Link vs Fallback Web)
  const openPayment = (payment) => {
    if (onMethodSelect) onMethodSelect(payment.name);

    if (!payment.appUrl) {
      window.open(payment.fallbackUrl, '_blank');
      return;
    }

    const start = Date.now();
    window.location.href = payment.appUrl;

    setTimeout(() => {
      const end = Date.now();
      if (end - start < 1500) {
        window.open(payment.fallbackUrl, '_blank');
      }
    }, 1200);
  };

  const handleSelectGeneral = (metodo) => {
    setMetodoGeneral(metodo);
    if (metodo === 'Efectivo' && onMethodSelect) {
      onMethodSelect('Efectivo');
    }
  };

  return (
    <div style={{ marginTop: '15px' }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
        Medio de Pago
      </label>
      
      {/* BOTONES PRINCIPALES */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button 
          onClick={(e) => { e.preventDefault(); handleSelectGeneral('Efectivo'); }}
          style={{ flex: 1, padding: '10px', borderRadius: '6px', border: metodoGeneral === 'Efectivo' ? '2px solid #00ff88' : '1px solid #333', background: metodoGeneral === 'Efectivo' ? 'rgba(0, 255, 136, 0.1)' : '#111', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
        >
          💵 EFECTIVO (CAJA)
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); handleSelectGeneral('Banco'); }}
          style={{ flex: 1, padding: '10px', borderRadius: '6px', border: metodoGeneral === 'Banco' ? '2px solid #3b82f6' : '1px solid #333', background: metodoGeneral === 'Banco' ? 'rgba(59, 130, 246, 0.1)' : '#111', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s' }}
        >
          🏦 TRANSFERENCIA
        </button>
      </div>

      {/* GRILLA DE BANCOS/BILLETERAS (Solo si elige Banco) */}
      {metodoGeneral === 'Banco' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', 
          gap: '10px', 
          padding: '15px', 
          background: '#0a0a0a', 
          borderRadius: '8px', 
          border: '1px solid #222',
          maxHeight: '280px',
          overflowY: 'auto'
        }}>
          {paymentsAR.map((p) => (
            <button
              key={p.id}
              onClick={(e) => { e.preventDefault(); openPayment(p); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#111', border: '1px solid #333', padding: '10px 5px', borderRadius: '8px', cursor: 'pointer', transition: '0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
              onMouseOut={(e) => e.currentTarget.style.borderColor = '#333'}
            >
              <img 
                src={`${SUPABASE_ICONS_URL}${p.id}.svg`}
                alt={p.name} 
                style={{ width: '36px', height: '36px', borderRadius: '8px', marginBottom: '8px', objectFit: 'cover' }}
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
                }}
              />
              <span style={{ fontSize: '0.65rem', color: '#ccc', textAlign: 'center', fontWeight: 'bold', lineHeight: '1.2' }}>
                {p.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default PaymentSelector;