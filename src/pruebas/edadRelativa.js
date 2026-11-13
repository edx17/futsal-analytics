/* PRUEBAS · EDAD RELATIVA (no se guarda: se calcula con la fecha de nacimiento)
 *
 *   trimestre   en qué trimestre del año nació (Q1 ene-mar … Q4 oct-dic)
 *   edad        edad decimal a la fecha de la prueba (ej. 15.4)
 * Sirve para leer el efecto de la edad relativa: dentro de una misma
 * categoría, un Q1 tiene casi un año más de desarrollo que un Q4.
 */

const parsear = (f) => {
  if (!f) return null;
  if (f instanceof Date) return Number.isNaN(f.getTime()) ? null : f;
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

export function edadRelativa(fechaNacimiento, fechaPrueba = new Date()) {
  const nac = parsear(fechaNacimiento);
  const ref = parsear(fechaPrueba) || new Date();
  if (!nac) return null;
  const trimestre = Math.floor(nac.getMonth() / 3) + 1;
  const edad = Math.floor(((ref - nac) / (365.2425 * 24 * 3600 * 1000)) * 10) / 10;
  return { trimestre, etiqueta: `Q${trimestre}`, edad, texto: `Q${trimestre} · ${edad.toFixed(1)} años` };
}
