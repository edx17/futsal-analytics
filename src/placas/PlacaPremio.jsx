import React from 'react';
import Marco from './Marco';
import ModalPlaca from './ModalPlaca';
import { Ceja } from './Piezas';
import CartaPremio from '../components/quinteto/CartaPremio';
import { PREMIOS } from '../analytics/premiosCartas';

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

/* El título tiene que entrar en UNA línea: `.pl-fg-n` corta con "…" y
   "JUGADOR DE LA TEMPORADA" en la historia llegaba a perder la mitad. Se baja
   el cuerpo hasta que entra en los 968 px útiles de la placa. */
export const tamanoTitulo = (titulo, base) => Math.min(base, Math.floor(968 / (Math.max(1, String(titulo).length) * 0.66)));

export default function PlacaPremio({ datos, formato }) {
  if (!datos?.cartas?.length) return null;
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
