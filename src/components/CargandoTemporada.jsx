import React from 'react';

/* LA ESPERA DE TEMPORADA
 *
 * Temporada no tenía NINGÚN estado de carga: mientras bajaba, se dibujaba con
 * las listas vacías —cero partidos, cero goles, gráficos en blanco— y de golpe
 * saltaba a los números reales. El que la abría veía una pantalla rota durante
 * varios segundos y no sabía si estaba cargando o si se había roto de verdad.
 *
 * Es la pantalla más pesada de la app: se traen todas las acciones de todos los
 * partidos del filtro, que son decenas de miles de filas. Esa espera no se
 * puede eliminar del todo, pero sí se puede explicar.
 *
 * Por eso el avance es REAL y no un spinner decorativo: sale de los lotes que
 * `fetchPorLotes` va terminando. Cuando la espera son cinco segundos, saber que
 * van 3 de 8 es la diferencia entre esperar tranquilo y pensar que se colgó.
 */

const MONO = { fontFamily: "'JetBrains Mono', monospace" };

const PASOS = [
  { id: 'partidos',  rotulo: 'Buscando los partidos' },
  { id: 'plantel',   rotulo: 'Leyendo el plantel' },
  { id: 'eventos',   rotulo: 'Trayendo las acciones de cada partido' },
  { id: 'listo',     rotulo: 'Armando los números' },
];

export default function CargandoTemporada({ paso = 'partidos', partidos = 0, lotesHechos = 0, lotesTotal = 0, filas = 0, esMovil = false }) {
  const indiceActual = Math.max(0, PASOS.findIndex((p) => p.id === paso));

  /* El porcentaje es el de los lotes de eventos, que es lo que de verdad
     tarda. Los pasos anteriores valen poco y se muestran como completados,
     no como una fracción inventada. */
  const pct = lotesTotal > 0 ? Math.round((lotesHechos / lotesTotal) * 100) : null;

  return (
    <div style={{ animation: 'fadeIn 0.3s', padding: esMovil ? '40px 4px' : '60px 20px', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>📈</div>
        <div className="stat-label" style={{ fontSize: '1rem', color: 'var(--accent)' }}>
          ARMANDO LA TEMPORADA
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: 8, lineHeight: 1.5 }}>
          Es la pantalla que más datos necesita: se leen todas las acciones de
          todos los partidos. Puede tardar unos segundos.
        </div>
      </div>

      {/* La barra, sólo cuando hay un avance real que mostrar. */}
      {pct != null && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ ...MONO, fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              {lotesHechos} de {lotesTotal} {lotesTotal === 1 ? 'tanda' : 'tandas'}
            </span>
            <span style={{ ...MONO, fontSize: '0.9rem', fontWeight: 900, color: 'var(--accent)' }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.25s ease' }} />
          </div>
          {filas > 0 && (
            <div style={{ ...MONO, fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 6, textAlign: 'right' }}>
              {filas.toLocaleString('es-AR')} acciones leídas
            </div>
          )}
        </div>
      )}

      {/* Los pasos, para que se vea por dónde va. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PASOS.map((p, i) => {
          const hecho = i < indiceActual;
          const actual = i === indiceActual;
          const color = hecho ? '#10b981' : actual ? 'var(--accent)' : 'var(--text-dim)';
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: hecho || actual ? 1 : 0.4 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${color}`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 900,
              }}>
                {hecho ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: '0.85rem', color: actual ? 'var(--text)' : 'var(--text-dim)', fontWeight: actual ? 700 : 400 }}>
                {p.rotulo}
                {actual && p.id === 'eventos' && partidos > 0 && (
                  <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> · {partidos} partidos</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Cuando la carga falla, decirlo. Antes el error se tragaba en silencio y la
   pantalla quedaba vacía para siempre, indistinguible de "este club todavía no
   jugó nada". */
export function FalloTemporada({ mensaje, onReintentar }) {
  return (
    <div style={{ animation: 'fadeIn 0.3s', padding: '60px 20px', maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: '2.2rem', marginBottom: 12 }}>📡</div>
      <div className="stat-label" style={{ fontSize: '1rem', color: '#ef4444' }}>NO SE PUDO CARGAR</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 10, lineHeight: 1.5 }}>
        {mensaje || 'Se cortó la conexión con el servidor mientras se traían los datos.'}
      </div>
      {onReintentar && (
        <button onClick={onReintentar} className="btn-action" style={{ marginTop: 20, padding: '12px 24px' }}>
          REINTENTAR
        </button>
      )}
    </div>
  );
}
