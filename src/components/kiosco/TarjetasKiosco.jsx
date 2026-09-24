import React from 'react';
import { partesDeFecha, formatearHora } from '../../utils/citacion';

/* ══════════════════════════════════════════════════════════════════════════
   TARJETAS DEL MENÚ DEL JUGADOR (KIOSCO)

   Sólo pintan. Los datos llegan ya calculados desde analytics/fichaKiosco.js
   con lo que devuelve kiosco_ficha(). Mismo lenguaje visual que las tarjetas
   que ya tenía el menú (estado de cuenta, novedades): caja de 380px, borde
   del color del tema de la tarjeta, rótulo en mayúsculas.
   ══════════════════════════════════════════════════════════════════════════ */

const caja = (color) => ({
  width: '100%', maxWidth: '380px', marginBottom: '16px', boxSizing: 'border-box',
  background: `${color}12`, border: `1px solid ${color}55`, borderRadius: '12px', padding: '15px',
});

const Rotulo = ({ icono, color, children, derecha = null }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '1.2rem' }}>{icono}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 900, color, letterSpacing: '1px' }}>{children}</span>
    </div>
    {derecha}
  </div>
);

const btn = (fondo, texto = '#000') => ({
  padding: '10px 14px', background: fondo, color: texto, border: 'none', borderRadius: '8px',
  fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', minHeight: '40px',
});

const fechaLinda = (f) => {
  const p = partesDeFecha(f);
  return `${p.dia ? `${p.dia} ` : ''}${p.corta}`;
};

/* ── SALUDO ──────────────────────────────────────────────────────────────── */

export function ChipsJugador({ jugador }) {
  if (!jugador) return null;
  const chips = [
    jugador.dorsal !== null && jugador.dorsal !== undefined && jugador.dorsal !== '' ? `#${jugador.dorsal}` : null,
    jugador.posicion || null,
    jugador.categoria || null,
  ].filter(Boolean);
  if (chips.length === 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
      {chips.map((c) => (
        <span key={c} style={{ fontSize: '0.7rem', fontWeight: 900, padding: '4px 10px', borderRadius: '20px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', textTransform: 'uppercase' }}>
          {c}
        </span>
      ))}
    </div>
  );
}

export function TarjetaCumple({ nombre, edad }) {
  return (
    <div style={{ ...caja('#ec4899'), textAlign: 'center', background: 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(250,204,21,0.14))' }}>
      <div style={{ fontSize: '2.2rem', lineHeight: 1 }}>🎂🎉</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', margin: '8px 0 4px', textTransform: 'uppercase' }}>
        ¡Feliz cumple, {nombre}!
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
        {edad ? `${edad} años. ` : ''}Que lo disfrutes, de parte de todo el club 💚
      </div>
    </div>
  );
}

/* ── WELLNESS ───────────────────────────────────────────────────────────── */

const COLOR_SEMAFORO = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };

export function TarjetaWellness({ completo, historial = [], onCargar }) {
  const tira = (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'space-between' }}>
      {[...historial].reverse().map((d) => {
        const p = partesDeFecha(d.fecha);
        return (
          <div key={d.fecha} title={d.registro ? 'Cargado' : 'Sin cargar'} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              height: '10px', borderRadius: '5px',
              background: d.color ? COLOR_SEMAFORO[d.color] : 'transparent',
              border: d.color ? 'none' : '1px dashed rgba(255,255,255,0.25)',
            }} />
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '4px' }}>{(p.dia || '').slice(0, 2)}</div>
          </div>
        );
      })}
    </div>
  );

  if (!completo) {
    return (
      <div style={caja('#f97316')}>
        <Rotulo icono="⚠️" color="#f97316">WELLNESS DE HOY</Rotulo>
        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text)', marginBottom: '10px' }}>
          Todavía no completaste el wellness de hoy.
        </div>
        <button onClick={onCargar} style={{ ...btn('#f97316'), width: '100%', marginBottom: historial.length ? '12px' : 0 }}>
          CARGARLO AHORA (1 MINUTO)
        </button>
        {historial.length > 0 && tira}
      </div>
    );
  }

  return (
    <div style={caja('#10b981')}>
      <Rotulo icono="✅" color="#10b981">WELLNESS AL DÍA</Rotulo>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Tus últimos 7 días:</div>
      {tira}
    </div>
  );
}

/* ── AGENDA Y PRÓXIMO PARTIDO ────────────────────────────────────────────── */

const TEXTO_CITACION = {
  citado:         { t: '✅ ESTÁS CITADO', c: '#10b981' },
  'no-citado':    { t: 'No figurás en la citación', c: 'var(--text-dim)' },
  'sin-publicar': { t: 'La citación todavía no se publicó', c: 'var(--text-dim)' },
};

export function TarjetaAgenda({ proximo, sesiones = [] }) {
  const cit = proximo ? TEXTO_CITACION[proximo.citacion] : null;
  const p = proximo?.partido;
  const mapa = proximo?.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proximo.direccion)}`
    : null;

  return (
    <div style={caja('#3b82f6')}>
      <Rotulo icono="📅" color="#3b82f6">MI AGENDA</Rotulo>

      {p ? (
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px' }}>PRÓXIMO PARTIDO</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)', margin: '4px 0' }}>
            vs {p.rival || 'Rival a confirmar'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
            {fechaLinda(p.fecha)}{proximo.horario ? ` · ${formatearHora(proximo.horario)}` : ''}{p.condicion ? ` · ${p.condicion}` : ''}
          </div>
          {(proximo.sede || proximo.direccion) && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              🏟️ {[proximo.sede, proximo.direccion].filter(Boolean).join(' — ')}
              {mapa && <> · <a href={mapa} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontWeight: 800 }}>cómo llegar</a></>}
            </div>
          )}
          {cit && (
            <div style={{ marginTop: '10px', fontSize: '0.85rem', fontWeight: 900, color: cit.c }}>
              {cit.t}
              {proximo.citacion === 'citado' && proximo.horaCitacion && (
                <span style={{ color: 'var(--text)' }}> · presentarse {formatearHora(proximo.horaCitacion)}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '12px' }}>No hay partidos programados todavía.</div>
      )}

      <div style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '6px' }}>ENTRENAMIENTOS · PRÓXIMOS 7 DÍAS</div>
      {sesiones.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>El cuerpo técnico todavía no cargó la semana.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sesiones.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', fontSize: '0.8rem' }}>
              <span style={{ minWidth: '84px', fontWeight: 800, color: 'var(--text)' }}>{fechaLinda(s.fecha)}</span>
              <span style={{ color: 'var(--text-dim)' }}>
                {s.tipo_sesion || 'Entrenamiento'}{s.objetivo ? ` — ${s.objetivo}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── DISCIPLINA ─────────────────────────────────────────────────────────── */

export function TarjetaDisciplina({ disciplina }) {
  if (!disciplina) return null;
  const color = disciplina.estado === 'suspendido' ? '#ef4444'
    : disciplina.estado === 'alBorde' ? '#f59e0b' : '#a3a3a3';

  let mensaje = 'Estás habilitado para jugar.';
  if (disciplina.fechasPendientes > 0) {
    mensaje = `Estás suspendido: te ${disciplina.fechasPendientes === 1 ? 'queda 1 fecha' : `quedan ${disciplina.fechasPendientes} fechas`}.`;
  } else if (disciplina.suspendido) {
    const c = disciplina.categorias.find((x) => x.suspendido);
    mensaje = `Suspendido por acumulación de amarillas${c ? ` (${c.categoria})` : ''}: cumplís 1 fecha.`;
  } else if (disciplina.alBorde) {
    const c = disciplina.categorias.find((x) => x.alBorde);
    mensaje = `¡Ojo! Estás a UNA amarilla de la suspensión${c ? ` en ${c.categoria}` : ''}.`;
  }

  return (
    <div style={caja(color)}>
      <Rotulo icono="🟨" color={color === '#a3a3a3' ? 'var(--text)' : color}>MIS TARJETAS</Rotulo>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        {[
          { l: 'AMARILLAS', v: disciplina.amarillas, c: '#facc15' },
          { l: 'ROJAS', v: disciplina.rojas, c: '#ef4444' },
        ].map((k) => (
          <div key={k.l} style={{ flex: 1, background: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: k.c, lineHeight: 1 }}>{k.v}</div>
            <div style={{ fontSize: '0.55rem', fontWeight: 900, color: 'var(--text-dim)', marginTop: '4px' }}>{k.l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: disciplina.estado === 'ok' ? 'var(--text)' : color }}>{mensaje}</div>
      {disciplina.estado === 'ok' && disciplina.amarillas > 0 && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
          Cada {disciplina.umbral} amarillas en una categoría se cumple 1 fecha.
        </div>
      )}
    </div>
  );
}

/* ── NOTIFICACIONES ─────────────────────────────────────────────────────── */

export function TarjetaNotificaciones({ estado, mensaje, onActivar }) {
  if (estado === 'activas') return null;
  return (
    <div style={caja('#a855f7')}>
      <Rotulo icono="🔔" color="#a855f7">AVISOS EN TU CELULAR</Rotulo>
      <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginBottom: '10px', lineHeight: 1.4 }}>
        Enterate al toque cuando te citan, recordatorio del wellness y más.
      </div>
      {mensaje && (
        <div style={{ fontSize: '0.72rem', color: '#f59e0b', marginBottom: '10px', lineHeight: 1.4 }}>{mensaje}</div>
      )}
      <button onClick={onActivar} disabled={estado === 'activando'} style={{ ...btn('#a855f7', '#fff'), width: '100%', opacity: estado === 'activando' ? 0.6 : 1 }}>
        {estado === 'activando' ? 'ACTIVANDO…' : 'ACTIVAR NOTIFICACIONES'}
      </button>
    </div>
  );
}

/* ── SESIÓN VIEJA, SIN FICHA ─────────────────────────────────────────────── */

export function TarjetaReingresar({ onReingresar }) {
  return (
    <div style={caja('#3b82f6')}>
      <Rotulo icono="🔐" color="#3b82f6">TU AGENDA, TARJETAS Y TORNEO</Rotulo>
      <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginBottom: '10px' }}>
        Volvé a poner tu PIN una vez para ver tu agenda, tus tarjetas y activar los avisos.
      </div>
      <button onClick={onReingresar} style={{ ...btn('#3b82f6', '#fff'), width: '100%' }}>INGRESAR PIN</button>
    </div>
  );
}
