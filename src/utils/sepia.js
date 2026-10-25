/** Pasa píxeles RGBA (ImageData.data) a sepia, con un poco más de contraste: foto antigua. La transparencia no se toca. */
export function aSepia(px) {
  for (let i = 0; i < px.length; i += 4) {
    const gris = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = Math.min(255, Math.max(0, (gris - 128) * 1.12 + 128));
    px[i] = Math.min(255, v * 1.07 + 18);
    px[i + 1] = Math.min(255, v * 0.9 + 8);
    px[i + 2] = Math.min(255, v * 0.68);
  }
  return px;
}
