import { describe, it, expect } from 'vitest';
import { esAlineable, cajaDe, imantar } from '../../tactica/alineacion';

const CW = 800, CH = 400;
const OPTS = { cW: CW, cH: CH, umbral: 8 };
const cono = (id, x, y) => ({ id, type: 'cono', x, y, rotation: 0 });

describe('esAlineable', () => {
  it('materiales sí; jugadores, arqueros, pelota y texto no', () => {
    ['cono', 'cono_alto', 'cono_plato', 'valla', 'mini_arco', 'arco', 'zone-rect', 'zone-ellipse']
      .forEach((type) => expect(esAlineable({ type })).toBe(true));
    ['home', 'away', 'gk-ama', 'gk-vio', 'staff', 'ball', 'text']
      .forEach((type) => expect(esAlineable({ type })).toBe(false));
  });
});

describe('cajaDe', () => {
  it('la valla rotada 90° pasa a ser vertical', () => {
    const recta = cajaDe({ type: 'valla', x: 100, y: 100 }, CW);
    const girada = cajaDe({ type: 'valla', x: 100, y: 100, rotation: 90 }, CW);
    expect(recta.x2 - recta.x1).toBeGreaterThan(recta.y2 - recta.y1);
    expect(girada.y2 - girada.y1).toBeCloseTo(recta.x2 - recta.x1, 5);
  });
  it('la zona va de su esquina (x, y) a x+w, y+h', () => {
    const c = cajaDe({ type: 'zone-rect', x: 10, y: 20, w: 100, h: 50 }, CW);
    expect([c.x1, c.y1, c.x2, c.y2, c.cx, c.cy]).toEqual([10, 20, 110, 70, 60, 45]);
  });
});

describe('imantar', () => {
  it('cerca de la línea de otro cono, se pega y muestra la guía', () => {
    const r = imantar(cono('b', 305, 150), [cono('a', 100, 100)], OPTS);
    // y 100 está fuera del umbral (50 de distancia): no se toca; x tampoco tiene con qué alinear
    expect(r.y).toBe(150);
    const r2 = imantar(cono('b', 305, 104), [cono('a', 100, 100)], OPTS);
    expect(r2.y).toBe(100);
    expect(r2.guias.lineas.some((l) => l.y1 === l.y2)).toBe(true);
  });

  it('se pega al centro de la cancha', () => {
    const r = imantar(cono('b', CW / 2 + 5, 50), [], OPTS);
    expect(r.x).toBe(CW / 2);
    expect(r.guias.lineas[0].cancha).toBe(true);
  });

  it('jugadores y pelota no imantan ni sirven de referencia', () => {
    const jugador = { id: 'j', type: 'home', x: 100, y: 100 };
    expect(imantar(jugador, [cono('a', 102, 300)], OPTS).x).toBe(100);
    const r = imantar(cono('b', 300, 104), [jugador, { id: 'p', type: 'ball', x: 50, y: 100 }], OPTS);
    expect(r.y).toBe(104);
  });

  it('fila de conos: el tercero se pega a la misma distancia que los otros dos', () => {
    const a = cono('a', 100, 200), b = cono('b', 200, 200);
    // el tercero va a 300 para que los huecos sean iguales; lo soltamos en 305
    const r = imantar(cono('c', 305, 200), [a, b], OPTS);
    expect(r.x).toBeCloseTo(300, 5);
    expect(r.guias.huecos.length).toBe(2);
  });

  it('justo en el medio de dos', () => {
    const r = imantar(cono('c', 196, 200), [cono('a', 100, 200), cono('b', 300, 200)], OPTS);
    expect(r.x).toBeCloseTo(200, 5);
  });

  it('lejos de todo, queda donde se soltó y sin guías', () => {
    const r = imantar(cono('c', 123, 77), [cono('a', 300, 300)], OPTS);
    expect([r.x, r.y, r.guias]).toEqual([123, 77, null]);
  });
});

describe('prioridades', () => {
  it('un cono cerca de la fila se centra en la fila, no se pega borde con centro', () => {
    // a 8 de distancia vertical: el borde de arriba del que se mueve queda casi
    // en el centro del otro, pero lo esperado es centro con centro
    const r = imantar(cono('b', 300, 107), [cono('a', 100, 100)], { ...OPTS, umbral: 12 });
    expect(r.y).toBe(100);
  });
});
