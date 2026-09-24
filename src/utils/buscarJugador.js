/* Sin acentos ni mayúsculas: "gomez" encuentra a Gómez. */
const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/* Busca por nombre, apellido o apodo, en cualquier orden ("lucho perez" o
   "perez lucho"). Si se escribe sólo un número, busca también por dorsal. */
export function coincideBusqueda(j, texto) {
  const q = sinAcentos(texto);
  if (!q) return true;
  if (/^#?\d+$/.test(q)) return String(j.dorsal ?? '') === q.replace('#', '');
  const pajar = sinAcentos(`${j.nombre || ''} ${j.apellido || ''} ${j.apodo || ''}`);
  return q.split(/\s+/).every(p => pajar.includes(p));
}

