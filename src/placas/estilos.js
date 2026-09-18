/* EL SISTEMA VISUAL DE LAS PLACAS
 *
 * Una sola hoja para todas. Antes cada placa traía sus colores escritos a
 * mano y ninguna se parecía a la otra.
 *
 * `--club` tiñe la placa entera: cambiándola, la placa se adapta al club.
 * Se inyecta una sola vez en el documento, como hace el creador táctico.
 */

export const CSS_PLACAS = `
.pl{position:relative;overflow:hidden;background:var(--pl-ink);color:var(--pl-tx);
  font-family:'Archivo',system-ui,-apple-system,sans-serif;
  --pl-ink:#070A09;--pl-sup:#0E1512;--pl-sup2:#141D19;--pl-linea:#1E2B25;
  --pl-tx:#F3F7F5;--pl-dim:#7D8F87;--pl-tenue:#4A5C54;--pl-oro:#FFC53D;
  --pl-mono:'JetBrains Mono',ui-monospace,monospace}
.pl *{box-sizing:border-box;margin:0;padding:0}

.pl-aura{position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(120% 60% at 50% -10%, color-mix(in srgb,var(--pl-club) 26%,transparent) 0%,transparent 62%),
  radial-gradient(90% 50% at 100% 105%, color-mix(in srgb,var(--pl-club) 12%,transparent) 0%,transparent 60%)}
.pl-trama{position:absolute;inset:0;pointer-events:none;opacity:.55;
  background-image:linear-gradient(var(--pl-linea) 1px,transparent 1px),linear-gradient(90deg,var(--pl-linea) 1px,transparent 1px);
  background-size:54px 54px;-webkit-mask-image:radial-gradient(70% 60% at 50% 40%,#000 0%,transparent 100%);
  mask-image:radial-gradient(70% 60% at 50% 40%,#000 0%,transparent 100%)}
.pl-cont{position:relative;height:100%;display:flex;flex-direction:column;padding:56px 56px 0}

.pl-ceja{font-family:var(--pl-mono);font-size:19px;font-weight:700;letter-spacing:.22em;color:var(--pl-dim);
  display:flex;justify-content:space-between;align-items:center;gap:16px}
.pl-ceja b{color:var(--pl-club);font-weight:800}

/* marcador */
.pl-marcador{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:26px}
.pl-eq{display:flex;flex-direction:column;align-items:center;gap:16px}
.pl-esc{width:132px;height:132px;border-radius:50%;display:grid;place-items:center;overflow:hidden;
  font-weight:900;font-size:44px;border:3px solid;flex-shrink:0}
.pl-esc img{width:100%;height:100%;object-fit:cover}
.pl-esc-l{background:color-mix(in srgb,var(--pl-club) 14%,transparent);border-color:var(--pl-club);color:var(--pl-club)}
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
.pl-bL{right:50.5%;background:linear-gradient(90deg,color-mix(in srgb,var(--pl-club) 42%,transparent),var(--pl-club))}
.pl-bV{left:50.5%;background:linear-gradient(90deg,var(--pl-rival),color-mix(in srgb,var(--pl-rival) 42%,transparent))}

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
  background:radial-gradient(circle,color-mix(in srgb,var(--pl-club) 22%,transparent),transparent 70%)}
.pl-mvp-n{font-size:42px;font-weight:900;letter-spacing:-.02em;margin:6px 0 2px}
.pl-chip{display:inline-flex;align-items:center;background:var(--pl-club);color:#04120C;
  font-family:var(--pl-mono);font-weight:800;font-size:34px;padding:5px 16px;border-radius:8px;margin-top:10px}
.pl-mvp-d{display:flex;gap:22px;margin-top:18px;flex-wrap:wrap}
.pl-mvp-d div{font-family:var(--pl-mono);font-size:13px;letter-spacing:.1em;color:var(--pl-dim)}
.pl-mvp-d b{display:block;font-size:30px;color:var(--pl-tx);font-weight:800;font-family:'Archivo',sans-serif}
.pl-gr{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;
  border-bottom:1px solid var(--pl-linea);font-size:26px;font-weight:800}
.pl-gr:last-child{border:0}
.pl-gr span{font-family:var(--pl-mono);font-size:20px;color:var(--pl-club);font-weight:700}

/* pie */
.pl-pie{margin-top:auto;border-top:1px solid var(--pl-linea);padding:26px 0 30px;
  display:flex;align-items:center;justify-content:center;gap:24px}
.pl-pie .m{font-weight:900;font-size:26px;letter-spacing:-.01em}
.pl-pie .m i{color:var(--pl-club);font-style:normal}
.pl-pie .sep{width:1px;height:26px;background:var(--pl-linea)}
.pl-pie .cat{font-family:var(--pl-mono);font-size:16px;letter-spacing:.18em;color:var(--pl-dim)}
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
export const COLOR_CLUB = '#00E676';
export const COLOR_RIVAL = '#FF4D5E';
