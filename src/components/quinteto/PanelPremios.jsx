import React, { useEffect, useMemo, useState } from 'react';
import CartaPremio from './CartaPremio';
import CartaEspecial from './CartaEspecial';
import { ModalPlacaPremio } from '../../placas/PlacaPremio';
import {
  premiosDelPartido, premiosDelMes, premioTemporada, ultimoPartido, mesesConPartidos,
  registrosDePartido, registrosDeMes, registroTemporada, registrosDefinitivos, mesCerrado,
} from '../../analytics/premios';
import {
  PREMIOS, etiquetaMes, fechaCorta, indicePorId, cartasDeRegistro, datosDePlaca, criterioEspecial,
} from '../../analytics/premiosCartas';
import { especialesDelMes, especialesPrimeraRueda, ruedaCerrada } from '../../analytics/especiales';
import { tieneRuedasConfiguradas } from '../../utils/ruedas';
import { guardarRegistros } from '../../utils/cartasDestacadas';
import { publicarPremiosPendientes, cartasSinAtributos } from '../../utils/publicarPremios';
import { hoyISO } from '../../utils/disponibilidad';

/* PREMIOS DE MYSQUAD
 *
 * Los cinco premios, calculados con los partidos del filtro que esté elegido
 * arriba (categoría y torneo):
 *
 *   último partido → POTW (jugador) y TOTW (quinteto)
 *   un mes         → POTM (jugador) y TOTM (quinteto), con el mínimo de mitad + 1
 *   temporada      → TOTY, con el 65% de los partidos
 *
 * Cada uno se puede exportar como placa para redes y guardar en el historial.
 */

const MONO = 'JetBrains Mono, monospace';

/* `historial`: los premios ya guardados. Lo guardado no se vuelve a mostrar acá
   (se ve en HISTORIAL y en ESPECIALES); `alGuardar` avisa para releerlo. */
/* Las cartas especiales (especiales.js) necesitan los datos crudos: `raw`, los
   partidos del filtro (`partidosFiltro`), los de la categoría (`partidosCategoria`,
   para cortar la primera rueda) y el torneo elegido. */
export default function PanelPremios({
  partidosJugados = [], jugadores = [], club, clubId, categoria = 'Todas', torneoId = 'Todos', esMovil, historial = [], alGuardar,
  raw = null, partidosFiltro = [], partidosCategoria = [], torneo = null, misCategorias = [], cartas = [],
}) {
  const [mesElegido, setMesElegido] = useState(null);
  const [placa, setPlaca] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const porId = useMemo(() => indicePorId(jugadores), [jugadores]);

  /* Las cartas de los sobres que quedaron sin atributos (TIR, PAS…) y se pueden completar con las de MySquad. */
  const [sinDatos, setSinDatos] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    cartasSinAtributos(clubId, cartas).then((n) => { if (vivo) setSinDatos(n); }).catch(() => {});
    return () => { vivo = false; };
  }, [clubId, cartas, version]);
  const sobresTexto = ({ publicadas, completadas }) => [
    publicadas ? ` Se publicaron ${publicadas} cartas para los sobres.` : '',
    completadas ? ` Se completaron los datos de ${completadas} cartas.` : '',
  ].join('');
  const completar = async () => {
    setGuardando(true); setAviso(null);
    try {
      const r = await publicarPremiosPendientes(clubId, cartas);
      avisar(`Listo.${sobresTexto(r)}`);
    } catch (err) {
      console.error('Completar cartas:', err);
      avisar(err?.message || 'No se pudieron completar las cartas.', true);
    } finally {
      setGuardando(false);
      setVersion((v) => v + 1);
    }
  };
  const meses = useMemo(() => mesesConPartidos(partidosJugados), [partidosJugados]);
  const mes = mesElegido && meses.includes(mesElegido) ? mesElegido : meses[meses.length - 1];

  const ultimo = useMemo(() => ultimoPartido(partidosJugados), [partidosJugados]);
  const delPartido = useMemo(() => (ultimo ? premiosDelPartido(ultimo) : null), [ultimo]);
  const delMes = useMemo(() => (mes ? premiosDelMes(partidosJugados, mes) : null), [partidosJugados, mes]);
  const temporada = useMemo(() => premioTemporada(partidosJugados), [partidosJugados]);

  const [potw, totw] = useMemo(() => registrosDePartido(delPartido), [delPartido]);
  const [potm, totm] = useMemo(() => registrosDeMes(delMes), [delMes]);
  const toty = useMemo(() => registroTemporada(temporada, partidosJugados), [temporada, partidosJugados]);
  const guardados = useMemo(() => clavesGuardadas(historial, categoria, torneoId), [historial, categoria, torneoId]);

  /* ── las cartas especiales ── */
  const espMes = useMemo(
    () => (raw && mes ? especialesDelMes({ raw, partidos: partidosFiltro, mes, misCategorias }) : null),
    [raw, partidosFiltro, mes, misCategorias],
  );
  const espRueda = useMemo(
    () => (raw && torneo ? especialesPrimeraRueda({ raw, partidos: partidosCategoria, torneo, misCategorias }) : null),
    [raw, partidosCategoria, torneo, misCategorias],
  );
  const conDatos = useMemo(() => new Set((raw?.eventos || []).map((e) => String(e.id_partido))), [raw]);
  const ruedaTerminada = useMemo(() => (torneo ? ruedaCerrada(partidosCategoria, torneo, conDatos) : false), [torneo, partidosCategoria, conDatos]);
  const yaGuardado = (r) => !!r && guardados.has(`${r.tipo}|${r.periodo}`);

  if (partidosJugados.length === 0) {
    return (
      <div className="bento-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
        Todavía no hay partidos con datos para estos filtros.
      </div>
    );
  }

  const avisar = (texto, error = false) => setAviso({ texto, error });

  const exportar = (registro) => {
    if (!registro) return;
    setPlaca(datosDePlaca({ ...registro, cartas: cartasDeRegistro(registro, porId), club, categoria }));
  };

  const guardar = async (registros, { sobrescribir }) => {
    const lista = registros.filter(Boolean);
    if (lista.length === 0) return;
    setGuardando(true); setAviso(null);
    try {
      const { escritas, total } = await guardarRegistros({ clubId, categoria, torneoId, registros: lista, porId, sobrescribir });
      // Y para los sobres: lo guardado se publica en el catálogo (aparece en el Modo GOD).
      let sinPublicar = false;
      let r = { publicadas: 0, completadas: 0 };
      try { r = await publicarPremiosPendientes(clubId, cartas); } catch (err) { console.error('Publicar premios:', err); sinPublicar = true; }
      setVersion((v) => v + 1);
      const sobres = sinPublicar ? ' No se pudieron publicar para los sobres: publicalas desde el Modo GOD.' : sobresTexto(r);
      if (sobrescribir) avisar(`Guardado en el historial.${sobres}`, sinPublicar);
      else if (escritas === 0) avisar(`Ya estaba todo guardado (${total} premios).${sobres}`, sinPublicar);
      else avisar(`Se guardaron ${escritas} premios nuevos en el historial${escritas < total ? ` (los otros ${total - escritas} ya estaban)` : ''}.${sobres}`, sinPublicar);
      alGuardar?.();
    } catch (err) {
      console.error('Guardar premios:', err);
      avisar(err?.message || 'No se pudo guardar el historial.', true);
    } finally {
      setGuardando(false);
    }
  };

  /* Lo definitivo: premios de partidos y meses cerrados, las especiales de los
     meses cerrados y las de la primera rueda si ya terminó. */
  const congelar = () => {
    const hoy = hoyISO();
    const especiales = raw ? meses.filter((m) => mesCerrado(m, hoy))
      .flatMap((m) => especialesDelMes({ raw, partidos: partidosFiltro, mes: m, misCategorias }).registros) : [];
    const deRueda = espRueda && ruedaTerminada ? espRueda.registros : [];
    return guardar([...registrosDefinitivos(partidosJugados, hoy), ...especiales, ...deRueda], { sobrescribir: false });
  };
  const mesAbierto = mes && !mesCerrado(mes, hoyISO());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      <div className="bento-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 14 }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Los premios salen de las notas de cada partido del filtro de arriba. Podés <b style={{ color: 'var(--text)' }}>exportar</b> cada uno
          como placa para redes y <b style={{ color: 'var(--text)' }}>guardarlo</b> en el historial para que no cambie si después se corrige un partido.
        </div>
        <button onClick={congelar} disabled={guardando} className="btn-secondary" style={btnChico}>
          {guardando ? 'GUARDANDO…' : 'GUARDAR TODO LO DEFINITIVO'}
        </button>
      </div>

      {sinDatos > 0 && (
        <div className="bento-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 14, border: '1px solid rgba(251,191,36,.5)' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.5 }}>
            Hay <b>{sinDatos}</b> cartas de los sobres sin datos abajo (TIR, PAS, REG…): se publicaron sin la carta base del jugador.
            Se completan con las de MySquad{torneoId === 'Todos' ? '' : ' (conviene hacerlo con TODA LA TEMPORADA elegida arriba)'}.
          </div>
          <button onClick={completar} disabled={guardando} className="btn-secondary" style={btnChico}>
            {guardando ? 'COMPLETANDO…' : `COMPLETAR LAS ${sinDatos}`}
          </button>
        </div>
      )}

      {aviso && (
        <div style={{ fontSize: '0.8rem', fontWeight: 700, padding: '10px 14px', borderRadius: 8,
                      color: aviso.error ? '#ef4444' : 'var(--accent)',
                      background: aviso.error ? 'rgba(239,68,68,.08)' : 'rgba(0,255,136,.08)',
                      border: `1px solid ${aviso.error ? 'rgba(239,68,68,.3)' : 'rgba(0,255,136,.3)'}` }}>
          {aviso.texto}
        </div>
      )}

      {/* ── ÚLTIMO PARTIDO ── */}
      <Seccion titulo="ÚLTIMO PARTIDO"
        detalle={ultimo ? `vs ${String(ultimo.rival).toUpperCase()} · ${ultimo.golesFavor}-${ultimo.golesContra} · ${fechaCorta(ultimo.fecha)}` : ''}>
        {delPartido ? (
          <>
            <Premio registro={potw} guardado={yaGuardado(potw)} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([potw], { sobrescribir: true })} guardando={guardando}
              nota={`${delPartido.potw.etiqueta} · nota ${delPartido.potw.nota.toFixed(1)}`} />
            <Premio registro={totw} guardado={yaGuardado(totw)} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([totw], { sobrescribir: true })} guardando={guardando}
              nota={delPartido.totw.sinArquero ? 'No hay arquero con nota en este partido: el quinteto se armó con cinco de campo.' : 'Arquero y los cuatro mejores de campo. La estrella marca al jugador del partido.'} />
          </>
        ) : <Vacio texto="El último partido no tiene notas." />}
      </Seccion>

      {/* ── MES ── */}
      <Seccion titulo="MES"
        detalle={delMes ? `${delMes.partidos} ${delMes.partidos === 1 ? 'partido' : 'partidos'} · hay que haber jugado ${delMes.minimo}` : ''}
        derecha={(
          <select value={mes || ''} onChange={(e) => setMesElegido(e.target.value)} style={selectChico} aria-label="Mes">
            {meses.map((m) => <option key={m} value={m}>{etiquetaMes(m).toUpperCase()}</option>)}
          </select>
        )}>
        {delMes ? (
          <>
            <Premio registro={potm} guardado={yaGuardado(potm)} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([potm], { sobrescribir: true })} guardando={guardando}
              nota={`Mejor nota promedio de ${delMes.potm.pj} ${delMes.potm.pj === 1 ? 'partido' : 'partidos'}.${mesAbierto ? ' El mes sigue en juego: puede cambiar.' : ''}`} />
            <Premio registro={totm} guardado={yaGuardado(totm)} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([totm], { sobrescribir: true })} guardando={guardando}
              nota={delMes.totm.sinArquero ? 'Ningún arquero llegó al mínimo: el quinteto se armó con cinco de campo.' : 'Arquero y los cuatro mejores de campo del mes, entre los que llegaron al mínimo.'} />
          </>
        ) : <Vacio texto={mes ? `Ningún jugador llegó a jugar ${Math.floor(partidosJugados.filter((p) => String(p.fecha).startsWith(mes)).length / 2) + 1} partidos en ${etiquetaMes(mes)}.` : 'No hay meses con partidos.'} />}
      </Seccion>

      {/* ── CARTAS ESPECIALES DEL MES ── */}
      {espMes && (
        <Seccion titulo={`ESPECIALES DEL MES · ${etiquetaMes(mes).toUpperCase()}`}
          detalle={espMes.estadisticas?.partidosEquipo ? `${espMes.estadisticas.partidosEquipo} partidos con datos${mesAbierto ? ' · el mes sigue en juego' : ''}` : ''}>
          {espMes.registros.length ? espMes.registros.map((r) => (
            <Premio key={r.tipo} registro={r} guardado={yaGuardado(r)} porId={porId} esMovil={esMovil} onExportar={exportar}
              onGuardar={() => guardar([r], { sobrescribir: true })} guardando={guardando} nota={criterioEspecial(r.tipo, r.contexto)} />
          )) : <Vacio texto="Nadie hizo goles, asistencias ni jugó partidos con datos este mes." />}
        </Seccion>
      )}

      {/* ── PRIMERA RUEDA ── */}
      <Seccion titulo="PRIMERA RUEDA"
        detalle={espRueda?.estadisticas ? `${torneo.nombre} · fechas 1 a ${torneo.fechas_primera_rueda} · ${espRueda.estadisticas.partidosEquipo} partidos con datos${ruedaTerminada ? '' : ' · todavía en juego'}` : ''}>
        {!torneo ? (
          <Vacio texto="Elegí un torneo arriba para ver los premios de su primera rueda (Goleador, Asistidor, Presencia, MVP y las series GOLEADORES y RECUPERADORES)." />
        ) : !tieneRuedasConfiguradas(torneo) ? (
          <Vacio texto={`El torneo ${torneo.nombre} no tiene configurado dónde corta la primera rueda (torneos.fechas_primera_rueda).`} />
        ) : espRueda?.registros?.length ? espRueda.registros.map((r) => (
          <Premio key={r.tipo} registro={r} guardado={yaGuardado(r)} porId={porId} esMovil={esMovil} onExportar={exportar}
            onGuardar={() => guardar([r], { sobrescribir: true })} guardando={guardando} nota={criterioEspecial(r.tipo, r.contexto)} />
        )) : <Vacio texto="Todavía no hay partidos con datos de la primera rueda." />}
      </Seccion>

      {/* ── TEMPORADA ── */}
      <Seccion titulo="TEMPORADA" detalle={temporada ? `${temporada.partidos} partidos · hay que haber jugado ${temporada.minimo} (65%)` : ''}>
        {toty ? (
          <Premio registro={toty} guardado={yaGuardado(toty)} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([toty], { sobrescribir: true })} guardando={guardando}
            nota="Mejor nota promedio entre los que jugaron al menos el 65% de los partidos. Se guarda a mano cuando termina la temporada." />
        ) : <Vacio texto="Todavía nadie llegó al 65% de los partidos." />}
      </Seccion>

      <ModalPlacaPremio datos={placa} onCerrar={() => setPlaca(null)} />
    </div>
  );
}

/* Un premio: título, las cartas y los botones. */
export function Premio({ registro, porId, esMovil, onExportar, onGuardar, onQuitar, guardando, nota, soloLectura = false, subtitulo = '', guardado = false }) {
  if (!registro) return null;
  const meta = PREMIOS[registro.tipo];
  // Ya está en el historial: acá queda sólo el aviso (las cartas se ven en HISTORIAL y ESPECIALES).
  if (guardado) {
    return (
      <div className="bento-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, letterSpacing: '.18em', color: 'var(--accent)' }}>{meta.sigla}</span>
        <span style={{ fontSize: 13, fontWeight: 900 }}>{meta.titulo}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>✓ Guardado. Está en HISTORIAL, en ESPECIALES y en los sobres (Modo GOD).</span>
      </div>
    );
  }
  const cartas = registro.cartas || cartasDeRegistro(registro, porId);
  const ancho = meta.especial ? (esMovil ? 176 : 224) : esMovil ? 138 : 168;

  return (
    <div className="bento-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, letterSpacing: '.18em', color: 'var(--accent)' }}>{meta.sigla}</span>
        <span style={{ fontSize: 15, fontWeight: 900 }}>{meta.titulo}</span>
        {subtitulo && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: MONO }}>{subtitulo}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => onExportar(registro)} className="btn-action" style={btnChico}>EXPORTAR PLACA</button>
          {!soloLectura && (
            <button onClick={onGuardar} disabled={guardando} className="btn-secondary" style={btnChico}>GUARDAR</button>
          )}
          {onQuitar && (
            <button onClick={onQuitar} className="btn-secondary" style={{ ...btnChico, color: '#ef4444', borderColor: 'rgba(239,68,68,.4)' }}>QUITAR</button>
          )}
        </span>
      </div>

      <div className="custom-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {cartas.map((c) => (meta.especial
          ? <CartaEspecial key={c.id} carta={c} tipo={registro.tipo} ancho={ancho} />
          : <CartaPremio key={c.id} carta={c} variante={meta.variante} sigla={meta.sigla} ancho={ancho} destacada={meta.quinteto && c.destacado} />
        ))}
      </div>

      {nota && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>{nota}</div>}
    </div>
  );
}

function Seccion({ titulo, detalle, derecha, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: 'var(--text-dim)' }}>{titulo}</div>
        {detalle && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: MONO }}>{detalle}</div>}
        {derecha && <div style={{ marginLeft: 'auto' }}>{derecha}</div>}
      </div>
      {children}
    </section>
  );
}

/* tipo|periodo de lo guardado con el mismo filtro (categoría y torneo) que se está mirando. */
function clavesGuardadas(historial, categoria, torneoId) {
  return new Set((historial || [])
    .filter((h) => (h.categoria || 'Todas') === categoria && (h.torneoId || 'Todos') === torneoId)
    .map((h) => `${h.tipo}|${h.periodo}`));
}

const Vacio = ({ texto }) => (
  <div className="bento-card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: '0.85rem' }}>{texto}</div>
);

export const btnChico = { padding: '8px 12px', borderRadius: 8, fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '.04em' };
const selectChico = { padding: '8px 10px', fontSize: '0.78rem', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, outline: 'none', fontWeight: 800, cursor: 'pointer' };
