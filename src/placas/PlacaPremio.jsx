import React from 'react';
import Marco from './Marco';
import ModalPlaca from './ModalPlaca';
import { Ceja } from './Piezas';
import CartaPremio from '../components/quinteto/CartaPremio';
import CartaEspecial from '../components/quinteto/CartaEspecial';
import { PREMIOS } from '../analytics/premiosCartas';
import { FAMILIAS, familiaDe } from '../analytics/especialesCartas';

/* PLACA DE PREMIOS DE MYSQUAD (POTW, TOTW, POTM, TOTM, TOTY)
 *
 * Una sola placa para los cinco, porque lo que cambia es el contenido:
 *   · jugador (POTW, POTM, TOTY): la carta grande, sola, de protagonista;
 *   · quinteto (TOTW, TOTM): cuatro de campo arriba y el arquero abajo, con una
 *     estrella en el jugador que dio nombre al premio.
 *
 * Las cartas son CartaPremio, que se arma con un SVG en línea y HTML encima
 * justamente para que el exportador a PNG (html2canvas) las dibuje bien: el
 * `clip-path` de la carta de la cancha no lo entiende.
 */

/* Cómo se reparten las cartas de un quinteto: cuatro de campo en una fila y el
   arquero solo abajo, más grande. Si falta el arquero (cinco de campo), dos
   filas parejas. */
export function filasDeQuinteto(cartas = [], esStory = false) {
  const arq = cartas.find((c) => c.rol === 'ARQ');
  const campo = cartas.filter((c) => c !== arq);
  if (arq && campo.length === 4) {
    return [{ cartas: campo, ancho: 226 }, { cartas: [arq], ancho: esStory ? 400 : 296 }];
  }
  const ancho = esStory ? 300 : 270;
  return [{ cartas: cartas.slice(0, 3), ancho }, { cartas: cartas.slice(3), ancho }].filter((f) => f.cartas.length);
}

/* Las cartas especiales: una sola, grande; empatadas, de a dos o tres; las series,
   en filas centradas como los anuncios de FUT (de cinco en el feed si son más de
   ocho, si no de cuatro; de cuatro en la historia). */
function filasEspeciales(cartas = [], esStory = false) {
  const n = cartas.length;
  if (n === 1) return [{ cartas, ancho: esStory ? 600 : 470 }];
  const porFila = n <= 3 ? n : esStory ? 4 : n > 8 ? 5 : 4;
  const ancho = n <= 3 ? (esStory ? 400 : 310) : esStory ? 232 : porFila === 5 ? 184 : 220;
  const filas = [];
  for (let i = 0; i < n; i += porFila) filas.push({ cartas: cartas.slice(i, i + porFila), ancho });
  return filas;
}

/* El título del póster: la palabra grande y la chica de arriba. */
const TITULO_POSTER = {
  SGOL: ['SERIE', 'GOLEADORES'], SREC: ['SERIE', 'RECUPERADORES'],
  GOLR: ['1ª RUEDA', 'GOLEADOR'], ASIR: ['1ª RUEDA', 'ASISTIDOR'], PRER: ['1ª RUEDA', 'PRESENCIA'], MVPR: ['1ª RUEDA', 'MVP'],
  GOLM: ['DEL MES', 'GOLEADOR'], ASIM: ['DEL MES', 'ASISTIDOR'], PREM: ['DEL MES', 'PRESENTE'],
};

/* EL PÓSTER DE LAS CARTAS ESPECIALES (estilo anuncio de FUT: TOTW, Hall of FUT)
   Fondo con la luz y los colores de la familia, el nombre de la serie enorme
   en dos tonos y la grilla de cartas centrada. Todo con degradés CSS y texto:
   se exporta igual a PNG. */
function PosterEspecial({ datos, formato }) {
  const { tipo, subtitulo, derecha, detalle, cartas, club = {} } = datos;
  const esStory = formato?.id === 'story';
  const fam = FAMILIAS[familiaDe(tipo)];
  const c = fam.colores;
  const [chico, grande] = TITULO_POSTER[tipo] || ['', datos.titulo];
  // Archivo 900 en mayúsculas: ~0,8 del cuerpo por letra; entra en los 960 px útiles.
  const tam = Math.min(esStory ? 170 : 150, Math.floor(960 / (Math.max(1, grande.length) * 0.8)));
  return (
    <>
      {/* fondo: la tinta de la familia, haces de luz cruzados y la palabra de marca de agua */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(170deg, ${c.fondo[0]} 0%, ${c.fondo[1]} 38%, ${c.fondo[2]} 100%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(70% 34% at 50% ${esStory ? 14 : 17}%, ${c.luz}55 0%, transparent 70%)` }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5,
        background: `repeating-linear-gradient(115deg, transparent 0px, transparent 90px, ${c.detalle}14 90px, ${c.detalle}14 150px, transparent 150px, transparent 260px)` }} />
      <div style={{ position: 'absolute', left: -60, right: -60, top: esStory ? 760 : 520, height: 6, transform: 'rotate(-8deg)', background: `linear-gradient(90deg, transparent, ${c.detalle}aa, transparent)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: esStory ? 230 : 120, textAlign: 'center', fontSize: esStory ? 330 : 260, fontWeight: 900,
        letterSpacing: '-0.04em', color: c.detalle, opacity: 0.07, lineHeight: 1, whiteSpace: 'nowrap' }}>{grande}</div>
      <Marco formato={formato}>
        <Ceja club={club.nombre} escudo={club.escudo} tamano={esStory ? 66 : 54} izquierda="MYSQUAD" resaltado="FUTSAL ULTIMATE" derecha={derecha} />
        <div style={{ textAlign: 'center', marginTop: esStory ? 60 : 22, lineHeight: 1 }}>
          <div style={{ fontSize: esStory ? 52 : 42, fontWeight: 800, letterSpacing: '0.28em', color: '#F4F1EA', textShadow: '0 4px 18px rgba(0,0,0,.6)' }}>{chico}</div>
          <div style={{ fontSize: tam, fontWeight: 900, letterSpacing: '-0.02em', color: c.media, marginTop: 6, textShadow: `0 6px 30px ${c.luz}66` }}>{grande}</div>
          <div style={{ display: 'inline-block', marginTop: 16, padding: '8px 22px', borderRadius: 6, background: c.cinta, color: c.cintaTexto,
            fontFamily: 'var(--pl-mono)', fontSize: esStory ? 24 : 21, fontWeight: 800, letterSpacing: '0.16em' }}>{subtitulo}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: esStory ? 28 : 16, marginTop: esStory ? 52 : 26 }}>
          {filasEspeciales(cartas, esStory).map((fila, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: esStory ? 16 : 12 }}>
              {fila.cartas.map((carta) => <CartaEspecial key={carta.id} carta={carta} tipo={tipo} ancho={fila.ancho} />)}
            </div>
          ))}
        </div>
        {detalle && (
          <div style={{ textAlign: 'center', marginTop: esStory ? 40 : 18, fontFamily: 'var(--pl-mono)', fontSize: 17, letterSpacing: '.08em', color: '#C9C4B8' }}>{detalle}</div>
        )}
      </Marco>
    </>
  );
}

/* El título tiene que entrar en UNA línea: `.pl-fg-n` corta con "…" y
   "JUGADOR DE LA TEMPORADA" en la historia llegaba a perder la mitad. Se baja
   el cuerpo hasta que entra en los 968 px útiles de la placa. */
export const tamanoTitulo = (titulo, base) => Math.min(base, Math.floor(968 / (Math.max(1, String(titulo).length) * 0.66)));

export default function PlacaPremio({ datos, formato }) {
  if (!datos?.cartas?.length) return null;
  if (datos.especial) return <PosterEspecial datos={datos} formato={formato} />;
  const { tipo, sigla, titulo, quinteto, subtitulo, derecha, detalle, cartas, club = {} } = datos;
  const esStory = formato?.id === 'story';
  const variante = PREMIOS[tipo]?.variante || 'potw';

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <Marco formato={formato}>

        <Ceja
          club={club.nombre} escudo={club.escudo} tamano={esStory ? 66 : 58}
          izquierda="MYSQUAD" resaltado={sigla}
          derecha={derecha}
        />

        <div style={{ textAlign: 'center', marginTop: esStory ? 56 : 30 }}>
          <div className="pl-fg-et">{sigla}</div>
          <div className="pl-fg-n" style={{ fontSize: tamanoTitulo(titulo, esStory ? 84 : 70), marginTop: 8 }}>{titulo}</div>
        </div>

        {quinteto ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: esStory ? 34 : 20, marginTop: esStory ? 56 : 28 }}>
            {filasDeQuinteto(cartas, esStory).map((fila, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
                {fila.cartas.map((c) => (
                  <CartaPremio key={c.id} carta={c} variante={variante} ancho={fila.ancho} destacada={c.destacado} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: esStory ? 56 : 28 }}>
            <CartaPremio carta={cartas[0]} variante={variante} sigla={sigla} pie={subtitulo} ancho={esStory ? 700 : 580} />
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: esStory ? 48 : 26 }}>
          {quinteto && <div className="pl-fg-res" style={{ justifyContent: 'center' }}>{subtitulo}</div>}
          {detalle && (
            <div style={{ marginTop: 12, fontFamily: 'var(--pl-mono)', fontSize: 17, letterSpacing: '.08em', color: 'var(--pl-dim)' }}>{detalle}</div>
          )}
          {quinteto && (
            <div style={{ marginTop: 12, fontFamily: 'var(--pl-mono)', fontSize: 17, letterSpacing: '.12em', color: 'var(--pl-dim)' }}>
              ★ {tipo === 'TOTW' ? 'JUGADOR DEL PARTIDO' : 'JUGADOR DEL MES'}
            </div>
          )}
        </div>

      </Marco>
    </>
  );
}

/* La ventana con la placa, lista para usar desde cualquier pantalla: se le pasa
   `datos` (ver datosDePlaca en premiosCartas.js) y la cierra con `onCerrar`. */
export function ModalPlacaPremio({ datos, onCerrar }) {
  const destacado = datos?.cartas?.find((c) => c.destacado) || datos?.cartas?.[0];
  return (
    <ModalPlaca abierto={!!datos} onCerrar={onCerrar}
      nombreArchivo={`${datos?.sigla || 'premio'}-${destacado?.apellido || datos?.subtitulo || ''}`}>
      {(formato) => <PlacaPremio datos={datos} formato={formato} />}
    </ModalPlaca>
  );
}
