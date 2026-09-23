import React, { useMemo } from 'react';
import { resumenPorDia, resumenPorGrupo, extremos } from '../analytics/diasSemana';

/* EN QUÉ DÍAS JUGAMOS Y CÓMO NOS FUE
 *
 * Un club que rinde distinto los sábados que los martes tiene un problema de
 * descanso, de horario o de viaje. Eso no se ve en ninguna tabla ordenada por
 * fecha, y hasta ahora no había dónde mirarlo.
 *
 * Los números salen de `partidos`, que es la MISMA lista filtrada que alimenta
 * al resto de Temporada. Así los totales de este bloque no pueden discrepar
 * con los de arriba: si el usuario filtró por categoría o por torneo, este
 * bloque ya viene filtrado también.
 *
 * La efectividad es el porcentaje de los puntos en juego que se sacó. Es lo
 * único que deja comparar un día con doce partidos contra otro con tres.
 */

const MONO = { fontFamily: "'JetBrains Mono', monospace" };

const colorEfe = (e) => {
  if (e == null) return 'var(--text-dim)';
  if (e >= 66) return '#10b981';
  if (e >= 40) return '#fbbf24';
  return '#ef4444';
};

export default function DiasDeLaSemana({ partidos = [], esMovil = false }) {
  const { filas, sinFecha } = useMemo(() => resumenPorDia(partidos), [partidos]);
  const grupos = useMemo(() => resumenPorGrupo(partidos), [partidos]);
  const lectura = useMemo(() => extremos(filas), [filas]);

  const totalPJ = filas.reduce((a, f) => a + f.pj, 0);

  if (totalPJ === 0) {
    return (
      <div className="bento-card" style={{ marginTop: 20 }}>
        <div className="section-title" style={{ marginTop: 0 }}>EN QUÉ DÍAS JUGAMOS</div>
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24, fontSize: '0.85rem' }}>
          Todavía no hay partidos jugados con estos filtros.
        </div>
      </div>
    );
  }

  return (
    <div className="bento-card" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>EN QUÉ DÍAS JUGAMOS</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          {totalPJ} partido{totalPJ > 1 ? 's' : ''}
          {sinFecha > 0 && <span style={{ color: '#fbbf24' }}> · {sinFecha} sin fecha legible</span>}
        </div>
      </div>

      {/* La lectura en una frase, que es para lo que sirve el bloque. */}
      {lectura.mejor && lectura.peor && lectura.mejor.n !== lectura.peor.n && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.5 }}>
          Rinden mejor los <strong style={{ color: '#10b981' }}>{lectura.mejor.plural}</strong>
          {' '}({Math.round(lectura.mejor.efectividad)}% de efectividad en {lectura.mejor.pj} partidos)
          {' '}que los <strong style={{ color: '#ef4444' }}>{lectura.peor.plural}</strong>
          {' '}({Math.round(lectura.peor.efectividad)}% en {lectura.peor.pj}).
          <span style={{ display: 'block', fontSize: '0.68rem', marginTop: 3, opacity: 0.75 }}>
            Sólo se comparan días con {lectura.minimo} partidos o más.
          </span>
        </div>
      )}

      {/* ── SEMANA CONTRA FIN DE SEMANA ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        {grupos.map((g) => (
          <div key={g.id} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text)' }}>{g.rotulo}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: 8 }}>{g.ayuda}</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ ...MONO, fontSize: '1.5rem', fontWeight: 900, color: colorEfe(g.efectividad) }}>
                {g.efectividad == null ? '—' : `${Math.round(g.efectividad)}%`}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>efectividad</span>
            </div>

            {/* Cada renglón entero o nada: partido al medio, el "5P" se caía
                solo a la línea de abajo y parecía otro dato. */}
            <div style={{ ...MONO, fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 6, whiteSpace: 'nowrap' }}>
              {g.pj} PJ
            </div>
            <div style={{ ...MONO, fontSize: '0.72rem', marginTop: 2, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#10b981' }}>{g.pg}G</span>
              {' '}<span style={{ color: '#fbbf24' }}>{g.pe}E</span>
              {' '}<span style={{ color: '#ef4444' }}>{g.pp}P</span>
            </div>
            <div style={{ ...MONO, fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap' }}>
              {g.gf}:{g.gc} · {g.dg > 0 ? '+' : ''}{g.dg} DG
            </div>
          </div>
        ))}
      </div>

      {/* ── DÍA POR DÍA ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Encabezado esMovil={esMovil} />
        {filas.map((f) => (
          <Fila key={f.n} f={f} esMovil={esMovil} />
        ))}
      </div>
    </div>
  );
}

/* Una grilla y no una <table>: a 360px la tabla obliga a desplazarse en
   horizontal, y acá entra todo con las columnas justas. */
const columnas = (esMovil) => (esMovil ? '46px 1fr repeat(4, 22px) 40px' : '90px 1fr repeat(4, 34px) 56px 64px');

const Encabezado = ({ esMovil }) => (
  <div style={{
    display: 'grid', gridTemplateColumns: columnas(esMovil), gap: 6, alignItems: 'center',
    padding: '0 0 6px', borderBottom: '1px solid var(--border)',
    ...MONO, fontSize: '0.55rem', letterSpacing: '0.06em', color: 'var(--text-dim)', fontWeight: 800,
  }}>
    <span>DÍA</span>
    <span />
    <span style={{ textAlign: 'right' }}>PJ</span>
    <span style={{ textAlign: 'right', color: '#10b981' }}>PG</span>
    <span style={{ textAlign: 'right', color: '#fbbf24' }}>PE</span>
    <span style={{ textAlign: 'right', color: '#ef4444' }}>PP</span>
    {!esMovil && <span style={{ textAlign: 'right' }}>GF:GC</span>}
    <span style={{ textAlign: 'right' }}>EFE</span>
  </div>
);

const Fila = ({ f, esMovil }) => {
  const vacio = f.pj === 0;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: columnas(esMovil), gap: 6, alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)', opacity: vacio ? 0.45 : 1,
    }}>
      <span style={{ ...MONO, fontSize: '0.7rem', fontWeight: 800 }}>{esMovil ? f.corto : f.nombre}</span>

      {/* La barra de efectividad: leer siete porcentajes de corrido es
          incómodo, y el largo de la barra se compara de un vistazo. */}
      <div style={{ height: 6, background: 'var(--panel)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${f.efectividad || 0}%`, height: '100%', background: colorEfe(f.efectividad) }} />
      </div>

      <span style={{ ...MONO, fontSize: '0.72rem', textAlign: 'right' }}>{f.pj}</span>
      <span style={{ ...MONO, fontSize: '0.72rem', textAlign: 'right', color: f.pg ? '#10b981' : 'var(--text-dim)' }}>{f.pg}</span>
      <span style={{ ...MONO, fontSize: '0.72rem', textAlign: 'right', color: f.pe ? '#fbbf24' : 'var(--text-dim)' }}>{f.pe}</span>
      <span style={{ ...MONO, fontSize: '0.72rem', textAlign: 'right', color: f.pp ? '#ef4444' : 'var(--text-dim)' }}>{f.pp}</span>

      {!esMovil && (
        <span style={{ ...MONO, fontSize: '0.7rem', textAlign: 'right', color: 'var(--text-dim)' }}>
          {vacio ? '—' : `${f.gf}:${f.gc}`}
        </span>
      )}

      <span style={{ ...MONO, fontSize: '0.72rem', fontWeight: 800, textAlign: 'right', color: colorEfe(f.efectividad) }}>
        {f.efectividad == null ? '—' : `${Math.round(f.efectividad)}%`}
      </span>
    </div>
  );
};
