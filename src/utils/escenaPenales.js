/* La escena renderizada de los penales (public/penales/): medidas y precarga. */

const BASE = '/penales/';
let promesa = null;

/** Las medidas de la escena (y precarga las imágenes). null si no están. */
export function cargarEscena() {
  promesa ??= fetch(`${BASE}penales.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((geo) => {
      if (!geo?.arquero) return null;
      const fuentes = ['fondo.webp', 'red.webp', 'pelota.webp'];
      for (const eq of geo.arquero.equipos) for (const a of Object.keys(geo.arquero.anims)) fuentes.push(`arquero_${eq}_${a}.webp`);
      fuentes.forEach((f) => { const i = new Image(); i.src = BASE + f; });
      return geo;
    })
    .catch(() => null);
  return promesa;
}
