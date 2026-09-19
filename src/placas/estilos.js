/* EL SISTEMA VISUAL DE LAS PLACAS
 *
 * NADA DE color-mix() ACÁ. El navegador lo entiende perfecto, pero html2canvas
 * —que es quien convierte la placa en PNG— tiene su propio lector de colores y
 * se corta con "unsupported color function". El color del club se pasa también
 * descompuesto en `--pl-club-rgb` ("0,230,118") para poder escribir
 * rgba(var(--pl-club-rgb),.26), que sí resuelve a un rgba() plano.
 *
 * Una sola hoja para todas. Antes cada placa traía sus colores escritos a
 * mano y ninguna se parecía a la otra.
 *
 * `--club` tiñe la placa entera: cambiándola, la placa se adapta al club.
 * Se inyecta una sola vez en el documento, como hace el creador táctico.
 */

export const CSS_PLACAS = `
/* LAS TIPOGRAFÍAS VAN CON LA APP, NO CON LA RED
 *
 * Las placas se diseñaron en Archivo y JetBrains Mono, pero nadie las cargaba:
 * la app sólo pide Outfit, Anton y Montserrat. El resultado era que cada
 * equipo dibujaba la placa con la tipografía que tuviera a mano, con métricas
 * distintas a las que se ajustó el diseño, y el contenido se pasaba de alto:
 * en la tabla se cortaba la última fila y en varias, el pie.
 *
 * Para una herramienta de publicación eso no puede depender del dispositivo ni
 * de que Google responda, así que los archivos viven en el repo. Son variables
 * —un archivo por familia cubre todos los pesos— y pesan 108 KB entre los
 * cuatro. El CSP ya permite font-src 'self'.
 */
@font-face{font-family:'Archivo';font-style:normal;font-weight:400 900;font-display:swap;
  src:url('/assets/fuentes/archivo-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF}
@font-face{font-family:'Archivo';font-style:normal;font-weight:400 900;font-display:swap;
  src:url('/assets/fuentes/archivo-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 800;font-display:swap;
  src:url('/assets/fuentes/jetbrains-mono-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 800;font-display:swap;
  src:url('/assets/fuentes/jetbrains-mono-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD}

.pl{position:relative;overflow:hidden;background:var(--pl-ink);color:var(--pl-tx);
  font-family:'Archivo',system-ui,-apple-system,sans-serif;
  --pl-ink:#070A09;--pl-sup:#0E1512;--pl-sup2:#141D19;--pl-linea:#1E2B25;
  --pl-tx:#F3F7F5;--pl-dim:#7D8F87;--pl-tenue:#4A5C54;--pl-oro:#FFC53D;
  --pl-mono:'JetBrains Mono',ui-monospace,monospace}
.pl *{box-sizing:border-box;margin:0;padding:0}

.pl-aura{position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(120% 60% at 50% -10%, rgba(var(--pl-club-rgb),.26) 0%,transparent 62%),
  radial-gradient(90% 50% at 100% 105%, rgba(var(--pl-club-rgb),.12) 0%,transparent 60%)}
.pl-trama{position:absolute;inset:0;pointer-events:none;opacity:.55;
  background-image:linear-gradient(var(--pl-linea) 1px,transparent 1px),linear-gradient(90deg,var(--pl-linea) 1px,transparent 1px);
  background-size:54px 54px;-webkit-mask-image:radial-gradient(70% 60% at 50% 40%,#000 0%,transparent 100%);
  mask-image:radial-gradient(70% 60% at 50% 40%,#000 0%,transparent 100%)}
.pl-cont{position:relative;height:100%;display:flex;flex-direction:column;padding:56px 56px 0}

.pl-ceja{font-family:var(--pl-mono);font-size:17px;font-weight:700;letter-spacing:.15em;color:var(--pl-dim);
  display:flex;justify-content:space-between;align-items:center;gap:16px;flex-shrink:0}
/* Una sola línea: si el torneo tiene nombre largo, se corta. Al envolver
   empujaba todo para abajo y la placa se pasaba de alto. */
.pl-ceja span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ceja > span:last-child{text-align:right}
/* Con escudo, la ceja deja de ser una línea de texto y pasa a ser una cabecera. */
.pl-ceja-esc{display:flex;align-items:center;gap:18px;min-width:0}

/* El escudo del club. El tamaño lo pone quien lo usa: es el mismo círculo en la
 * cabecera de una placa que al lado del nombre en otra. Sin escudo cargado caen
 * las iniciales, que también identifican al club. */
.pl-escudo{border-radius:50%;display:grid;place-items:center;overflow:hidden;flex-shrink:0;
  background:rgba(var(--pl-club-rgb),.12);border:2px solid var(--pl-club);color:var(--pl-club);
  font-family:'Archivo',sans-serif;font-weight:900;letter-spacing:-.02em}
.pl-escudo img{width:100%;height:100%;object-fit:cover}
.pl-ceja b{color:var(--pl-club);font-weight:800}

/* marcador */
.pl-marcador{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:26px}
.pl-eq{display:flex;flex-direction:column;align-items:center;gap:16px}
.pl-esc{width:132px;height:132px;border-radius:50%;display:grid;place-items:center;overflow:hidden;
  font-weight:900;font-size:44px;border:3px solid;flex-shrink:0}
.pl-esc img{width:100%;height:100%;object-fit:cover}
.pl-esc-l{background:rgba(var(--pl-club-rgb),.14);border-color:var(--pl-club);color:var(--pl-club)}
.pl-esc-v{background:rgba(255,77,94,.10);border-color:var(--pl-rival);color:var(--pl-rival)}
.pl-nomeq{font-size:30px;font-weight:800;letter-spacing:-.01em;text-align:center;line-height:1.1;max-width:300px}
.pl-cifras{display:flex;align-items:center;gap:22px;font-weight:900;font-size:150px;line-height:.82;letter-spacing:-.05em}
.pl-gl{color:var(--pl-club)}.pl-gv{color:var(--pl-rival)}
.pl-guion{width:44px;height:8px;background:var(--pl-tenue);border-radius:4px}
.pl-et{font-family:var(--pl-mono);font-size:17px;letter-spacing:.2em;color:var(--pl-dim);text-align:center;margin-top:20px}

/* barras divergentes desde el centro */
.pl-comp{display:flex;flex-direction:column;gap:20px}
.pl-fila{display:grid;grid-template-columns:96px 1fr 96px;align-items:center;gap:20px}
.pl-vL,.pl-vV{font-family:var(--pl-mono);font-weight:800;font-size:33px;font-variant-numeric:tabular-nums}
.pl-vL{color:var(--pl-club);text-align:right}.pl-vV{color:var(--pl-rival);text-align:left}
.pl-pista{position:relative;height:56px}
.pl-etq{position:absolute;top:0;left:0;right:0;text-align:center;font-family:var(--pl-mono);font-size:16px;
  font-weight:700;letter-spacing:.16em;color:var(--pl-dim)}
.pl-mitad{position:absolute;top:30px;height:22px;background:var(--pl-sup2);border-radius:4px}
.pl-mL{left:0;right:50.5%}.pl-mV{left:50.5%;right:0}
.pl-bL,.pl-bV{position:absolute;top:30px;height:22px;border-radius:4px}
.pl-bL{right:50.5%;background:linear-gradient(90deg,rgba(var(--pl-club-rgb),.42),var(--pl-club))}
.pl-bV{left:50.5%;background:linear-gradient(90deg,var(--pl-rival),rgba(var(--pl-rival-rgb),.42))}

/* bloque de datos propios: no es una comparación */
.pl-propio{background:linear-gradient(135deg,var(--pl-sup) 0%,transparent 90%);
  border:1px solid var(--pl-linea);border-left:4px solid var(--pl-club);border-radius:12px;padding:26px 30px}
.pl-propio-t{font-family:var(--pl-mono);font-size:16px;font-weight:800;letter-spacing:.2em;color:var(--pl-club);margin-bottom:20px}
.pl-propio-g{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.pl-pd{text-align:center}
.pl-pd .n{font-weight:900;font-size:56px;line-height:1;letter-spacing:-.03em}
.pl-pd .l{font-family:var(--pl-mono);font-size:14px;letter-spacing:.14em;color:var(--pl-dim);margin-top:8px}

/* figura y goles */
.pl-mini{font-family:var(--pl-mono);font-size:14px;letter-spacing:.2em;color:var(--pl-dim)}
.pl-caja{background:var(--pl-sup);border:1px solid var(--pl-linea);border-radius:12px;padding:24px 26px;position:relative;overflow:hidden}
.pl-mvp::after{content:'';position:absolute;right:-40px;top:-40px;width:170px;height:170px;border-radius:50%;
  background:radial-gradient(circle,rgba(var(--pl-club-rgb),.22),transparent 70%)}
.pl-mvp-n{font-size:42px;font-weight:900;letter-spacing:-.02em;margin:6px 0 2px}
.pl-chip{display:inline-flex;align-items:center;background:var(--pl-club);color:#04120C;
  font-family:var(--pl-mono);font-weight:800;font-size:34px;padding:5px 16px;border-radius:8px;margin-top:10px}
.pl-mvp-d{display:flex;gap:22px;margin-top:18px;flex-wrap:wrap}
.pl-mvp-d div{font-family:var(--pl-mono);font-size:13px;letter-spacing:.1em;color:var(--pl-dim)}
.pl-mvp-d b{display:block;font-size:30px;color:var(--pl-tx);font-weight:800;font-family:'Archivo',sans-serif}
/* El gap evita que un apellido largo se pegue al minuto, que es lo que pasaba
   con "FERNÁNDEZ MARTÍNEZ". El nombre se corta antes de empujar. */
.pl-gr{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:11px 0;
  border-bottom:1px solid var(--pl-linea);font-size:26px;font-weight:800;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pl-gr span{flex-shrink:0}
.pl-gr:last-child{border:0}
.pl-gr span{font-family:var(--pl-mono);font-size:20px;color:var(--pl-club);font-weight:700}

/* EL PIE VA ANCLADO ABAJO, NO EMPUJADO POR EL CONTENIDO
 *
 * Con "margin-top:auto" el pie era el último ítem del flex: si el contenido se
 * pasaba de alto —y se pasaba, porque la tipografía real mide distinto que la
 * de respaldo— lo empujaba fuera del lienzo y la placa salía sin la marca ni
 * el nombre del club. Anclado abajo eso no puede pasar: lo que sobra se
 * recorta arriba, donde se ve, y no en la firma. */
.pl-pie{position:absolute;left:56px;right:56px;bottom:0;height:var(--pl-alto-pie);
  border-top:1px solid var(--pl-linea);
  display:flex;align-items:center;justify-content:center;gap:22px}
.pl-pie .m{font-weight:900;font-size:26px;letter-spacing:-.01em}
.pl-pie .m i{color:var(--pl-club);font-style:normal}
.pl-pie .sep{width:1px;height:26px;background:var(--pl-linea)}
.pl-pie .cat{font-family:var(--pl-mono);font-size:17px;letter-spacing:.1em;color:var(--pl-dim)}
/* ── titular grande: un número que es el mensaje ── */
.pl-hero{text-align:center}
.pl-hero .k{font-weight:900;line-height:.82;letter-spacing:-.06em;color:var(--pl-club)}
.pl-hero .k small{color:var(--pl-tenue);letter-spacing:-.03em}
.pl-hero .t{font-family:var(--pl-mono);font-weight:700;letter-spacing:.2em;margin-top:18px}
.pl-rec{display:flex;justify-content:center;gap:16px;margin-top:22px}
.pl-rec>div{background:var(--pl-sup);border:1px solid var(--pl-linea);border-radius:10px;padding:14px 26px;text-align:center}
.pl-rec b{display:block;font-weight:900;font-size:44px;line-height:1}
.pl-rec span{font-family:var(--pl-mono);font-size:13px;letter-spacing:.16em;color:var(--pl-dim)}

/* ── lista de estados con barra ── */
.pl-lista{display:grid;grid-template-columns:1fr 1fr;gap:12px 32px}
.pl-li{display:grid;grid-template-columns:1fr 56px;align-items:center;gap:8px}
.pl-li .lb{font-family:var(--pl-mono);font-size:15px;font-weight:700;letter-spacing:.08em}
.pl-li .vv{font-family:var(--pl-mono);font-weight:800;font-size:23px;text-align:right;font-variant-numeric:tabular-nums}
.pl-li .pista{grid-column:1/-1;height:8px;background:var(--pl-sup2);border-radius:4px;overflow:hidden;margin-top:-4px}
.pl-li .fill{height:100%;border-radius:4px}

/* ── cancha embebida ── */
.pl-cancha{position:relative;background:#080D0B;border:1px solid var(--pl-linea);
  border-radius:14px;padding:14px 14px 38px;display:grid;place-items:center}
.pl-cancha svg{width:auto;max-width:100%}
.pl-cancha .pin{position:absolute;left:18px;bottom:12px;font-family:var(--pl-mono);
  font-size:13px;letter-spacing:.14em;color:var(--pl-dim)}

/* ── ranking en el torneo ── */
.pl-liga{background:var(--pl-sup);border:1px solid var(--pl-linea);border-radius:12px;padding:20px 26px}
.pl-liga-t{font-family:var(--pl-mono);font-size:15px;letter-spacing:.2em;color:var(--pl-dim);margin-bottom:16px}
.pl-liga-g{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.pl-lg{text-align:center}
.pl-lg .n{font-weight:900;font-size:40px;line-height:1}
.pl-lg .p{display:inline-block;font-family:var(--pl-mono);font-weight:800;font-size:15px;color:var(--pl-oro);
  border:1px solid rgba(255,197,61,.45);border-radius:20px;padding:3px 11px;margin-top:8px}
.pl-lg .l{font-family:var(--pl-mono);font-size:12px;letter-spacing:.12em;color:var(--pl-dim);margin-top:8px}

/* ── tabla de posiciones ── */
.pl-tb-cab{display:grid;grid-template-columns:54px 1fr 54px 54px 54px 54px 68px 72px;gap:0 8px;align-items:center;
  font-family:var(--pl-mono);font-size:15px;font-weight:700;letter-spacing:.14em;color:var(--pl-dim);padding:0 18px 14px}
.pl-tb-cab span:not(:nth-child(2)){text-align:center}
.pl-tb-f{display:grid;grid-template-columns:54px 1fr 54px 54px 54px 54px 68px 72px;gap:0 8px;align-items:center;
  background:var(--pl-sup);border:1px solid var(--pl-linea);border-radius:9px;padding:13px 18px;margin-bottom:8px}
.pl-tb-f.mio{background:linear-gradient(90deg,rgba(var(--pl-club-rgb),.22),rgba(var(--pl-club-rgb),.06));border-color:var(--pl-club)}
.pl-tb-f .ps{font-family:var(--pl-mono);font-weight:800;font-size:24px;color:var(--pl-dim);text-align:center}
.pl-tb-f.mio .ps{color:var(--pl-club)}
.pl-tb-f .eqn{font-size:29px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:14px;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pl-tb-f .ec{width:34px;height:34px;border-radius:50%;background:var(--pl-sup2);border:2px solid var(--pl-linea);
  display:grid;place-items:center;font-family:var(--pl-mono);font-size:13px;font-weight:800;color:var(--pl-dim);
  flex-shrink:0;overflow:hidden}
.pl-tb-f .ec img{width:100%;height:100%;object-fit:cover}
.pl-tb-f.mio .ec{border-color:var(--pl-club);color:var(--pl-club)}
.pl-tb-f .c{font-family:var(--pl-mono);font-size:23px;text-align:center;color:var(--pl-dim);font-variant-numeric:tabular-nums}
.pl-tb-f .dg{font-family:var(--pl-mono);font-size:23px;text-align:center;font-variant-numeric:tabular-nums}
.pl-tb-f .pt{font-family:var(--pl-mono);font-weight:800;font-size:29px;text-align:center;font-variant-numeric:tabular-nums}
.pl-tb-f.mio .pt{color:var(--pl-club)}
.pl-zona{display:flex;align-items:center;gap:14px;margin:18px 0 10px;
  font-family:var(--pl-mono);font-size:14px;letter-spacing:.18em;color:var(--pl-tenue)}
.pl-zona i{flex:1;height:1px;background:var(--pl-linea);font-style:normal}

/* ── campaña ── */
.pl-cp{display:flex;flex-direction:column;gap:14px}
.pl-cp-f{display:grid;grid-template-columns:64px 1fr 126px 172px;align-items:center;gap:18px;
  background:var(--pl-sup);border:1px solid var(--pl-linea);border-radius:10px;padding:16px 22px}
.pl-cp-f .ec{width:52px;height:52px;border-radius:50%;background:var(--pl-sup2);border:2px solid var(--pl-linea);
  display:grid;place-items:center;font-family:var(--pl-mono);font-size:16px;font-weight:800;color:var(--pl-dim);overflow:hidden}
.pl-cp-f .ec img{width:100%;height:100%;object-fit:cover}
.pl-cp-f .nm{font-size:31px;font-weight:800;letter-spacing:-.01em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pl-cp-f .mk{font-family:var(--pl-mono);font-weight:800;font-size:31px;text-align:center;font-variant-numeric:tabular-nums}
.pl-cp-f .rs{font-weight:900;font-size:24px;letter-spacing:-.01em;text-align:center;
  border-radius:8px;padding:10px 0;color:#04120C;white-space:nowrap}
.pl-rV{background:var(--pl-club)}.pl-rE{background:var(--pl-oro)}.pl-rD{background:var(--pl-rival);color:#fff}

/* ── jugador ── */
.pl-j-top{display:grid;grid-template-columns:1fr auto;align-items:start;gap:20px}
.pl-j-nom{font-size:74px;font-weight:900;letter-spacing:-.035em;line-height:.95}
.pl-j-sub{font-family:var(--pl-mono);font-size:19px;letter-spacing:.2em;color:var(--pl-dim);margin-top:12px}
.pl-j-rat{display:flex;align-items:center;gap:14px}
.pl-j-rat .cua{width:26px;height:26px;border-radius:5px;background:var(--pl-club)}
.pl-j-rat .v{font-family:var(--pl-mono);font-weight:800;font-size:62px;letter-spacing:-.03em}
.pl-j-media{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.pl-j-foto{border-radius:14px;overflow:hidden;position:relative;background:var(--pl-sup2);display:grid;place-items:center}
.pl-j-foto img{width:100%;height:100%;object-fit:cover}
.pl-j-foto .ini{font-size:190px;font-weight:900;color:rgba(var(--pl-club-rgb),.26);letter-spacing:-.05em}
.pl-j-foto .pin{position:absolute;left:20px;bottom:18px;font-family:var(--pl-mono);font-size:15px;letter-spacing:.16em;color:var(--pl-dim)}
.pl-j-cols{display:grid;grid-template-columns:1fr 1fr;gap:0 40px}
.pl-j-row{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--pl-linea)}
.pl-j-row .l{font-family:var(--pl-mono);font-size:17px;letter-spacing:.13em;color:var(--pl-dim)}
.pl-j-row .v{font-family:var(--pl-mono);font-weight:800;font-size:30px;font-variant-numeric:tabular-nums}
.pl-tira-t{font-family:var(--pl-mono);font-size:15px;letter-spacing:.2em;color:var(--pl-dim);
  padding-bottom:14px;border-bottom:1px solid var(--pl-linea);margin-bottom:20px}
.pl-tira-g{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
.pl-tp{text-align:center}
.pl-tp .f{font-family:var(--pl-mono);font-size:13px;color:var(--pl-tenue);letter-spacing:.06em}
.pl-tp .r{font-family:var(--pl-mono);font-weight:800;font-size:27px;padding:9px 0;border-radius:8px;margin-top:9px;color:#04120C}
.pl-tp .o{font-family:var(--pl-mono);font-size:13px;color:var(--pl-dim);margin-top:8px;letter-spacing:.08em;
  overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
`;


let inyectado = false;
export function asegurarEstilos() {
  if (inyectado || typeof document === 'undefined') return;
  if (document.getElementById('estilos-placas')) { inyectado = true; return; }
  const s = document.createElement('style');
  s.id = 'estilos-placas';
  s.textContent = CSS_PLACAS;
  document.head.appendChild(s);
  inyectado = true;
}

/* Color del club. Más adelante puede salir del escudo; por ahora es el verde
 * de la marca, que además es el del escudo de Libertadores. */
/* html2canvas no lee color-mix(), así que el color se pasa también como
 * componentes para poder armar rgba() planos. */
export function aRGB(hex) {
  let c = String(hex || '').trim().replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  if (!/^[0-9a-f]{6}$/i.test(c)) return '0,230,118';
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',');
}

export const COLOR_CLUB = '#00E676';
export const COLOR_RIVAL = '#FF4D5E';
