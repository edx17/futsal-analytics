import React, { useMemo } from 'react';
import { cargaDelPlantel, zonaDe, ZONAS, DIAS_AGUDA, DIAS_CRONICA } from '../analytics/carga';

const MONO = 'JetBrains Mono, monospace';
const hoyISO = () => new Date().toISOString().slice(0, 10);

/* CARGA Y RIESGO
 *
 * Lee lo que los jugadores ya cargan en Wellness —RPE y minutos— y muestra el
 * ACWR de cada uno. La pregunta que contesta es la que no se ve mirando la
 * carga suelta: no "cuánto entrenó" sino "cuánto más de lo que venía
 * tolerando", que es el aviso que llega antes de la lesión.
 *
 * A quien no tiene 28 días de historia no se le inventa un número: se dice
 * cuántos días le faltan.
 */
export default function CargaYRiesgo({ wellness, jugadores, esMovil, hasta = hoyISO() }) {
  const filas = useMemo(
    () => cargaDelPlantel(wellness, jugadores, hasta),
    [wellness, jugadores, hasta]
  );

  const conDatos = filas.filter(f => f.suficiente);
  const enAlerta = conDatos.filter(f => ['precaucion', 'riesgo'].includes(zonaDe(f.acwr)?.id));

  if (filas.length === 0) return null;

  return (
    <div className="bento-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div className="stat-label" style={{ color: 'var(--accent)' }}>CARGA Y RIESGO</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3 }}>
            Últimos {DIAS_AGUDA} días contra los últimos {DIAS_CRONICA}, a partir del RPE y los minutos de Wellness.
          </div>
        </div>
        {conDatos.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: '0.75rem', color: enAlerta.length ? '#fbbf24' : 'var(--text-dim)' }}>
            {enAlerta.length === 0
              ? 'NADIE EN ZONA DE ALERTA'
              : `${enAlerta.length} ${enAlerta.length === 1 ? 'JUGADOR' : 'JUGADORES'} PARA MIRAR DE CERCA`}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        {ZONAS.map(z => (
          <span key={z.id} title={z.ayuda} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontFamily: MONO, color: 'var(--text-dim)', cursor: 'help' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: z.color }} />
            {z.rotulo}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filas.map(f => <FilaCarga key={f.jugador.id} f={f} esMovil={esMovil} />)}
      </div>

      <div style={{ marginTop: 14, fontSize: '0.64rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        El ACWR es un semáforo para mirar al jugador, no para decidir por él: un número alto
        pide una charla y una mirada, no necesariamente un descanso.
      </div>
    </div>
  );
}

function FilaCarga({ f, esMovil }) {
  const z = zonaDe(f.acwr);
  const faltan = Math.max(0, Math.ceil(DIAS_CRONICA / 4) - f.diasConDatos);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: esMovil ? '1fr auto' : '1fr 150px 90px 90px',
      gap: 12, alignItems: 'center',
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${z ? z.color : 'var(--border)'}`,
      borderRadius: 6, padding: '10px 12px',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(f.jugador.apellido || '').toUpperCase()} {f.jugador.nombre || ''}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: MONO }}>
          {f.suficiente
            ? `${Math.round(f.aguda).toLocaleString('es-AR')} u. esta semana`
            : `faltan ${faltan} ${faltan === 1 ? 'día' : 'días'} de registro`}
        </div>
      </div>

      {f.suficiente ? (
        <>
          <div style={{ display: esMovil ? 'none' : 'block' }}>
            <div style={{ height: 6, background: 'var(--panel)', borderRadius: 3, overflow: 'hidden' }}>
              {/* La barra se mide contra 2.0, que es donde ya no hay matices. */}
              <div style={{ width: `${Math.min(100, (f.acwr / 2) * 100)}%`, height: '100%', background: z.color }} />
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontFamily: MONO, marginTop: 4 }}>{z.rotulo}</div>
          </div>

          <div style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 900, fontSize: '1.05rem', color: z.color }}>
            {f.acwr.toFixed(2)}
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontWeight: 400 }}>ACWR</div>
          </div>

          <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: '0.85rem', display: esMovil ? 'none' : 'block' }}>
            {f.monotonia != null ? f.monotonia.toFixed(2) : '—'}
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>MONOTONÍA</div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: '0.72rem', color: 'var(--text-dim)', gridColumn: esMovil ? 'auto' : 'span 3' }}>
          sin historia suficiente
        </div>
      )}
    </div>
  );
}
