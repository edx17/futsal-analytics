/* Los accesos de la barra inferior de juegos: [icono, texto, ruta]. */
export function accesosJuegos({ kiosco = false, esSuper = false } = {}) {
  const p = (r) => (kiosco ? `/kiosco/${r}` : `/${r}`);
  if (esSuper && !kiosco) {
    return [['juegos', 'JUEGOS', p('juegos')], ['god', 'GOD', p('sobres')], ['mysquad', 'MYSQUAD', p('mysquad')], ['penales', 'PENALES', p('penales')]];
  }
  return [['juegos', 'JUEGOS', p('juegos')], ['sobres', 'SOBRES', p('sobres')], ['vdraft', 'V-DRAFT', p('vdraft')], ['penales', 'PENALES', p('penales')]];
}
