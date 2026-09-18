/* El puntaje con el color que le corresponde: es lo primero que se mira, y
 * tiene que significar lo mismo en la placa que en la pantalla. */
export const colorRating = (r) => {
  const v = Number(r);
  if (!Number.isFinite(v)) return 'var(--pl-tenue)';
  if (v >= 7.5) return 'var(--pl-club)';
  if (v >= 6) return 'var(--pl-oro)';
  return 'var(--pl-rival)';
};
