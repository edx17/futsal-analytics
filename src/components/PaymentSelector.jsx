import React, { useState, useCallback } from 'react';
import { paymentsAR } from '../utils/paymentsAR';

// 🏗️ ARQUITECTURA: Constantes globales fuera del renderizado
const SUPABASE_ICONS_URL = 'https://xwjskbhmwdeadgepsbns.supabase.co/storage/v1/object/public/icons/';
const FALLBACK_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23555"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';

function PaymentSelector({ onMethodSelect, titulo = "Elegí cómo operar:" }) {
  const [metodoGeneral, setMetodoGeneral] = useState('Efectivo');

  // ⚙️ LÓGICA: Envolvemos en useCallback para no recrear la función en cada render
  const handlePaymentNavigation = useCallback((payment) => {
    // Elevamos el estado al padre (Tesoreria o Kiosco)
    if (onMethodSelect) onMethodSelect(payment.name);

    if (!payment.appUrl) {
      // 🔒 SEGURIDAD: Siempre usar noopener noreferrer
      window.open(payment.fallbackUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const start = Date.now();
    window.location.href = payment.appUrl;

    // Fallback por si no tiene la app instalada
    setTimeout(() => {
      const end = Date.now();
      if (end - start < 1500) {
        window.open(payment.fallbackUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1200);
  }, [onMethodSelect]);

  const handleSelectGeneral = (metodo) => {
    setMetodoGeneral(metodo);
    if (onMethodSelect) {
      onMethodSelect(metodo);
    }
  };

  return (
    <div style={{ marginTop: '15px' }}>
      <style>{`
        .payment-grid-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #111;
          border: 1px solid #333;
          padding: 10px 5px;
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .payment-grid-btn:hover {
          border-color: #3b82f6;
          background: #1a1a1a;
        }
        .payment-grid-btn img {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          margin-bottom: 8px;
          object-fit: cover;
        }
        .payment-grid-btn span {
          font-size: 0.65rem;
          color: #ccc;
          text-align: center;
          font-weight: 800;
          line-height: 1.2;
        }
      `}</style>

      <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
        {titulo}
      </label>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button 
          onClick={(e) => { e.preventDefault(); handleSelectGeneral('Efectivo'); }}
          style={{ 
            flex: 1, padding: '12px', borderRadius: '6px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.8rem',
            border: metodoGeneral === 'Efectivo' ? '2px solid #00ff88' : '1px solid #333', 
            background: metodoGeneral === 'Efectivo' ? 'rgba(0, 255, 136, 0.1)' : '#111', 
            color: '#fff' 
          }}
        >
          💵 CAJA FÍSICA
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); handleSelectGeneral('Banco'); }}
          style={{ 
            flex: 1, padding: '12px', borderRadius: '6px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.8rem',
            border: metodoGeneral === 'Banco' ? '2px solid #3b82f6' : '1px solid #333', 
            background: metodoGeneral === 'Banco' ? 'rgba(59, 130, 246, 0.1)' : '#111', 
            color: '#fff' 
          }}
        >
          🏦 BILLETERA / APP
        </button>
      </div>

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
          {paymentsAR?.map((p) => (
            <button
              key={p.id}
              onClick={(e) => { e.preventDefault(); handlePaymentNavigation(p); }}
              className="payment-grid-btn"
            >
              <img 
                src={`${SUPABASE_ICONS_URL}${p.id}.svg`}
                alt={p.name} 
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.src = FALLBACK_SVG;
                }}
              />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(PaymentSelector);