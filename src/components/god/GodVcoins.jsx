import React, { useEffect, useMemo, useState } from 'react';
import {
  PREMIOS_DE_SIEMPRE, GRUPOS_PREMIOS, erroresDePremios, cambiosRespectoDeSiempre, paraGuardarPremios, maximoDe,
} from '../../analytics/premiosJuegos';
import { leerPremiosGod, guardarPremiosGod, restablecerPremiosGod } from '../../utils/god';

/* CONFIGURADOR GOD › V-COINS
 *
 * Lo que paga cada juego del club, en un solo lugar: penales, V-Draft,
 * desafío del día, duelos y cartas repetidas. Lo que no se cambia sigue con
 * el valor de siempre (se ve al lado). El x2 de V-Coins sigue aplicando
 * encima. Las misiones tienen su premio en Misiones y el torneo semanal en
 * Torneo V-Draft. Reglas puras: analytics/premiosJuegos.js.
 */

const ORO = '#fbbf24';

export default function GodVcoins({ clubId, esMovil }) {
  const [valores, setValores] = useState(null);
  const [guardados, setGuardados] = useState(null);
  const [deSiempre, setDeSiempre] = useState(PREMIOS_DE_SIEMPRE);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = (d) => {
    const def = { ...PREMIOS_DE_SIEMPRE, ...(d?.defecto || {}) };
    const v = { ...def, ...(d?.valores || {}) };
    setDeSiempre(def); setValores(v); setGuardados(v);
  };
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    leerPremiosGod(clubId)
      .then((d) => { if (vivo) aplicar(d); })
      .catch((err) => { if (vivo) { setAviso({ texto: err?.message || 'No se pudieron leer los premios.', error: true }); aplicar(null); } });
    return () => { vivo = false; };
  }, [clubId]);

  const errores = useMemo(() => erroresDePremios(valores || {}), [valores]);
  const cambiados = useMemo(() => cambiosRespectoDeSiempre(valores || {}, deSiempre), [valores, deSiempre]);
  const sinGuardar = valores && guardados && Object.keys(deSiempre).some((k) => Number(valores[k]) !== Number(guardados[k]));
  const hayErrores = Object.keys(errores).length > 0;

  const guardar = async () => {
    setOcupado(true); setAviso(null);
    try { aplicar(await guardarPremiosGod(clubId, paraGuardarPremios(valores))); setAviso({ texto: 'Premios guardados. Corren desde la próxima partida.' }); } catch (err) {
      setAviso({ texto: err?.message || 'No se pudieron guardar.', error: true });
    } finally { setOcupado(false); }
  };
  const restablecer = async () => {
    if (!window.confirm('¿Volver todos los premios a los de siempre?')) return;
    setOcupado(true); setAviso(null);
    try { aplicar(await restablecerPremiosGod(clubId)); setAviso({ texto: 'Volvieron los premios de siempre.' }); } catch (err) {
      setAviso({ texto: err?.message || 'No se pudo.', error: true });
    } finally { setOcupado(false); }
  };

  if (!valores) return <div style={dim}>Leyendo los premios…</div>;
  const nCambiados = Object.keys(cambiados).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...dim, lineHeight: 1.5 }}>
        Lo que no toques sigue con el valor de siempre. El x2 de V-Coins (Usuarios) se aplica encima. El premio de las misiones está en
        Misiones y el del torneo semanal en Torneo V-Draft.
      </div>

      <div className="bento-card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: `${ORO}55`,
        position: 'sticky', top: 0, zIndex: 2 }}>
        <span style={{ fontSize: 13 }}>{nCambiados ? <><b style={{ color: ORO }}>{nCambiados}</b> distintos a los de siempre</> : 'Todos con los valores de siempre'}</span>
        <span style={{ flex: 1 }} />
        {nCambiados > 0 && <button style={chip} disabled={ocupado} onClick={restablecer}>VOLVER A LOS DE SIEMPRE</button>}
        <button style={{ ...boton, background: ORO, color: '#1a1205', opacity: sinGuardar && !hayErrores ? 1 : 0.5 }}
          disabled={!sinGuardar || hayErrores || ocupado} onClick={guardar}>{ocupado ? 'GUARDANDO…' : 'GUARDAR'}</button>
      </div>
      {aviso && <div role="status" style={{ fontSize: 13, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</div>}
      {sinGuardar && !aviso && <div style={{ fontSize: 12, color: ORO }}>Hay cambios sin guardar.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
        {GRUPOS_PREMIOS.map((g) => (
          <section key={g.id} className="bento-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 900, letterSpacing: '.08em' }}>{g.titulo}</div>
              <div style={dim}>{g.bajada}</div>
            </div>
            {g.campos.map(([k, rotulo, unidad = 'vc']) => {
              const distinto = Number(valores[k]) !== deSiempre[k];
              return (
                <label key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>
                    {rotulo}
                    <small style={{ display: 'block', color: distinto ? ORO : 'var(--text-dim)', fontSize: 11 }}>
                      {distinto ? `de siempre: ${deSiempre[k].toLocaleString('es-AR')}` : 'el de siempre'}
                      {errores[k] && <b style={{ color: '#ef4444', marginLeft: 6 }}>{errores[k]}</b>}
                    </small>
                  </span>
                  <span style={{ position: 'relative' }}>
                    <input type="number" min={0} max={maximoDe(k)} step={1} value={valores[k]} aria-label={`${g.titulo} · ${rotulo}`}
                      onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value === '' ? '' : Number(e.target.value) }))}
                      style={{ ...input, borderColor: errores[k] ? '#ef4444' : distinto ? ORO : 'var(--border)' }} />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', pointerEvents: 'none' }}>
                      {unidad === 'veces' ? 'POR DÍA' : 'VC'}
                    </span>
                  </span>
                </label>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

const dim = { color: 'var(--text-dim)', fontSize: '0.8rem' };
const input = { width: '100%', padding: '8px 56px 8px 10px', minHeight: 40, borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', border: '1px solid', fontSize: 15, fontWeight: 800 };
const boton = { padding: '10px 18px', minHeight: 44, borderRadius: 8, border: 'none', fontWeight: 900, letterSpacing: '.06em', cursor: 'pointer', fontSize: 13 };
const chip = { padding: '8px 12px', minHeight: 40, whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent' };
