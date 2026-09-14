import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase';
import { planPorId, limiteDelClub, esFundador, categoriasDe, formatARS, whatsappLink,
         COBRO, hayTransferencia, linkMP, precioDe, mensajeDePago } from '../utils/planes';

/* Un alias se copia, no se transcribe: transcribirlo a mano es la forma más
   común de que una transferencia termine en la cuenta equivocada. */
const BotonCopiar = ({ etiqueta, valor }) => {
  const [copiado, setCopiado] = React.useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* si el navegador no deja, queda el texto a la vista para copiarlo a mano */ }
  };
  return (
    <div onClick={copiar} title="Tocá para copiar"
      style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '5px', padding: '10px 12px', marginBottom: '8px', cursor: 'pointer' }}>
      <span style={{ fontSize: '0.62rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '0.06em', minWidth: '38px' }}>{etiqueta}</span>
      <strong style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}>{valor}</strong>
      <span style={{ fontSize: '0.7rem', color: copiado ? 'var(--accent)' : 'var(--text-dim)', fontWeight: 800, whiteSpace: 'nowrap' }}>
        {copiado ? '✓ COPIADO' : 'COPIAR'}
      </span>
    </div>
  );
};

function MiSuscripcion() {
  const { perfil } = useAuth();

  /* Cuántas categorías está usando hoy, para que el club vea a cuánto está de
     su tope antes de chocarse con el aviso al cargar un jugador.

     Va ANTES del return temprano de abajo a propósito: un hook declarado
     después de un return condicional no se ejecuta en todos los renders y
     React rompe. */
  const [categoriasUsadas, setCategoriasUsadas] = useState(null);
  useEffect(() => {
    if (!perfil?.club_id) return;
    supabase.from('jugadores').select('categoria, activo').eq('club_id', perfil.club_id)
      .then(({ data, error }) => {
        if (error) return console.warn('No se pudieron contar las categorías:', error.message);
        setCategoriasUsadas(categoriasDe((data || []).filter(j => j.activo !== false)).length);
      });
  }, [perfil?.club_id]);

  if (!perfil || !perfil.clubes) return <div style={{ color: 'var(--text)', textAlign: 'center', marginTop: '50px' }}>Cargando datos...</div>;

  const { nombre, plan_actual, suscripcion_activa, fecha_vencimiento } = perfil.clubes;

  // Formatear fecha (si existe)
  const fechaFormateada = fecha_vencimiento 
    ? new Date(fecha_vencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'No registrada';

  const diasRestantes = fecha_vencimiento 
    ? Math.ceil((new Date(fecha_vencimiento) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  const esPrueba = plan_actual === 'trial';

  const club = perfil.clubes;
  const plan = planPorId(plan_actual);
  const limite = limiteDelClub(club);
  const fundador = esFundador(club);

  /* El cobro todavía es a mano: el club escribe, se arregla el pago y se le
     activa la suscripción desde ADM SUSCRIPCIONES. Antes acá había un alert()
     de placeholder que no llevaba a ningún lado. */
  const handlePagarSuscripcion = () => {
    window.open(whatsappLink(
      `Hola! Quiero activar la suscripción de ${nombre}.` +
      (plan ? ` Plan ${plan.nombre} (${formatARS(plan.precio.ars)}/mes).` : '')
    ), '_blank');
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s', maxWidth: '800px', margin: '0 auto', paddingBottom: '80px' }}>
      <div style={{ marginBottom: '30px' }}>
        <div className="stat-label" style={{ color: 'var(--text-dim)' }}>GESTIÓN ADMINISTRATIVA</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent)' }}>MI SUSCRIPCIÓN</div>
      </div>

      <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* CABECERA DEL CLUB */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '1px' }}>CLUB ACTIVO</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)' }}>{nombre.toUpperCase()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 800, letterSpacing: '1px' }}>ESTADO DE CUENTA</div>
            {suscripcion_activa ? (
              <div style={{ color: '#00ff88', fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>✅</span> AL DÍA
              </div>
            ) : (
              <div style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>🛑</span> SUSPENDIDA
              </div>
            )}
          </div>
        </div>

        {/* DETALLES DEL PLAN */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '10px' }}>
          <div style={{ background: 'var(--panel)', padding: '20px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '5px' }}>PLAN ACTUAL</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: esPrueba ? '#facc15' : 'var(--accent)', textTransform: 'uppercase' }}>
              {plan ? plan.nombre : (plan_actual || 'Básico')}
            </div>
            {fundador && (
              <div style={{ marginTop: '8px', display: 'inline-block', background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.35)', color: 'var(--accent)', fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: '20px' }}>
                ⭐ SOCIO FUNDADOR · SIN CARGO
              </div>
            )}
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {categoriasUsadas === null
                ? 'Contando categorías…'
                : limite == null
                  ? `${categoriasUsadas} ${categoriasUsadas === 1 ? 'categoría' : 'categorías'} · sin límite`
                  : `${categoriasUsadas} de ${limite} ${limite === 1 ? 'categoría' : 'categorías'}`}
            </div>
          </div>

          <div style={{ background: 'var(--panel)', padding: '20px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 800, marginBottom: '5px' }}>PRÓXIMO VENCIMIENTO</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)' }}>
              {fechaFormateada}
            </div>
            {suscripcion_activa && diasRestantes > 0 && diasRestantes <= 5 && (
              <div style={{ color: '#facc15', fontSize: '0.8rem', marginTop: '5px', fontWeight: 'bold' }}>⚠️ Vence en {diasRestantes} días</div>
            )}
            {!suscripcion_activa && (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '5px', fontWeight: 'bold' }}>⚠️ Pago atrasado</div>
            )}
          </div>
        </div>

        {/* ACCIONES DE PAGO
            El socio fundador no paga: mostrarle cómo hacerlo sería un error. */}
        {!fundador && (
          <div style={{ background: 'rgba(0, 255, 136, 0.05)', padding: '25px', borderRadius: '6px', border: '1px solid var(--accent)', marginTop: '20px' }}>
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text)', textAlign: 'center' }}>Renovar el plan</h3>
            {plan && (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '20px', textAlign: 'center' }}>
                Plan <strong style={{ color: 'var(--text)' }}>{plan.nombre}</strong> · {precioDe(plan.id).etiqueta}
                <br />
                <span style={{ fontSize: '0.8rem' }}>Anual: {precioDe(plan.id, 'anual').etiqueta} — dos meses menos que pagando mes a mes.</span>
              </p>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              {/* Transferencia primero: es la que no tiene comisión. */}
              {hayTransferencia() && (
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    🏦 TRANSFERENCIA — SIN RECARGO
                  </div>
                  {COBRO.transferencia.alias && (
                    <BotonCopiar etiqueta="ALIAS" valor={COBRO.transferencia.alias} />
                  )}
                  {COBRO.transferencia.cbu && (
                    <BotonCopiar etiqueta="CBU" valor={COBRO.transferencia.cbu} />
                  )}
                  {COBRO.transferencia.titular && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '8px' }}>
                      Titular: {COBRO.transferencia.titular}
                    </div>
                  )}
                  {/* El aviso es la parte que sostiene todo el esquema: sin él
                      hay que adivinar quién pagó. El mensaje sale armado con
                      club, plan, monto y fecha, así se activa sin preguntar
                      nada y el club no tiene que escribir. */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {[['mensual', '✅ YA TRANSFERÍ EL MES'], ['anual', '✅ YA TRANSFERÍ EL AÑO']].map(([ciclo, texto]) => (
                      <a key={ciclo}
                        href={whatsappLink(mensajeDePago({ club: nombre, planId: plan?.id, ciclo }))}
                        target="_blank" rel="noreferrer"
                        style={{ flex: 1, minWidth: '170px', textAlign: 'center', background: '#25D366', color: '#fff', padding: '12px', borderRadius: '6px', fontWeight: 900, fontSize: '0.78rem', textDecoration: 'none' }}>
                        {texto}
                      </a>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '10px' }}>
                    Transferí al alias y tocá el botón: se abre WhatsApp con el aviso escrito.
                    Mandá el comprobante y te activamos el acceso.
                  </div>
                </div>
              )}

              {/* Link de Mercado Pago: tarjeta y cuotas. */}
              {plan && (linkMP(plan.id, 'mensual') || linkMP(plan.id, 'anual')) && (
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#00b1ea', letterSpacing: '0.06em', marginBottom: '12px' }}>
                    💳 MERCADO PAGO — TARJETA Y CUOTAS
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {[['mensual', 'PAGAR EL MES'], ['anual', 'PAGAR EL AÑO']].map(([ciclo, texto]) => (
                      linkMP(plan.id, ciclo) ? (
                        <a key={ciclo} href={linkMP(plan.id, ciclo)} target="_blank" rel="noreferrer"
                          style={{ flex: 1, minWidth: '160px', textAlign: 'center', background: '#00b1ea', color: '#fff', padding: '13px', borderRadius: '6px', fontWeight: 900, fontSize: '0.8rem', textDecoration: 'none' }}>
                          {texto}
                        </a>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handlePagarSuscripcion}
                style={{ background: hayTransferencia() ? 'transparent' : '#25D366', color: hayTransferencia() ? 'var(--text-dim)' : '#fff', border: hayTransferencia() ? '1px solid var(--border)' : 'none', padding: '14px', fontSize: '0.85rem', fontWeight: 900, borderRadius: '6px', cursor: 'pointer' }}>
                {hayTransferencia() ? '💬 TENGO UNA CONSULTA' : '💬 ARREGLAR EL PAGO POR WHATSAPP'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default MiSuscripcion;