export function generarGrid(eventos = [], cols = 8, rows = 4) {
  // Aseguramos que cols y rows sean números
  const C = parseInt(cols);
  const R = parseInt(rows);
  
  const grid = Array.from({ length: R }, () => Array(C).fill(0));

  eventos.forEach(ev => {
    if (ev.zona_x == null || ev.zona_y == null) return;

    // Clamping robusto: (n / 100) * total puede dar exactamente el total, lo limitamos a total - 1
    let c = Math.floor((ev.zona_x / 100) * C);
    let r = Math.floor((ev.zona_y / 100) * R);

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