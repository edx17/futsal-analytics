import { describe, it, expect } from 'vitest';
import {
  puntoDelArco, destinoDeLaPelota, paradaDelArquero, equipoDelArquero, posicionDelCuadro, cuadroEn,
  cajaDelArquero, pelotaEnVuelo, destinoAtajada,
} from '../penales3d';

const geo = {
  ancho: 960, alto: 720, pelota_en_arco: 18,
  arco: { arriba_izq: [232, 187], arriba_der: [728, 187], abajo_izq: [235, 515], abajo_der: [725, 515] },
  red_fondo: { arriba_izq: [260, 261], arriba_der: [700, 261], abajo_izq: [268, 490], abajo_der: [692, 490] },
  arquero: { x: 300, y: 150, w: 200, h: 380 },
};

describe('penales 3d: la pelota', () => {
  it('las esquinas del plano del arco caen en las esquinas de la imagen', () => {
    expect(puntoDelArco(geo, 0, 0)).toEqual([232, 187]);
    expect(puntoDelArco(geo, 1, 1)).toEqual([725, 515]);
  });

  it('cada cuadrante cae adentro del arco, de izquierda a derecha y de arriba a abajo', () => {
    const p = Array.from({ length: 9 }, (_, i) => destinoDeLaPelota(geo, i, 'gol'));
    p.forEach(([x, y]) => { expect(x).toBeGreaterThan(232); expect(x).toBeLessThan(728); expect(y).toBeGreaterThan(187); expect(y).toBeLessThan(515); });
    expect(p[0][0]).toBeLessThan(p[1][0]); expect(p[1][0]).toBeLessThan(p[2][0]);
    expect(p[0][1]).toBeLessThan(p[3][1]); expect(p[3][1]).toBeLessThan(p[6][1]);
  });

  it('al palo va al palo de ese lado; afuera, fuera del arco', () => {
    expect(Math.abs(destinoDeLaPelota(geo, 0, 'palo')[0] - 232)).toBeLessThan(2);
    expect(Math.abs(destinoDeLaPelota(geo, 8, 'palo')[0] - 725)).toBeLessThan(2);
    expect(destinoDeLaPelota(geo, 4, 'afuera')[1]).toBeLessThan(187);   // por arriba
    expect(destinoDeLaPelota(geo, 6, 'afuera')[0]).toBeLessThan(232);   // por el costado
    expect(destinoDeLaPelota(geo, 8, 'afuera')[0]).toBeGreaterThan(725);
  });

  it('vuela desde abajo, grande, y llega al destino del tamaño del arco', () => {
    const d = [400, 300];
    const ini = pelotaEnVuelo(geo, d, 0);
    const fin = pelotaEnVuelo(geo, d, 1);
    expect(ini.y).toBeGreaterThan(720);
    expect(ini.r).toBeGreaterThan(fin.r);
    expect(fin.x).toBeCloseTo(400); expect(fin.y).toBeCloseTo(300); expect(fin.r).toBeCloseTo(18);
  });
});

describe('penales 3d: el arquero', () => {
  it('en tu tiro, la CPU va a su cuadrante; la derecha es la izquierda espejada', () => {
    expect(paradaDelArquero({ equipo: 'propio', arquero: 0 })).toEqual({ anim: 'izq_alta', espejo: false });
    expect(paradaDelArquero({ equipo: 'propio', arquero: 5 })).toEqual({ anim: 'izq_media', espejo: true });
    expect(paradaDelArquero({ equipo: 'propio', arquero: 7 })).toEqual({ anim: 'centro_bajo', espejo: false });
  });

  it('en el del rival vas a tu lado, y a la altura de la pelota si adivinaste', () => {
    expect(paradaDelArquero({ equipo: 'rival', lado: 0, celda: 6 })).toEqual({ anim: 'izq_baja', espejo: false });
    expect(paradaDelArquero({ equipo: 'rival', lado: 2, celda: 0 })).toEqual({ anim: 'izq_media', espejo: true });
  });

  it('la atajada va a las manos', () => {
    expect(destinoAtajada(geo, { equipo: 'propio', arquero: 2, celda: 1 })).toEqual(destinoDeLaPelota(geo, 2, 'atajada'));
    expect(destinoAtajada(geo, { equipo: 'rival', lado: 0, celda: 3 })).toEqual(destinoDeLaPelota(geo, 3, 'atajada'));
  });

  it('ataja el arquero del equipo que no patea', () => {
    expect(equipoDelArquero('propio')).toBe('rival');
    expect(equipoDelArquero('rival')).toBe('propio');
  });

  it('espejado, el rectángulo pasa al otro lado del centro', () => {
    const a = cajaDelArquero(geo, false);
    const b = cajaDelArquero(geo, true);
    expect(a.left + a.width / 2 + (b.left + b.width / 2)).toBeCloseTo(100);
  });
});

describe('penales 3d: las tiras', () => {
  it('ubica cada cuadro en su fila y columna', () => {
    expect(posicionDelCuadro(0, 20, 6)).toEqual({ x: 0, y: 0, ancho: 600, alto: 400 });
    expect(posicionDelCuadro(5, 20, 6)).toMatchObject({ x: 100, y: 0 });
    expect(posicionDelCuadro(19, 20, 6)).toMatchObject({ x: 20, y: 100 });
  });

  it('el loop vuelve a empezar y la parada se queda en el último cuadro', () => {
    expect(cuadroEn(1000, { cuadros: 24, loop: true })).toBe(6);
    expect(cuadroEn(5000, { cuadros: 20, loop: false })).toBe(19);
    expect(cuadroEn(-10, { cuadros: 20, loop: false })).toBe(0);
  });
});
