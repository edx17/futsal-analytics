import { describe, it, expect } from 'vitest';
import { RAREZAS, SOBRES, COSTO_SOBRE_PUNTOS, sortearSobre, probabilidades, catalogoDeCartas, rarezaDeCarta } from '../sobres';

const cat = [];
RAREZAS.forEach((r) => { for (let i = 0; i < 6; i += 1) cat.push({ id: `${r.id}${i}`, rareza: r.id }); });

/* Un azar con semilla, para que la prueba dé siempre lo mismo. */
const semilla = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

describe('reglas', () => {
  it('las probabilidades suman 100', () => {
    expect(RAREZAS.reduce((s, r) => s + r.peso, 0)).toBe(100);
  });
  it('cuanto más rara, menos probable y más puntos da', () => {
    for (let i = 1; i < RAREZAS.length; i += 1) {
      expect(RAREZAS[i].peso).toBeLessThan(RAREZAS[i - 1].peso);
      expect(RAREZAS[i].puntos).toBeGreaterThan(RAREZAS[i - 1].puntos);
    }
  });
  it('los sobres traen pocas cartas y el de la semana una más', () => {
    expect(SOBRES.diario.cartas).toBe(3);
    expect(SOBRES.racha.cartas).toBe(4);
    expect(COSTO_SOBRE_PUNTOS).toBe(50);
  });
});

describe('sortearSobre', () => {
  it('trae la cantidad pedida, sin repetir cartas en el mismo sobre', () => {
    for (let s = 1; s <= 200; s += 1) {
      const { cartas } = sortearSobre({ catalogo: cat, cantidad: 4, azar: semilla(s) });
      expect(cartas).toHaveLength(4);
      expect(new Set(cartas.map((c) => c.id)).size).toBe(4);
    }
  });

  it('una carta que ya tenés no se suma: da los puntos de su rareza', () => {
    const todas = new Set(cat.map((c) => c.id));
    const r = sortearSobre({ catalogo: cat, poseidas: todas, cantidad: 3, azar: semilla(7) });
    expect(r.cartas.every((c) => !c.nueva)).toBe(true);
    const esperado = r.cartas.reduce((s, c) => s + RAREZAS.find((x) => x.id === c.rareza).puntos, 0);
    expect(r.puntosGanados).toBe(esperado);
    expect(r.puntosGanados).toBeGreaterThan(0);
  });

  it('una carta nueva no da puntos', () => {
    const r = sortearSobre({ catalogo: cat, cantidad: 3, azar: semilla(3) });
    expect(r.cartas.every((c) => c.nueva && c.puntos === 0)).toBe(true);
    expect(r.puntosGanados).toBe(0);
  });

  it('la distribución se parece a la tabla', () => {
    const azar = semilla(42);
    const cuenta = {};
    const N = 20000;
    for (let i = 0; i < N; i += 1) {
      const { cartas } = sortearSobre({ catalogo: cat, cantidad: 1, azar });
      cuenta[cartas[0].rareza] = (cuenta[cartas[0].rareza] || 0) + 1;
    }
    RAREZAS.forEach((r) => {
      const pct = ((cuenta[r.id] || 0) / N) * 100;
      expect(Math.abs(pct - r.peso)).toBeLessThan(Math.max(1, r.peso * 0.25));
    });
  });

  it('si el club no tiene cartas de una rareza, las demás se reparten su lugar', () => {
    const sinToty = cat.filter((c) => c.rareza !== 'toty');
    const p = probabilidades(sinToty);
    expect(p.find((x) => x.id === 'toty')).toBeUndefined();
    expect(p.reduce((s, x) => s + x.porCiento, 0)).toBeCloseTo(100, 6);
    const { cartas } = sortearSobre({ catalogo: sinToty, cantidad: 4, azar: semilla(9) });
    expect(cartas.every((c) => c.rareza !== 'toty')).toBe(true);
  });

  it('con un catálogo chico trae las que haya, sin repetir', () => {
    const { cartas } = sortearSobre({ catalogo: cat.slice(0, 2), cantidad: 4, azar: semilla(1) });
    expect(cartas).toHaveLength(2);
  });

  it('un catálogo vacío no rompe', () => {
    expect(sortearSobre({ catalogo: [], cantidad: 3 }).cartas).toEqual([]);
  });
});

describe('catalogoDeCartas', () => {
  const base = [
    { id: '1', nombre: 'A', apellido: 'B', ovr: 80, tier: 'figura', rol: 'PIV', enEvaluacion: false, atributos: [], stats: {}, forma: [1, 2] },
    { id: '2', nombre: 'C', apellido: 'D', ovr: 55, tier: 'bronce', rol: 'ALA', enEvaluacion: false, atributos: [], stats: {} },
    { id: '3', nombre: 'E', apellido: 'F', ovr: 0, tier: 'evaluacion', rol: 'CIE', enEvaluacion: true, atributos: [], stats: {} },
  ];
  const premios = [{ ...base[0], clave: 'TOTY|2026|1', premio: 'TOTY', ovr: 91, tier: 'oro', edicion: 'TOTY 2026' }];

  it('una fila por carta base y por premio; las en evaluación no entran', () => {
    const filas = catalogoDeCartas(base, premios);
    expect(filas.map((f) => f.clave)).toEqual(['BASE|1', 'BASE|2', 'TOTY|2026|1']);
    expect(filas.map((f) => f.rareza)).toEqual(['oro', 'bronce', 'toty']);
  });
  it('la rareza de la base sale de la media, no de la etiqueta FIGURA', () => {
    expect(rarezaDeCarta(base[0])).toBe('oro');
    expect(rarezaDeCarta(base[1])).toBe('bronce');
  });
  it('la foto de la carta no lleva datos de más', () => {
    expect(catalogoDeCartas(base, [])[0].carta.forma).toBeUndefined();
  });
});
