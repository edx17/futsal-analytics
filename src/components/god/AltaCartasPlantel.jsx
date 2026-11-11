import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CartaJugador from '../quinteto/CartaJugador';
import { catalogoDeCartas } from '../../analytics/sobres';
import { compararConCatalogo, resumenAlta, jugadoresSinCarta, cartaBaseManual, atributosSugeridos } from '../../analytics/altaCartas';
import { PREMIOS } from '../../analytics/premiosCartas';
import { publicarCatalogo } from '../../utils/sobres';
import { listarCatalogo, listarEliminadas } from '../../utils/god';
import '../quinteto/quinteto.css';

/* CONFIGURADOR GOD › ALTA › BÁSICAS
 *
 * Las cartas que salen del plantel (las básicas y las de premio guardadas en
 * Placas), comparadas con lo que ya está publicado:
 *   NUEVAS       no están en el catálogo: se eligen una por una (o todas las
 *                que se ven) y se publican sólo esas.
 *   PUBLICADAS   ya están: no se tocan nunca (la carta básica es la inicial).
 *   ELIMINADAS   se borraron a propósito: no vuelven.
 *   SIN CARTA    los del plantel sin partidos (o sin el mínimo): su carta
 *                BASE se carga a mano, con la media y las 6 stats.
 * Reglas puras: analytics/altaCartas.js.
 */

const ORO = '#fbbf24';
const POR_PAGINA = 48;
const PESTANAS = [['nueva', 'NUEVAS'], ['publicada', 'YA PUBLICADAS'], ['eliminada', 'ELIMINADAS'], ['sincarta', 'SIN CARTA']];
const nombreTipo = (t) => (t === 'BASE' ? 'BÁSICA' : PREMIOS[t]?.sigla || t);

export default function AltaCartasPlantel({ plantel, clubId, esMovil }) {
  const [catalogo, setCatalogo] = useState(null);
  const [eliminadas, setEliminadas] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!clubId) return undefined;
    let vivo = true;
    Promise.all([listarCatalogo(clubId), listarEliminadas(clubId)])
      .then(([k, el]) => { if (vivo) { setCatalogo(k); setEliminadas(el); setError(null); } })
      .catch((err) => { if (vivo) { setError(err?.message || 'No se pudo leer el catálogo.'); setCatalogo([]); } });
    return () => { vivo = false; };
  }, [clubId, version]);

  const [pestana, setPestana] = useState('nueva');
  const [tipo, setTipo] = useState('TODAS');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [elegidas, setElegidas] = useState(() => new Set());
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const items = useMemo(() => {
    if (plantel.loading || catalogo === null) return [];
    return compararConCatalogo(catalogoDeCartas(plantel.cartasCalculadas, plantel.premiosCalculados), catalogo, eliminadas);
  }, [plantel.loading, plantel.cartasCalculadas, plantel.premiosCalculados, catalogo, eliminadas]);
  const { estados } = useMemo(() => resumenAlta(items), [items]);
  const sinCarta = useMemo(
    () => (plantel.loading || catalogo === null ? [] : jugadoresSinCarta(plantel.raw.jugadores || [], plantel.cartasCalculadas, catalogo, eliminadas)),
    [plantel.loading, plantel.raw.jugadores, plantel.cartasCalculadas, catalogo, eliminadas],
  );

  const deLaPestana = items.filter((i) => i.estado === pestana);
  const tipos = [...new Set(deLaPestana.map((i) => i.tipo))];
  const visibles = deLaPestana.filter((i) => tipo === 'TODAS' || i.tipo === tipo);
  const cambiarPestana = (p) => { setPestana(p); setTipo('TODAS'); setLimite(POR_PAGINA); };

  const alternar = (clave) => setElegidas((s) => { const n = new Set(s); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
  const elegidasNuevas = items.filter((i) => i.estado === 'nueva' && elegidas.has(i.clave));

  const publicar = async (filas, texto) => {
    if (!filas.length) return;
    if (!window.confirm(`${texto}\n\nLas que ya están publicadas no se tocan. ¿Seguir?`)) return;
    setOcupado(true); setAviso(null);
    try {
      // Sólo las columnas del catálogo (sin el estado de la comparación).
      const n = await publicarCatalogo(clubId, filas.map(({ clave, jugador_id: j, tipo: t, rareza, carta }) => ({ clave, jugador_id: j, tipo: t, rareza, carta })));
      setAviso({ texto: `Se publicaron ${n} cartas.` });
      setElegidas(new Set());
      recargar();
    } catch (err) {
      setAviso({ texto: err?.message || 'No se pudieron publicar.', error: true });
    } finally { setOcupado(false); }
  };

  if (plantel.loading || catalogo === null) return <div style={dim}>Leyendo el plantel y el catálogo…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...dim, lineHeight: 1.5 }}>
        Una carta publicada <b style={{ color: 'var(--text)' }}>no se pisa nunca</b>: la básica es la inicial del jugador y lo que mejora
        llega como cartas nuevas (POTW, TOTW, TOTM…). Acá elegís cuáles de las que todavía no están publicar.
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PESTANAS.map(([id, t]) => (
          <button key={id} onClick={() => cambiarPestana(id)} style={chip(pestana === id)}>
            {t} · {id === 'sincarta' ? sinCarta.length : estados[id] || 0}
          </button>
        ))}
      </div>

      {pestana === 'sincarta' ? (
        <SinCarta jugadores={sinCarta} esMovil={esMovil} ocupado={ocupado}
          crear={(j, datos) => publicar([cartaBaseManual(j, datos)], `Vas a crear la carta BASE de ${j.apellido || j.nombre} (media ${datos.ovr}).`)} />
      ) : (
        <>
          {tipos.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['TODAS', ...tipos].map((t) => (
                <button key={t} onClick={() => { setTipo(t); setLimite(POR_PAGINA); }} style={chipChico(tipo === t)}>
                  {t === 'TODAS' ? 'TODAS' : nombreTipo(t)} · {t === 'TODAS' ? deLaPestana.length : deLaPestana.filter((i) => i.tipo === t).length}
                </button>
              ))}
            </div>
          )}

          {pestana === 'nueva' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 2, padding: '8px 0', background: 'var(--bg, #000)' }}>
              <button style={chipChico(false)} onClick={() => setElegidas(new Set([...elegidas, ...visibles.map((i) => i.clave)]))}>ELEGIR LAS {visibles.length} QUE SE VEN</button>
              <button style={chipChico(false)} onClick={() => setElegidas(new Set())} disabled={!elegidas.size}>NINGUNA</button>
              <button style={{ ...boton, background: ORO, color: '#1a1205', opacity: elegidasNuevas.length ? 1 : 0.5 }} disabled={!elegidasNuevas.length || ocupado}
                onClick={() => publicar(elegidasNuevas, `Vas a publicar ${elegidasNuevas.length} cartas nuevas para los sobres.`)}>
                {ocupado ? 'PUBLICANDO…' : `PUBLICAR ${elegidasNuevas.length} ELEGIDAS`}
              </button>
              {aviso && <span role="status" style={{ fontSize: 13, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</span>}
            </div>
          )}
          {pestana !== 'nueva' && aviso && <span role="status" style={{ fontSize: 13, color: aviso.error ? '#ef4444' : 'var(--accent)' }}>{aviso.texto}</span>}

          {visibles.length === 0 ? (
            <div className="bento-card" style={{ padding: 24, textAlign: 'center', ...dim }}>
              {pestana === 'nueva' ? 'No hay cartas nuevas para publicar con estos filtros.' : 'No hay cartas acá.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${esMovil ? 104 : 128}px, 1fr))`, gap: 12 }}>
              {visibles.slice(0, limite).map((i) => (
                <Item key={i.clave} item={i} elegida={elegidas.has(i.clave)} alTocar={pestana === 'nueva' ? () => alternar(i.clave) : null} />
              ))}
            </div>
          )}
          {visibles.length > limite && <button style={chipChico(false)} onClick={() => setLimite((l) => l + POR_PAGINA)}>VER {Math.min(POR_PAGINA, visibles.length - limite)} MÁS</button>}
        </>
      )}
    </div>
  );
}

/* Una carta de la grilla. En NUEVAS se elige tocándola; en PUBLICADAS se ve la
   publicada (la que manda) y, si la de hoy da otra media, se avisa. */
function Item({ item, elegida, alTocar }) {
  const carta = item.estado === 'publicada' ? { ...item.carta, ...(item.existente?.carta || {}) } : item.carta;
  const hoy = item.carta?.ovr;
  const distinta = item.estado === 'publicada' && item.tipo === 'BASE' && hoy != null && hoy !== item.existente?.carta?.ovr;
  return (
    <div role={alTocar ? 'checkbox' : undefined} aria-checked={alTocar ? elegida : undefined} tabIndex={alTocar ? 0 : undefined}
      onClick={alTocar || undefined} onKeyDown={alTocar ? (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alTocar(); } } : undefined}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 6, borderRadius: 10, cursor: alTocar ? 'pointer' : 'default',
        border: `2px solid ${elegida ? ORO : 'transparent'}`, background: elegida ? 'rgba(251,191,36,.08)' : 'transparent', opacity: item.estado === 'eliminada' ? 0.45 : 1 }}>
      <CartaJugador carta={carta} chica />
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: 'var(--text-dim)', textAlign: 'center' }}>
        {nombreTipo(item.tipo)}{carta.categoria ? ` · ${carta.categoria}` : ''}
      </div>
      {distinta && <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>hoy daría {hoy} (no se cambia)</div>}
      {alTocar && <div style={{ fontSize: 10, fontWeight: 900, color: elegida ? ORO : 'var(--text-dim)' }}>{elegida ? '✓ ELEGIDA' : 'TOCÁ PARA ELEGIR'}</div>}
    </div>
  );
}

/* SIN CARTA: la carta BASE de principio de temporada, cargada a mano. */
function SinCarta({ jugadores, crear, ocupado, esMovil }) {
  const [abierto, setAbierto] = useState(null);
  if (!jugadores.length) return <div className="bento-card" style={{ padding: 24, textAlign: 'center', ...dim }}>Todos los del plantel tienen su carta básica.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={dim}>Sin partidos todavía (o sin el mínimo para tener media): cargá su carta inicial. Después mejora con las cartas de premio.</div>
      {jugadores.map((j) => (
        <div key={j.id} className="bento-card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ flex: 1, minWidth: 160 }}>{[j.apellido, j.nombre].filter(Boolean).join(', ') || 'Sin nombre'}</b>
            <span style={dim}>{j.rol}{j.categoria ? ` · ${j.categoria}` : ''} · {j.partidos} PJ</span>
            <button style={chipChico(abierto === j.id)} onClick={() => setAbierto(abierto === j.id ? null : j.id)}>{abierto === j.id ? 'CERRAR' : 'CARGAR CARTA'}</button>
          </div>
          {abierto === j.id && <FormBase jugador={j} crear={crear} ocupado={ocupado} esMovil={esMovil} />}
        </div>
      ))}
    </div>
  );
}

function FormBase({ jugador, crear, ocupado, esMovil }) {
  const [ovr, setOvr] = useState(60);
  const [atributos, setAtributos] = useState(() => atributosSugeridos(jugador.rol, 60));
  const cambiarMedia = (v) => { setOvr(v); setAtributos(atributosSugeridos(jugador.rol, v)); };
  const vista = cartaBaseManual(jugador, { ovr, atributos }).carta;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '140px 1fr', gap: 14, marginTop: 12, alignItems: 'start' }}>
      <div style={{ justifySelf: 'center' }}><CartaJugador carta={vista} chica /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={campo}>MEDIA
          <input type="number" min={1} max={99} value={ovr} onChange={(e) => cambiarMedia(Number(e.target.value))} style={input} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {atributos.map(([k, v], i) => (
            <label key={k} style={campo}>{k}
              <input type="number" min={1} max={99} value={v} style={input}
                onChange={(e) => setAtributos((a) => a.map((x, n) => (n === i ? [x[0], Number(e.target.value)] : x)))} />
            </label>
          ))}
        </div>
        <div style={dim}>Cambiar la media sugiere las stats según el puesto; después las podés tocar una por una.</div>
        <button style={{ ...boton, background: ORO, color: '#1a1205', alignSelf: 'flex-start' }} disabled={ocupado} onClick={() => crear(jugador, { ovr, atributos })}>
          {ocupado ? 'CREANDO…' : 'CREAR CARTA BASE'}
        </button>
      </div>
    </div>
  );
}

const dim = { color: 'var(--text-dim)', fontSize: '0.8rem' };
const campo = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--text-dim)' };
const input = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 15, fontWeight: 800 };
const boton = { padding: '10px 16px', minHeight: 44, borderRadius: 8, border: 'none', fontWeight: 900, letterSpacing: '.06em', cursor: 'pointer', fontSize: 13 };
const chip = (activo) => ({
  padding: '8px 14px', minHeight: 40, whiteSpace: 'nowrap', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
  border: `1px solid ${activo ? ORO : 'var(--border)'}`, color: activo ? ORO : 'var(--text-dim)', background: activo ? 'rgba(251,191,36,.08)' : 'transparent',
});
const chipChico = (activo) => ({ ...chip(activo), padding: '6px 10px', minHeight: 34, fontSize: 11 });
