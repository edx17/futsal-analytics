import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCategorias } from '../utils/useCategorias';
import { useDatosPlantel } from '../utils/useDatosPlantel';
import { useEsMovil } from '../utils/useEsMovil';
import { procesarPlantel } from '../analytics/plantel';
import {
  analizarPartidos, armarCartas, FORMACIONES, quintetoIdeal, quintetoMasUsado, quimicaDe,
  ubicar, etiquetaLugar, puedeIr, CASTIGO_FUERA_DE_PUESTO,
} from '../analytics/quinteto';
import { useArrastre } from '../components/quinteto/useArrastre';
import CanchaPerspectiva from '../components/quinteto/CanchaPerspectiva';
import CartaJugador from '../components/quinteto/CartaJugador';
import { Icono } from '../iconos';
import '../components/quinteto/quinteto.css';

/* MYSQUAD (antes "Mi Quinteto")
 *
 * El plantel como cartas de Ultimate Team, sobre una cancha en perspectiva.
 * Es para "jugar": armar quintetos, ver el ideal según los números y comparar
 * con el que más se usó de verdad. Las cartas salen de los mismos datos que
 * Resumen de plantel; las cuentas viven en analytics/quinteto.js.
 */

const MONO = 'JetBrains Mono, monospace';
const COLOR_ATTR = (v) => (v >= 80 ? '#00ff88' : v >= 65 ? '#fbbf24' : '#ef4444');
const COLOR_RATING = (r) => (r >= 7 ? '#00ff88' : r >= 6 ? '#fbbf24' : '#ef4444');
const TEXTO_TIER = {
  oro: 'Carta ORO: media de 75 o más.',
  plata: 'Carta PLATA: media entre 65 y 74.',
  bronce: 'Carta BRONCE: media de menos de 65.',
  figura: 'Carta FIGURA: fue la figura del último partido. La conserva hasta el siguiente.',
  evaluacion: 'EN EVALUACIÓN: todavía no llega al mínimo de partidos para tener media.',
};

export default function MiQuinteto() {
  const { perfil } = useAuth();
  const esMovil = useEsMovil();
  const clubId = localStorage.getItem('club_id') || perfil?.club_id;
  const misCategorias = useMemo(() => perfil?.categorias_asignadas || [], [perfil?.categorias_asignadas]);

  const [filtroCategoria, setFiltroCategoria] = useState('Todas');
  const [filtroTorneo, setFiltroTorneo] = useState('Todos');
  const [formacionId, setFormacionId] = useState('2-2');
  const [alineacion, setAlineacion] = useState([null, null, null, null, null]);
  const [sel, setSel] = useState(null);
  const [verId, setVerId] = useState(null);
  const [aviso, setAviso] = useState(null);

  const { raw, loading, avance } = useDatosPlantel(clubId);
  const { categorias } = useCategorias({ incluirHistoricas: true, asignadas: misCategorias });

  /* ── mismos filtros que Resumen de plantel ── */
  const partidosScopeCat = useMemo(() => {
    let p = raw.partidos;
    if (misCategorias.length > 0) p = p.filter((x) => !x.categoria || misCategorias.includes(x.categoria));
    if (filtroCategoria !== 'Todas') p = p.filter((x) => x.categoria === filtroCategoria);
    return p;
  }, [raw.partidos, misCategorias, filtroCategoria]);

  const torneos = useMemo(() => {
    const m = new Map();
    partidosScopeCat.forEach((p) => { if (p.torneo_id) m.set(p.torneo_id, p.competicion || 'Torneo'); });
    return [...m.entries()].map(([id, nombre]) => ({ id, nombre }));
  }, [partidosScopeCat]);

  const partidosFiltro = useMemo(
    () => (filtroTorneo === 'Todos' ? partidosScopeCat : partidosScopeCat.filter((p) => p.torneo_id === filtroTorneo)),
    [partidosScopeCat, filtroTorneo],
  );

  const { cartas, minimo, partidosEquipo, analisis } = useMemo(() => {
    const { jugadoresProc, arquerosProc } = procesarPlantel({
      raw, partidosScopeCat, filtroTorneo, filtroCategoria, misCategorias,
      hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
    });
    const a = analizarPartidos({ partidos: partidosFiltro, eventos: raw.eventos, jugadores: raw.jugadores });
    return { ...armarCartas({ jugadoresProc, arquerosProc, forma: a.forma, figura: a.figura }), analisis: a };
  }, [raw, partidosScopeCat, partidosFiltro, filtroTorneo, filtroCategoria, misCategorias]);

  const porId = useMemo(() => new Map(cartas.map((c) => [c.id, c])), [cartas]);
  const formacion = FORMACIONES[formacionId];

  /* Al cambiar el filtro (o al llegar los datos) arranca con el quinteto ideal. */
  useEffect(() => {
    setAlineacion(quintetoIdeal(cartas, FORMACIONES[formacionId]));
    setSel(null);
    setVerId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartas]);

  const enCancha = alineacion.map((id) => (id != null ? porId.get(id) || null : null));
  const banco = cartas.filter((c) => !alineacion.includes(c.id));
  const { lineas, total: quimica, fueraDePuesto } = quimicaDe(alineacion, formacion, analisis.parejas, enCancha);
  const presentes = enCancha.filter(Boolean);
  const media = presentes.length ? Math.round(presentes.reduce((s, c) => s + c.ovr, 0) / presentes.length) : 0;

  const cambiarFormacion = (id) => {
    // Los mismos cinco, reubicados según los puestos de la formación nueva.
    const f = FORMACIONES[id];
    const campo = alineacion.slice(1).map((x) => (x != null ? porId.get(x) || null : null));
    setAlineacion([alineacion[0], ...ubicar(campo, f).map((c) => c?.id ?? null)]);
    setFormacionId(id);
    setSel(null);
  };

  /* ── LAS REGLAS DEL CAMBIO ──
     El arco es fijo: ahí sólo va un arquero y un arquero no sale al campo.
     En el campo, cualquiera puede ir a cualquier lugar; si no es su puesto,
     la carta lo marca y la química baja. */
  const avisar = (texto) => {
    setAviso(texto);
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => setAviso(null), 3500);
  };
  const motivoNo = (carta, i) => (i === 0
    ? `En el arco sólo puede ir un arquero (${(carta.apellido || '').toUpperCase()} es ${carta.rol}).`
    : 'Un arquero no puede jugar de jugador de campo.');

  /* origen: { tipo: 'banco', id } o { tipo: 'cancha', i } */
  const cartaDe = (origen) => (origen.tipo === 'banco' ? porId.get(origen.id) : enCancha[origen.i]);

  const destinoValido = (origen, destino) => {
    if (origen.tipo === 'cancha' && origen.i === destino) return false;
    const carta = cartaDe(origen);
    if (!puedeIr(carta, destino)) return false;
    // Si se intercambian dos de la cancha, el que estaba también tiene que poder ir al lugar de origen.
    if (origen.tipo === 'cancha') return puedeIr(enCancha[destino], origen.i);
    return true;
  };

  const cambiar = (origen, destino) => {
    const carta = cartaDe(origen);
    setAlineacion((al) => {
      const nueva = [...al];
      if (origen.tipo === 'cancha') {
        nueva[origen.i] = al[destino];
        nueva[destino] = al[origen.i];
      } else {
        nueva[destino] = origen.id;
      }
      return nueva;
    });
    setSel(null);
    setVerId(carta?.id ?? null);
  };

  const rechazar = (origen, destino) => {
    if (origen.tipo === 'cancha' && origen.i === destino) return;
    const carta = cartaDe(origen);
    if (!puedeIr(carta, destino)) avisar(motivoNo(carta, destino));
    else avisar(motivoNo(enCancha[destino], origen.i));
  };

  const arrastre = useArrastre({ alSoltar: cambiar, destinoValido, alRechazar: rechazar });

  const elegirLugar = (i) => {
    if (arrastre.recienArrastro()) return;
    setSel((s) => (s === i ? null : i));
    setVerId(alineacion[i]);
  };

  const elegirSuplente = (c) => {
    if (arrastre.recienArrastro()) return;
    if (sel == null) { setVerId(c.id); return; }
    if (!puedeIr(c, sel)) { avisar(motivoNo(c, sel)); return; }
    cambiar({ tipo: 'banco', id: c.id }, sel);
  };

  const cargarIdeal = () => { setAlineacion(quintetoIdeal(cartas, formacion)); setSel(null); };
  const usado = quintetoMasUsado(analisis.quintetos, cartas, formacion);
  const cargarUsado = () => { if (usado) { setAlineacion(usado); setSel(null); } };

  const detalle = verId != null ? porId.get(verId) : null;

  if (!clubId) return <div style={{ textAlign: 'center', marginTop: 50, color: '#ef4444' }}>Elegí un club para armar el quinteto.</div>;

  return (
    <div style={{ paddingBottom: 80, maxWidth: 1400, margin: '0 auto', animation: 'fadeIn 0.3s' }}>

      {/* ── encabezado y filtros ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <Icono nombre="juego" size={36} relleno="propio" style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="stat-label" style={{ color: 'var(--accent)', fontSize: '1.2rem' }}>MYSQUAD</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>Tu plantel en cartas: armá el quinteto, mirá el ideal y la química real de cada pareja.</div>
        </div>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={selectStyle}>
          {!(misCategorias.length === 1) && <option value="Todas">TODAS LAS CATEGORÍAS</option>}
          {categorias.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
        </select>
        <select value={filtroTorneo} onChange={(e) => setFiltroTorneo(e.target.value)} style={selectStyle}>
          <option value="Todos">TODA LA TEMPORADA</option>
          {torneos.map((t) => <option key={t.id} value={t.id}>{String(t.nombre).toUpperCase()}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>
          Armando las cartas…
          {avance.total > 0 && (
            <div style={{ marginTop: 14, fontSize: '0.75rem', fontFamily: MONO }}>
              {avance.traidas.toLocaleString('es-AR')} de {avance.total.toLocaleString('es-AR')} acciones
            </div>
          )}
        </div>
      ) : cartas.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          Todavía no hay partidos con datos para estos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr' : '230px minmax(0, 1fr) 280px', gap: 18, alignItems: 'start' }}>

          {/* ── izquierda: media, química, formación, botones ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, order: esMovil ? 3 : 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: esMovil ? '1fr 1fr' : '1fr', gap: 12 }}>
              <div className="bento-card" style={caja}>
                <div style={rotulo}>MEDIA DEL QUINTETO</div>
                <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: 'var(--accent)' }}>{media}</div>
                <Barra pct={media} color="var(--accent)" />
              </div>
              <div className="bento-card" style={caja}>
                <div style={rotulo}>QUÍMICA</div>
                <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: quimica >= 70 ? '#00ff88' : quimica >= 45 ? '#fbbf24' : '#ef4444' }}>
                  {quimica}<span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>/ 100</span>
                </div>
                <Barra pct={quimica} color={quimica >= 70 ? '#00ff88' : quimica >= 45 ? '#fbbf24' : '#ef4444'} />
                {fueraDePuesto > 0 && (
                  <div style={{ fontSize: '0.65rem', color: '#f97316', marginTop: 6, fontWeight: 700 }}>
                    −{fueraDePuesto * CASTIGO_FUERA_DE_PUESTO} por {fueraDePuesto} fuera de puesto
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={rotulo}>FORMACIÓN</div>
              <div style={{ display: 'grid', gridTemplateColumns: esMovil ? 'repeat(4, 1fr)' : '1fr 1fr', gap: 6 }}>
                {Object.values(FORMACIONES).map((f) => (
                  <button key={f.id} onClick={() => cambiarFormacion(f.id)} style={{
                    ...btnForm,
                    borderColor: f.id === formacionId ? 'var(--accent)' : 'var(--border)',
                    color: f.id === formacionId ? 'var(--accent)' : 'var(--text-dim)',
                    background: f.id === formacionId ? 'rgba(0,255,136,.08)' : 'transparent',
                  }}>
                    {f.id}<small style={{ display: 'block', fontSize: 9, letterSpacing: '.12em', fontWeight: 700, marginTop: 2 }}>{f.nombre}</small>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={cargarIdeal} className="btn-action" style={btnAccion}>
              <Icono nombre="estrella" size="1.2em" relleno="propio" style={{ marginRight: 8 }} />QUINTETO IDEAL
            </button>
            <button onClick={cargarUsado} disabled={!usado} className="btn-secondary" style={{ ...btnAccion, opacity: usado ? 1 : 0.45 }}
              title={usado ? '' : 'No hay un quinteto con los cinco jugadores en este filtro'}>
              <Icono nombre="actualizar" size="1.2em" style={{ marginRight: 8 }} />EL MÁS USADO
            </button>

            <div className="bento-card" style={{ ...caja, fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ ...rotulo, marginBottom: 2 }}>LÍNEAS DE QUÍMICA</div>
              <Leyenda color="#00ff88" texto="Mucho tiempo juntos y +/− a favor" />
              <Leyenda color="#fbbf24" texto="Menos de un partido juntos" />
              <Leyenda color="#ef4444" texto="Juntos les fue mal (+/− en contra)" />
              <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                Cada lugar pide un puesto. Si ponés a alguien de otro puesto, la carta dice <b style={{ color: '#f97316' }}>FUERA DE PUESTO</b> y la química baja {CASTIGO_FUERA_DE_PUESTO} puntos. El arco es sólo para arqueros.
              </div>
              <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                Media: rating promedio del filtro, en escala 40-99. Con menos de {minimo} partidos (el equipo lleva {partidosEquipo}) la carta queda en evaluación.
              </div>
            </div>
          </div>

          {/* ── centro: cancha y banco ── */}
          <div style={{ minWidth: 0, order: esMovil ? 0 : 1 }}>
            <CanchaPerspectiva formacion={formacion} alineacion={enCancha} lineas={lineas} seleccionado={sel} onElegir={elegirLugar}
              arrastre={arrastre.vista}
              onEmpezarArrastre={(e, i) => enCancha[i] && arrastre.empezar(e, { tipo: 'cancha', i }, enCancha[i])} />

            <div style={{ fontSize: '0.7rem', color: aviso ? '#ef4444' : sel != null ? 'var(--accent)' : 'var(--text-dim)', textAlign: 'center', margin: '4px 0 8px', fontWeight: 700, minHeight: '1.2em' }}>
              {aviso
                || (sel != null
                  ? `Tocá un suplente para ponerlo de ${etiquetaLugar(formacion.lugares[sel])}${enCancha[sel] ? ` en lugar de ${enCancha[sel].apellido.toUpperCase()}` : ''}`
                  : 'Arrastrá un suplente sobre una carta para cambiarlo, o dos cartas de la cancha para intercambiarlas. También podés tocar el lugar y después el suplente.')}
            </div>

            <div className="bento-card" style={{ padding: '12px 12px 14px' }}>
              <div style={rotulo}>SUPLENTES · {banco.length}</div>
              <div className="custom-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                {banco.map((c) => (
                  <CartaJugador key={c.id} carta={c} chica seleccionada={verId === c.id} onClick={() => elegirSuplente(c)}
                    className={arrastre.vista?.origen?.tipo === 'banco' && arrastre.vista.origen.id === c.id ? 'mq-origen' : ''}
                    onPointerDown={(e) => arrastre.empezar(e, { tipo: 'banco', id: c.id }, c)} />
                ))}
              </div>
            </div>
          </div>

          {/* ── derecha: detalle del jugador (en el celular, debajo del banco) ── */}
          <div style={{ order: esMovil ? 1 : 3 }}>
            {detalle ? <Detalle carta={detalle} /> : (
              <div className="bento-card" style={{ ...caja, color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center', padding: 30 }}>
                Tocá una carta para ver sus atributos y su forma.
              </div>
            )}
          </div>
        </div>
      )}

      {/* La carta que sigue al dedo (o al mouse) mientras se arrastra. */}
      {arrastre.vista && (
        <div className="mq-fantasma" style={{ left: arrastre.vista.x, top: arrastre.vista.y }}>
          <CartaJugador carta={arrastre.vista.carta} chica />
        </div>
      )}
    </div>
  );
}

function Detalle({ carta }) {
  const forma = carta.forma || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--panel)', border: '2px solid var(--accent)', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 900, color: 'var(--accent)' }}>
          {carta.foto ? <img src={carta.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `${(carta.nombre || '?')[0]}${(carta.apellido || '')[0] || ''}`.toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.05, color: 'var(--text)' }}>{(carta.apellido || '').toUpperCase()}<br />{carta.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.08em', marginTop: 4 }}>
            {[carta.dorsal != null ? `#${carta.dorsal}` : null, carta.rol, carta.categoria].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 34, fontWeight: 900, color: 'var(--accent)' }}>{carta.enEvaluacion ? '—' : carta.ovr}</div>
      </div>

      <div className="bento-card" style={caja}>
        <div style={rotulo}>ATRIBUTOS</div>
        {carta.atributos.map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 28px', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, marginBottom: 6, color: 'var(--text)' }}>
            <span>{k}</span>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${v}%`, height: '100%', background: COLOR_ATTR(v) }} />
            </div>
            <b style={{ textAlign: 'right', fontFamily: MONO }}>{v}</b>
          </div>
        ))}
      </div>

      {forma.length > 0 && (
        <div className="bento-card" style={caja}>
          <div style={rotulo}>FORMA · ÚLTIMOS {forma.length} PARTIDOS</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 70, marginTop: 16 }}>
            {forma.map((f, i) => (
              <div key={i} title={`${f.fecha} vs ${f.rival}`} style={{ flex: 1, height: `${Math.max(8, (f.rating / 10) * 100)}%`, background: COLOR_RATING(f.rating), borderRadius: '4px 4px 0 0', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -16, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text)' }}>{f.rating.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {forma.map((f, i) => (
              <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-dim)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {String(f.rival).slice(0, 3).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center' }}>
        {[['PJ', carta.stats.pj], ['MIN', `${carta.stats.min}'`], ['GOLES', carta.stats.goles], ['ASIST', carta.stats.asist]].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 0' }}>
            <b style={{ display: 'block', fontSize: 17, fontWeight: 900, color: 'var(--text)' }}>{v}</b>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '.12em', fontWeight: 700 }}>{l}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        {TEXTO_TIER[carta.tier]}
        {carta.stats.rating != null && ` Rating promedio: ${carta.stats.rating.toFixed(2)}.`}
      </div>
    </div>
  );
}

const Barra = ({ pct, color }) => (
  <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
    <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color }} />
  </div>
);

const Leyenda = ({ color, texto }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <i style={{ display: 'inline-block', width: 22, height: 3, borderRadius: 2, background: color, flexShrink: 0 }} />{texto}
  </span>
);

const caja = { padding: 14 };
const rotulo = { fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: 'var(--text-dim)', marginBottom: 10 };
const selectStyle = { width: 'auto', flex: '0 1 auto', padding: '10px 12px', fontSize: '0.85rem', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, outline: 'none', fontWeight: 800, cursor: 'pointer' };
const btnForm = { padding: '10px 0', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 900, fontSize: 16, cursor: 'pointer' };
const btnAccion = { padding: 12, borderRadius: 8, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
