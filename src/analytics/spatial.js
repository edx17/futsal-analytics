export function generarGrid(eventos = [], cols = 4, rows = 3) {
  // Aseguramos que cols y rows sean números
  const C = parseInt(cols);
  const R = parseInt(rows);
  
  const grid = Array.from({ length: R }, () => Array(C).fill(0));

  eventos.forEach(ev => {
    // Usamos las coordenadas normalizadas
    const x = ev.zona_x_norm !== undefined ? ev.zona_x_norm : ev.zona_x;
    const y = ev.zona_y_norm !== undefined ? ev.zona_y_norm : ev.zona_y;

    if (x == null || y == null) return;

    // Clamping robusto: (n / 100) * total puede dar exactamente el total, lo limitamos a total - 1
    let c = Math.floor((x / 100) * C);
    let r = Math.floor((y / 100) * R);

    // Forzamos límites físicos del array
    if (c >= C) c = C - 1;
    if (r >= R) r = R - 1;
    if (c < 0) c = 0;
    if (r < 0) r = 0;

    if (grid[r]) grid[r][c]++;
  });

  return grid;
}

export function mapaDiferencial(gridPropio, gridRival) {
  if (!gridPropio || !gridRival) return gridPropio || [];
  return gridPropio.map((row, r) =>
    row.map((v, c) => v - (gridRival?.[r]?.[c] || 0))
  );
}