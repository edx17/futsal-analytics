import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import Recibo from '../components/tesoreria/Recibo';
import { estadoCuentaKiosco } from '../utils/kiosco';
import { numeroRecibo, formatoPesos, fechaAR, saldoDe } from '../analytics/tesoreria';
import { telefonoWhatsApp } from '../utils/telefono';

/* ══════════════════════════════════════════════════════════════════════════
   MIS PAGOS (KIOSCO)

   Lo que el jugador debe, cómo pagarle al club y lo que ya pagó, con el
   recibo de cada cobro para verlo, bajarlo o mandarlo. Todo sale de
   kiosco_estado_cuenta(token): sólo lo del jugador que entró con su PIN.
   ══════════════════════════════════════════════════════════════════════════ */

export default function KioscoMisPagos() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [estado, setEstado] = useState('cargando');
  const [info, setInfo] = useState(null);
  const [recibo, setRecibo] = useState(null);

  useEffect(() => {
    estadoCuentaKiosco().then((r) => {
      if (r.data) { setInfo(r.data); setEstado('ok'); }
      else setEstado(r.vencida ? 'vencida' : r.noDisponible ? 'no-disponible' : 'error');
    });
  }, []);

  const contenedor = { padding: '16px', maxWidth: '520px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '60px' };

  if (estado === 'cargando') return <div style={{ ...contenedor, textAlign: 'center', color: 'var(--text-dim)', paddingTop: '40px' }}>Cargando tus pagos…</div>;
  if (estado !== 'ok') {
    return (
      <div style={{ ...contenedor, textAlign: 'center', paddingTop: '40px' }}>
        <p style={{ color: 'var(--text-dim)' }}>
          {estado === 'vencida' ? 'Tu sesión venció: volvé a entrar con tu PIN.'
            : estado === 'no-disponible' ? 'Esta función todavía no está activada en tu club.'
            : 'No se pudieron cargar tus pagos.'}
        </p>
        <button onClick={() => navigate('/kiosco')} style={btnPrincipal}>IR AL MENÚ</button>
      </div>
    );
  }

  const { club = {}, jugador = {}, deudas = [], pagos = [] } = info;
  const total = deudas.reduce((a, d) => a + saldoDe(d), 0);

  const copiarAlias = async () => {
    try { await navigator.clipboard.writeText(club.alias_cobro); showToast('Alias copiado ✅', 'success'); }
    catch { showToast(`Alias: ${club.alias_cobro}`, 'info'); }
  };
  const mandarComprobante = () => {
    const tel = telefonoWhatsApp(club.whatsapp_tesoreria) || String(club.whatsapp_tesoreria || '').replace(/\D/g, '');
    const msj = `Hola, te mando el comprobante de pago. Soy ${[jugador.nombre, jugador.apellido].filter(Boolean).join(' ')}.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msj)}`, '_blank');
  };

  return (
    <div style={contenedor}>
      <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>🧾 MIS PAGOS</h1>
      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
        Lo que debés, cómo pagar y los recibos de lo que ya pagaste.
      </p>

      {/* SALDO */}
      <div style={{ ...tarjeta, borderColor: total > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
          <span style={rotulo}>{total > 0 ? 'TENÉS PENDIENTE' : 'ESTÁS AL DÍA'}</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: total > 0 ? '#ef4444' : '#10b981' }}>{total > 0 ? formatoPesos(total) : '✅'}</span>
        </div>
        {deudas.map((d) => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.85rem', padding: '6px 0', borderTop: '1px dashed var(--border)', marginTop: '6px' }}>
            <span style={{ color: 'var(--text)' }}>
              {d.concepto}
              <span style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                vence {fechaAR(d.fecha_vencimiento)}{Number(d.monto_pagado) > 0 ? ` · pagaste ${formatoPesos(d.monto_pagado)}` : ''}
              </span>
            </span>
            <strong style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{formatoPesos(saldoDe(d))}</strong>
          </div>
        ))}

        {total > 0 && (
          (club.alias_cobro || club.whatsapp_tesoreria) ? (
            <div style={{ marginTop: '12px' }}>
              {club.alias_cobro && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '8px' }}>
                  Transferí al alias <strong style={{ color: 'var(--text)' }}>{club.alias_cobro}</strong>
                  {club.cbu ? <> · CBU <span style={{ fontFamily: 'monospace' }}>{club.cbu}</span></> : null}
                  {club.cvu ? <> · CVU <span style={{ fontFamily: 'monospace' }}>{club.cvu}</span></> : null}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: club.alias_cobro && club.whatsapp_tesoreria ? '1fr 1fr' : '1fr', gap: '8px' }}>
                {club.alias_cobro && <button onClick={copiarAlias} style={btn('#00b1ea', '#000')}>📋 COPIAR ALIAS</button>}
                {club.whatsapp_tesoreria && <button onClick={mandarComprobante} style={btn('#25D366', '#000')}>📤 MANDAR COMPROBANTE</button>}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '8px' }}>
                Cuando tesorería registre tu pago, el recibo aparece acá abajo.
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '10px' }}>Acercate a tesorería para pagar.</div>
          )
        )}
      </div>

      {/* PAGOS */}
      <div style={{ ...rotulo, margin: '22px 0 8px' }}>LO QUE YA PAGASTE</div>
      {pagos.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Todavía no hay pagos registrados.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pagos.map((p) => (
            <button key={p.id} onClick={() => setRecibo(p)} style={{ ...tarjeta, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--text)', margin: 0 }}>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{p.concepto || 'Pago'}</strong>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{fechaAR(p.fecha_pago)} · {p.metodo_pago || 'Efectivo'} · N° {numeroRecibo(p.recibo_numero)}</span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <strong style={{ display: 'block', color: '#10b981' }}>{formatoPesos(p.monto)}</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>ver recibo ›</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {recibo && <Recibo club={club} jugador={jugador} pago={recibo} onCerrar={() => setRecibo(null)} />}
    </div>
  );
}

const tarjeta = { border: '1px solid var(--border)', background: 'var(--panel)', borderRadius: '12px', padding: '14px', boxSizing: 'border-box' };
const rotulo = { fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' };
const btn = (bg, color) => ({ background: bg, color, border: 'none', borderRadius: '8px', padding: '12px 8px', fontWeight: 900, fontSize: '0.75rem', cursor: 'pointer', minHeight: '46px' });
const btnPrincipal = { padding: '14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', minHeight: '48px' };
