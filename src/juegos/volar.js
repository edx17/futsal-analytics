/* UNA CARTA QUE VUELA A SU LUGAR
 *
 * Copia el elemento de origen (la carta que tocaste) en una capa fija y la
 * lleva hasta el destino (el lugar vacío de la cancha o del banco), achicándose
 * hasta su tamaño. Devuelve una promesa que se cumple al aterrizar con la
 * función que saca la copia: la copia queda en el lugar hasta que llega la
 * carta de verdad (la respuesta de la base), así el lugar no queda vacío.
 * Sin destino, sin `animate` o con "reducir movimiento", se cumple enseguida.
 */
const nada = () => {};

export function volarCarta(origen, destino, ms = 560) {
  const quieto = typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!origen || !destino || quieto || typeof origen.animate !== 'function') return Promise.resolve(nada);
  const a = origen.getBoundingClientRect();
  const b = destino.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve(nada);

  const copia = origen.cloneNode(true);
  Object.assign(copia.style, {
    position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: '0', zIndex: '1200', pointerEvents: 'none', transformOrigin: '0 0',
  });
  copia.setAttribute('aria-hidden', 'true');
  document.body.appendChild(copia);

  const escala = Math.min(b.width / a.width, b.height / a.height);
  const dx = b.left + (b.width - a.width * escala) / 2 - a.left;
  const dy = b.top + (b.height - a.height * escala) / 2 - a.top;
  const vuelo = copia.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', filter: 'drop-shadow(0 0 18px rgba(0,255,136,.8))' },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(${(1 + escala) / 2}) rotate(-6deg)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${escala}) rotate(0deg)`, filter: 'drop-shadow(0 0 4px rgba(0,255,136,.4))' },
  ], { duration: ms, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });

  return vuelo.finished.catch(nada).then(() => () => copia.remove());
}
