import React, { useMemo, useState } from 'react';
import CartaPremio from './CartaPremio';
import { ModalPlacaPremio } from '../../placas/PlacaPremio';
import {
  premiosDelPartido, premiosDelMes, premioTemporada, ultimoPartido, mesesConPartidos,
  registrosDePartido, registrosDeMes, registroTemporada, registrosDefinitivos, mesCerrado,
} from '../../analytics/premios';
import {
  PREMIOS, etiquetaMes, fechaCorta, indicePorId, cartasDeRegistro, datosDePlaca,
} from '../../analytics/premiosCartas';
import { guardarRegistros } from '../../utils/cartasDestacadas';
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

export default function PanelPremios({ partidosJugados = [], jugadores = [], club, clubId, categoria = 'Todas', torneoId = 'Todos', esMovil }) {
  const [mesElegido, setMesElegido] = useState(null);
  const [placa, setPlaca] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const porId = useMemo(() => indicePorId(jugadores), [jugadores]);
  const meses = useMemo(() => mesesConPartidos(partidosJugados), [partidosJugados]);
  const mes = mesElegido && meses.includes(mesElegido) ? mesElegido : meses[meses.length - 1];

  const ultimo = useMemo(() => ultimoPartido(partidosJugados), [partidosJugados]);
  const delPartido = useMemo(() => (ultimo ? premiosDelPartido(ultimo) : null), [ultimo]);
  const delMes = useMemo(() => (mes ? premiosDelMes(partidosJugados, mes) : null), [partidosJugados, mes]);
  const temporada = useMemo(() => premioTemporada(partidosJugados), [partidosJugados]);

  const [potw, totw] = useMemo(() => registrosDePartido(delPartido), [delPartido]);
  const [potm, totm] = useMemo(() => registrosDeMes(delMes), [delMes]);
  const toty = useMemo(() => registroTemporada(temporada, partidosJugados), [temporada, partidosJugados]);

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
      if (sobrescribir) avisar('Guardado en el historial.');
      else if (escritas === 0) avisar(`Ya estaba todo guardado (${total} premios).`);
      else avisar(`Se guardaron ${escritas} premios nuevos en el historial${escritas < total ? ` (los otros ${total - escritas} ya estaban)` : ''}.`);
    } catch (err) {
      console.error('Guardar premios:', err);
      avisar(err?.message || 'No se pudo guardar el historial.', true);
    } finally {
      setGuardando(false);
    }
  };

  const congelar = () => guardar(registrosDefinitivos(partidosJugados, hoyISO()), { sobrescribir: false });
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
            <Premio registro={potw} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([potw], { sobrescribir: true })} guardando={guardando}
              nota={`${delPartido.potw.etiqueta} · nota ${delPartido.potw.nota.toFixed(1)}`} />
            <Premio registro={totw} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([totw], { sobrescribir: true })} guardando={guardando}
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
            <Premio registro={potm} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([potm], { sobrescribir: true })} guardando={guardando}
              nota={`Mejor nota promedio de ${delMes.potm.pj} ${delMes.potm.pj === 1 ? 'partido' : 'partidos'}.${mesAbierto ? ' El mes sigue en juego: puede cambiar.' : ''}`} />
            <Premio registro={totm} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([totm], { sobrescribir: true })} guardando={guardando}
              nota={delMes.totm.sinArquero ? 'Ningún arquero llegó al mínimo: el quinteto se armó con cinco de campo.' : 'Arquero y los cuatro mejores de campo del mes, entre los que llegaron al mínimo.'} />
          </>
        ) : <Vacio texto={mes ? `Ningún jugador llegó a jugar ${Math.floor(partidosJugados.filter((p) => String(p.fecha).startsWith(mes)).length / 2) + 1} partidos en ${etiquetaMes(mes)}.` : 'No hay meses con partidos.'} />}
      </Seccion>

      {/* ── TEMPORADA ── */}
      <Seccion titulo="TEMPORADA" detalle={temporada ? `${temporada.partidos} partidos · hay que haber jugado ${temporada.minimo} (65%)` : ''}>
        {toty ? (
          <Premio registro={toty} porId={porId} esMovil={esMovil} onExportar={exportar} onGuardar={() => guardar([toty], { sobrescribir: true })} guardando={guardando}
            nota="Mejor nota promedio entre los que jugaron al menos el 65% de los partidos. Se guarda a mano cuando termina la temporada." />
        ) : <Vacio texto="Todavía nadie llegó al 65% de los partidos." />}
      </Seccion>

      <ModalPlacaPremio datos={placa} onCerrar={() => setPlaca(null)} />
    </div>
  );
}

/* Un premio: título, las cartas y los botones. */
export function Premio({ registro, porId, esMovil, onExportar, onGuardar, onQuitar, guardando, nota, soloLectura = false, subtitulo = '' }) {
  if (!registro) return null;
  const meta = PREMIOS[registro.tipo];
  const cartas = registro.cartas || cartasDeRegistro(registro, porId);
  const ancho = esMovil ? 138 : 168;

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
        {cartas.map((c) => (
          <CartaPremio key={c.id} carta={c} variante={meta.variante} sigla={meta.sigla} ancho={ancho} destacada={meta.quinteto && c.destacado} />
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

const Vacio = ({ texto }) => (
  <div className="bento-card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)', fontSize: '0.85rem' }}>{texto}</div>
);

export const btnChico = { padding: '8px 12px', borderRadius: 8, fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', letterSpacing: '.04em' };
const selectChico = { padding: '8px 10px', fontSize: '0.78rem', background: 'var(--panel)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 6, outline: 'none', fontWeight: 800, cursor: 'pointer' };
