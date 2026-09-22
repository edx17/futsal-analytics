import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEsMovil } from '../utils/useEsMovil';
import { useDatosPlantel } from '../utils/useDatosPlantel';
import { procesarPlantel } from '../analytics/plantel';
import { METRICAS, conPorcentajes, valorDe, ganador, reparto, resumen, DUR_PARTIDO } from '../analytics/comparar';

const MONO = 'JetBrains Mono, monospace';
const VERDE = '#00ff88';
const ROJO = '#ef4444';

/* COMPARAR DOS JUGADORES
 *
 * La pregunta que esto contesta es "¿a quién pongo de cierre?", y antes había
 * que abrir dos pestañas y recordar los números de una mientras se miraba la
 * otra.
 *
 * No recalcula nada: usa `procesarPlantel`, el mismo cálculo que alimenta
 * Resumen Plantel, así que los números coinciden con los de esa pantalla por
 * construcción y no por casualidad.
 */

export default function Comparar() {
  const { perfil } = useAuth();
  const esMovil = useEsMovil();

  const isKiosco = localStorage.getItem('kiosco_mode') === 'true';
  const clubId = isKiosco
    ? localStorage.getItem('kiosco_club_id')
    : ((perfil?.rol === 'superuser' ? localStorage.getItem('club_id') : perfil?.club_id) || '');

  const { raw, loading, avance } = useDatosPlantel(clubId);

  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);
  const [idA, setIdA] = useState('');
  const [idB, setIdB] = useState('');
  /* Por defecto se normaliza: comparar totales entre alguien de 600 minutos y
     alguien de 120 premia al que jugó más, no al que rindió mejor. */
  const [normalizar, setNormalizar] = useState(true);

  const { jugadoresProc, arquerosProc } = useMemo(
    () => procesarPlantel({
      raw,
      partidosScopeCat: raw.partidos,
      filtroTorneo: 'Todos',
      filtroCategoria: 'Todas',
      misCategorias,
      hayRuedas: false,
      filtroRueda: 'Todas',
      torneoElegido: null,
      jornadasOrdenadas: [],
    }),
    [raw, misCategorias]
  );

  const todos = useMemo(
    () => [...jugadoresProc, ...arquerosProc]
      .map(conPorcentajes)
      .sort((a, b) => `${a.apellido}`.localeCompare(`${b.apellido}`, 'es')),
    [jugadoresProc, arquerosProc]
  );

  const A = todos.find(j => String(j.id) === String(idA)) || null;
  const B = todos.find(j => String(j.id) === String(idB)) || null;
  const marcador = useMemo(() => (A && B ? resumen(A, B, normalizar) : null), [A, B, normalizar]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-dim)' }}>
        Procesando datos del plantel…
        {avance.total > 0 && (
          <div style={{ marginTop: 14, fontSize: '0.75rem', fontFamily: MONO, letterSpacing: '0.08em' }}>
            {avance.traidas.toLocaleString('es-AR')} de {avance.total.toLocaleString('es-AR')} acciones
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s' }}>
      <div className="stat-label" style={{ fontSize: '1.2rem', color: 'var(--accent)', marginBottom: 6 }}>
        COMPARAR JUGADORES
      </div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22 }}>
        Los mismos números de Resumen Plantel, enfrentados.
      </div>

      <div className="bento-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '1fr auto 1fr', gap: 14, alignItems: 'end' }}>
          <Selector etiqueta="JUGADOR A" valor={idA} onChange={setIdA} lista={todos} excluir={idB} color={VERDE} />
          {!esMovil && <div style={{ fontFamily: MONO, color: 'var(--text-dim)', paddingBottom: 10, fontWeight: 800 }}>VS</div>}
          <Selector etiqueta="JUGADOR B" valor={idB} onChange={setIdB} lista={todos} excluir={idA} color="#c084fc" />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer', fontSize: '0.8rem' }}>
          <input type="checkbox" checked={normalizar} onChange={e => setNormalizar(e.target.checked)}
                 style={{ width: 'auto', cursor: 'pointer' }} />
          <span>
            Mostrar cada <strong>{DUR_PARTIDO} minutos</strong> jugados
            <span style={{ color: 'var(--text-dim)' }}> — para que no gane el que jugó más</span>
          </span>
        </label>
      </div>

      {!A || !B ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          Elegí dos jugadores para compararlos.
        </div>
      ) : (
        <>
          <div className="bento-card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center' }}>
              <Cabecera j={A} color={VERDE} alineacion="left" />
              <div style={{ textAlign: 'center', fontFamily: MONO }}>
                <div style={{ fontSize: esMovil ? '1.6rem' : '2.2rem', fontWeight: 900 }}>
                  <span style={{ color: VERDE }}>{marcador.a}</span>
                  <span style={{ color: 'var(--text-dim)', margin: '0 8px' }}>–</span>
                  <span style={{ color: '#c084fc' }}>{marcador.b}</span>
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
                  MÉTRICAS GANADAS
                </div>
              </div>
              <Cabecera j={B} color="#c084fc" alineacion="right" />
            </div>
          </div>

          <div className="bento-card">
            {METRICAS.map((m) => {
              const va = valorDe(A, m, normalizar);
              const vb = valorDe(B, m, normalizar);
              const gana = ganador(va, vb, m);
              const [pa, pb] = reparto(va, vb);
              return (
                <Fila key={m.k} metrica={m} va={va} vb={vb} gana={gana} pa={pa} pb={pb}
                      normalizado={normalizar && m.por40} esMovil={esMovil} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const Selector = ({ etiqueta, valor, onChange, lista, excluir, color }) => (
  <div>
    <div className="stat-label" style={{ color, marginBottom: 6 }}>{etiqueta}</div>
    <select value={valor} onChange={e => onChange(e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: 10, borderRadius: 6 }}>
      <option value="">— elegir —</option>
      {lista.filter(j => String(j.id) !== String(excluir)).map(j => (
        <option key={j.id} value={j.id}>
          {(j.apellido || '').toUpperCase()} {j.nombre} · {j.posicion || 's/p'} · {j.categoria || 's/c'}
        </option>
      ))}
    </select>
  </div>
);

const Cabecera = ({ j, color, alineacion }) => (
  <div style={{ textAlign: alineacion, minWidth: 0 }}>
    <div style={{ fontWeight: 900, fontSize: '1.05rem', color, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {(j.apellido || '').toUpperCase()}
    </div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: MONO }}>
      {[j.dorsal ? `#${j.dorsal}` : null, j.posicion, j.categoria].filter(Boolean).join(' · ')}
    </div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: MONO, marginTop: 2 }}>
      {j.jugados} PJ · {Math.round(j.minutos)}′
    </div>
  </div>
);

/* Un guión y no un cero: que no jugó no es lo mismo que rindió cero. */
const mostrar = (v, m) => (v == null ? '—' : v.toFixed(m.dec) + (m.sufijo || ''));

const Fila = ({ metrica, va, vb, gana, pa, pb, normalizado, esMovil }) => (
  <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '58px 1fr 58px' : '78px 1fr 78px', gap: 10, alignItems: 'center' }}>
      <div style={{ fontFamily: MONO, fontWeight: 800, textAlign: 'right', color: gana === 'a' ? VERDE : 'var(--text)', fontSize: esMovil ? '0.85rem' : '1rem' }}>
        {mostrar(va, metrica)}
      </div>

      <div>
        <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 5 }}>
          {metrica.t}{normalizado ? ` / ${DUR_PARTIDO}′` : ''}
          {metrica.mejor === 'bajo' && <span title="Acá gana el que tiene menos"> ↓</span>}
        </div>
        <div style={{ display: 'flex', height: 9, gap: 2 }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', background: 'var(--bg)', borderRadius: '4px 0 0 4px', overflow: 'hidden' }}>
            <div style={{ width: `${pa}%`, background: gana === 'a' ? VERDE : 'rgba(255,255,255,0.22)' }} />
          </div>
          <div style={{ flex: 1, background: 'var(--bg)', borderRadius: '0 4px 4px 0', overflow: 'hidden' }}>
            <div style={{ width: `${pb}%`, background: gana === 'b' ? '#c084fc' : 'rgba(255,255,255,0.22)' }} />
          </div>
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontWeight: 800, color: gana === 'b' ? '#c084fc' : 'var(--text)', fontSize: esMovil ? '0.85rem' : '1rem' }}>
        {mostrar(vb, metrica)}
      </div>
    </div>
  </div>
);
