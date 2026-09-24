import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';
import {
  CAMPOS_MIS_DATOS, misDatosKiosco, proponerCambiosKiosco, cancelarCambiosKiosco,
} from '../utils/kiosco';

/* ══════════════════════════════════════════════════════════════════════════
   MIS DATOS (KIOSCO)

   El jugador o su familia corrigen el celular, el contacto de emergencia,
   la obra social y el grupo sanguíneo. No se guarda en la ficha: queda como
   pedido hasta que un admin, manager o superuser del club lo apruebe.
   ══════════════════════════════════════════════════════════════════════════ */

const ESTADO_ULTIMA = {
  aprobada:  { t: '✅ El club aprobó tus últimos cambios.', c: '#10b981' },
  parcial:   { t: '☑️ El club aprobó una parte de tus últimos cambios.', c: '#f59e0b' },
  rechazada: { t: '✖️ El club no aprobó tus últimos cambios.', c: '#ef4444' },
};

const tituloDe = (k) => CAMPOS_MIS_DATOS.find((c) => c.k === k)?.t || k;

export default function KioscoMisDatos() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [estado, setEstado] = useState('cargando');
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({});
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    const r = await misDatosKiosco();
    if (r.data) {
      setInfo(r.data);
      const base = {};
      CAMPOS_MIS_DATOS.forEach((c) => {
        // Si hay un pedido pendiente, el formulario arranca con lo pedido.
        const pedido = r.data.pendiente?.cambios?.[c.k];
        base[c.k] = pedido ? (pedido.despues ?? '') : (r.data.datos?.[c.k] ?? '');
      });
      setForm(base);
      setEstado('ok');
    } else setEstado(r.vencida ? 'vencida' : r.noDisponible ? 'no-disponible' : 'error');
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, []);

  const enviar = async () => {
    setEnviando(true);
    const r = await proponerCambiosKiosco(form);
    setEnviando(false);
    if (r.error || r.vencida) {
      showToast(r.vencida ? 'Tu sesión venció: volvé a entrar con tu PIN.' : 'No se pudo enviar. Probá de nuevo.', 'error');
      return;
    }
    if (r.data === null) {
      showToast('No cambiaste nada 👌', 'info');
      return;
    }
    showToast('Listo, el club lo va a revisar ✅', 'success');
    cargar();
  };

  const cancelar = async () => {
    await cancelarCambiosKiosco();
    showToast('Pedido cancelado.', 'info');
    cargar();
  };

  const contenedor = { padding: '16px', maxWidth: '520px', margin: '0 auto', boxSizing: 'border-box', paddingBottom: '60px' };

  if (estado === 'cargando') return <div style={{ ...contenedor, textAlign: 'center', color: 'var(--text-dim)', paddingTop: '40px' }}>Cargando tus datos…</div>;
  if (estado !== 'ok') {
    return (
      <div style={{ ...contenedor, textAlign: 'center', paddingTop: '40px' }}>
        <p style={{ color: 'var(--text-dim)' }}>
          {estado === 'vencida' ? 'Tu sesión venció: volvé a entrar con tu PIN.'
            : estado === 'no-disponible' ? 'Esta función todavía no está activada en tu club.'
            : 'No se pudieron cargar tus datos.'}
        </p>
        <button onClick={() => navigate('/kiosco')} style={btnPrincipal}>IR AL MENÚ</button>
      </div>
    );
  }

  const pendiente = info?.pendiente;
  const ultima = !pendiente && info?.ultima ? ESTADO_ULTIMA[info.ultima.estado] : null;

  return (
    <div style={contenedor}>
      <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>📝 MIS DATOS</h1>
      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
        Si algo está mal o cambió, corregilo acá. El club lo revisa y lo aprueba antes de que quede en tu ficha.
      </p>

      {pendiente && (
        <div style={aviso('#3b82f6')}>
          <div style={{ fontWeight: 900, marginBottom: '6px' }}>⏳ Tenés cambios esperando aprobación</div>
          {Object.entries(pendiente.cambios || {}).map(([k, v]) => (
            <div key={k} style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {tituloDe(k)}: <span style={{ textDecoration: 'line-through' }}>{v.antes || '—'}</span> → <strong style={{ color: 'var(--text)' }}>{v.despues || '(vacío)'}</strong>
            </div>
          ))}
          <button onClick={cancelar} style={{ ...btnSecundario, marginTop: '10px' }}>CANCELAR PEDIDO</button>
        </div>
      )}

      {ultima && (
        <div style={aviso(ultima.c)}>
          <div style={{ fontWeight: 800 }}>{ultima.t}</div>
          {info.ultima.nota && <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>Nota del club: {info.ultima.nota}</div>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {CAMPOS_MIS_DATOS.map((c) => (
          <label key={c.k} style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '0.5px', marginBottom: '6px', textTransform: 'uppercase' }}>{c.t}</span>
            {c.opciones ? (
              <select value={form[c.k] || ''} onChange={(e) => setForm({ ...form, [c.k]: e.target.value })} style={input}>
                <option value="">No sé / sin dato</option>
                {c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={c.tipo === 'tel' ? 'tel' : 'text'}
                inputMode={c.tipo === 'tel' ? 'tel' : undefined}
                value={form[c.k] || ''}
                maxLength={120}
                onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}
                placeholder={c.ayuda}
                style={input}
              />
            )}
          </label>
        ))}
      </div>

      <button onClick={enviar} disabled={enviando} style={{ ...btnPrincipal, width: '100%', marginTop: '20px', opacity: enviando ? 0.6 : 1 }}>
        {enviando ? 'ENVIANDO…' : pendiente ? 'ACTUALIZAR MI PEDIDO' : 'ENVIAR PARA QUE LO APRUEBEN'}
      </button>
    </div>
  );
}

const input = {
  width: '100%', padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontSize: '16px',
};
const btnPrincipal = {
  padding: '14px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px',
  fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', minHeight: '48px',
};
const btnSecundario = {
  padding: '8px 12px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: '8px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', minHeight: '40px',
};
const aviso = (c) => ({
  border: `1px solid ${c}`, background: 'var(--panel)', borderRadius: '10px', padding: '12px',
  marginBottom: '16px', color: 'var(--text)', fontSize: '0.85rem',
});
