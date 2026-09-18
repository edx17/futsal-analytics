import React from 'react';
import Cancha from './Cancha';
import { aMetros } from './medidas';
import { Ceja, Pie } from './Piezas';
import { iniciales } from './club';
import { colorRating } from './rating';

/* PLACA DE JUGADOR (Y DE ARQUERO)
 *
 * Una sola placa para los dos, porque la diferencia real es qué filas de
 * estadística tienen sentido, no la maqueta: al arquero le importan atajadas,
 * goles evitados y vallas; al jugador de campo, goles, remates y duelos. Eso
 * lo decide la pantalla, que es la que sabe el rol; acá sólo se dibuja lo que
 * llega en `filas`.
 *
 * Reemplaza a PlayerReportGenerator y a PlayerReportIGStory, que eran dos
 * archivos distintos —uno cuadrado y otro 9:16— con dos exportadores propios
 * y dos maquetas que ya no se parecían entre sí.
 *
 * El mapa es la cancha completa a propósito: el arquero juega en su mitad y
 * el jugador de campo en la de enfrente, y con media cancha uno de los dos
 * quedaba vacío.
 */

const TIPOS = {
  gol:           { relleno: 'var(--pl-club)',  borde: 'var(--pl-club)',  r: 0.85, label: 'GOL' },
  remate:        { relleno: 'transparent',     borde: 'rgba(255,255,255,.55)', r: 0.5, label: 'REMATE' },
  asistencia:    { relleno: 'rgba(6,182,212,.35)', borde: '#06B6D4',     r: 0.62, label: 'ASISTENCIA' },
  recuperacion:  { relleno: 'rgba(var(--pl-club-rgb),.18)', borde: 'rgba(var(--pl-club-rgb),.75)', r: 0.45, label: 'RECUPERACIÓN' },
  perdida:       { relleno: 'transparent',     borde: 'rgba(var(--pl-rival-rgb),.7)', r: 0.42, label: 'PÉRDIDA' },
  atajada:       { relleno: 'rgba(var(--pl-club-rgb),.25)', borde: 'var(--pl-club)', r: 0.6, label: 'ATAJADA' },
  recibido:      { relleno: 'var(--pl-rival)', borde: 'var(--pl-rival)', r: 0.7, label: 'GOL RECIBIDO' },
};

export default function PlacaJugador({ datos, formato }) {
  if (!datos) return null;
  const { club = {}, jugador = {}, info = {}, rating, filas = [], acciones = [], ultimos = [] } = datos;
  const esStory = formato?.id === 'story';

  const conMapa = acciones.filter((a) => a.x != null && a.y != null && TIPOS[a.tipo]);
  const tiposUsados = [...new Set(conMapa.map((a) => a.tipo))];

  return (
    <>
      <div className="pl-aura" /><div className="pl-trama" />
      <div className="pl-cont" style={esStory ? { paddingTop: 120 } : undefined}>

        <Ceja
          izquierda={jugador.esArquero ? 'PERFIL DEL ARQUERO' : 'PERFIL DEL JUGADOR'}
          resaltado={info.contexto}
          derecha={info.categoria}
        />

        <div className="pl-j-top" style={{ marginTop: esStory ? 52 : 32 }}>
          <div style={{ display: 'flex', gap: 26, alignItems: 'center', minWidth: 0 }}>
            <div className="pl-j-foto" style={{
              width: esStory ? 168 : 142, height: esStory ? 200 : 170, flexShrink: 0,
            }}>
              {jugador.foto
                ? <img src={jugador.foto} alt="" crossOrigin="anonymous" />
                : <div className="ini" style={{ fontSize: esStory ? 82 : 68 }}>{iniciales(jugador.nombre)}</div>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="pl-j-nom" style={{ fontSize: esStory ? 78 : 62 }}>
                {String(jugador.nombre || 'JUGADOR').toUpperCase()}
              </div>
              <div className="pl-j-sub" style={{ fontSize: esStory ? 19 : 17 }}>
                {[jugador.dorsal ? `#${jugador.dorsal}` : null, jugador.rol, club.nombre].filter(Boolean).join(' · ').toUpperCase()}
              </div>
            </div>
          </div>

          {rating != null && (
            <div className="pl-j-rat" style={{ flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div className="v" style={{ fontSize: esStory ? 76 : 64, color: colorRating(rating) }}>{rating}</div>
              <div className="pl-mini">PUNTAJE</div>
            </div>
          )}
        </div>

        {conMapa.length > 0 && (
          <div className="pl-cancha" style={{ marginTop: esStory ? 46 : 26 }}>
            <Cancha style={{ width: esStory ? 900 : 820 }}>
              {conMapa.map((a, i) => {
                const { x, y } = aMetros(a.x, a.y);
                const t = TIPOS[a.tipo];
                return (
                  <circle key={i} cx={x} cy={y} r={t.r}
                          fill={t.relleno} stroke={t.borde} strokeWidth=".12" />
                );
              })}
            </Cancha>
            <div className="pin" style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
              {tiposUsados.map((k) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 13, height: 13, borderRadius: '50%',
                    background: TIPOS[k].relleno, border: `2px solid ${TIPOS[k].borde}`,
                  }} />
                  {TIPOS[k].label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* En la historia sobra alto: las filas van en una sola columna y se
            leen mejor. En el feed van en dos, o no entran. */}
        {filas.length > 0 && (
          <div className="pl-j-cols" style={{
            marginTop: esStory ? 34 : 20,
            gridTemplateColumns: esStory ? '1fr' : '1fr 1fr',
          }}>
            {filas.map((f) => (
              <div className="pl-j-row" key={f.l} style={esStory ? { padding: `${filas.length > 6 ? 15 : 22}px 0` } : { padding: '12px 0' }}>
                <div className="l" style={esStory ? undefined : { fontSize: 15 }}>{f.l}</div>
                <div className="v" style={{ ...(esStory ? null : { fontSize: 26 }), ...(f.color ? { color: f.color } : null) }}>{f.v}</div>
              </div>
            ))}
          </div>
        )}

        {ultimos.length > 0 && (
          <div style={{ marginTop: esStory ? 44 : 26 }}>
            <div className="pl-tira-t">SUS ÚLTIMOS {ultimos.length} PARTIDOS</div>
            <div className="pl-tira-g" style={{ gridTemplateColumns: `repeat(${ultimos.length}, 1fr)` }}>
              {ultimos.map((u, i) => (
                <div className="pl-tp" key={i}>
                  <div className="f">{u.fecha || '—'}</div>
                  <div className="r" style={{
                    background: u.rating != null ? colorRating(u.rating) : 'var(--pl-sup2)',
                    color: u.rating != null ? '#04120C' : 'var(--pl-tenue)',
                  }}>
                    {u.rating != null ? u.rating : '—'}
                  </div>
                  <div className="o">{String(u.rival || '').toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Pie club={club.nombre} detalle={info.categoria} esStory={esStory} />
      </div>
    </>
  );
}
