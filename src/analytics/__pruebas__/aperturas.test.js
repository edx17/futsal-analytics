import { describe, it, expect } from 'vitest';
import {
  VARIANTES, VARIANTE_DE_TIPO, varianteDeApertura, completarVariante, ajustarVariante, guionDe, duracionTotal,
  varianteDeEvento, FASES_CINE, FASES_ESTANDAR,
} from '../aperturas';
import { SOBRES } from '../sobres';

const cartas = (...rarezas) => rarezas.map((rareza) => ({ rareza }));

describe('aperturas: qué variante toca', () => {
  it('cada tipo de sobre de la base tiene su variante', () => {
    Object.keys(SOBRES).forEach((tipo) => expect(VARIANTES[VARIANTE_DE_TIPO[tipo]]).toBeTruthy());
    expect(varianteDeApertura({ tipo: 'diario', cartas: cartas('bronce', 'plata', 'oro') })).toMatchObject({ id: 'diario', modo: 'estandar' });
    expect(varianteDeApertura({ tipo: 'wellness' })).toMatchObject({ id: 'wellness', latido: true });
    expect(varianteDeApertura({ tipo: 'racha' })).toMatchObject({ id: 'semana', modo: 'cine', escenario: 'leds', portal: 'energia' });
    expect(varianteDeApertura({ tipo: 'mega' })).toMatchObject({ id: 'mega', modo: 'cine', escenario: 'focos', portal: 'expansion' });
    expect(varianteDeApertura({ tipo: 'premio_especial' })).toMatchObject({ modo: 'cine', escenario: 'cristal', portal: 'geometrico' });
    expect(varianteDeApertura({ tipo: 'premio' })).toMatchObject({ id: 'premio', modo: 'estandar' });
  });

  it('un tipo desconocido abre como un sobre común (no rompe)', () => {
    expect(varianteDeApertura({ tipo: 'inventado' })).toMatchObject({ id: 'puntos', modo: 'estandar' });
  });

  it('sólo si de verdad salió un TOTY la apertura es la solemne', () => {
    expect(varianteDeApertura({ tipo: 'diario', cartas: cartas('toty', 'plata', 'bronce') })).toMatchObject({ id: 'toty', escenario: 'solemne' });
    // …pero el sobre sigue llamándose como el que se abrió: no se anuncia la carta.
    expect(varianteDeApertura({ tipo: 'puntos', cartas: cartas('toty') })).toMatchObject({ nombre: 'SOBRE POR V-COINS', icono: 'estrella' });
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('potm', 'potm', 'totm') }).id).toBe('mega');
  });

  it('excepcional: TOTY y además otra carta top en el mismo sobre', () => {
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'potm', 'totw') }).id).toBe('excepcional');
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'toty') }).id).toBe('excepcional');
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'totw') }).id).toBe('toty');
  });

  it('eventos: sólo si están cargados', () => {
    expect(varianteDeApertura({ tipo: 'racha', evento: 'aniversario' }).id).toBe('semana');
    const eventos = { aniversario: { nombre: 'ANIVERSARIO', colores: { luz: '#f43f5e' }, portal: 'eclipse' } };
    expect(varianteDeApertura({ tipo: 'racha', evento: 'aniversario', eventos }))
      .toMatchObject({ id: 'evento:aniversario', nombre: 'ANIVERSARIO', modo: 'cine', portal: 'eclipse' });
    expect(varianteDeEvento('x', {}).colores.luz).toBeTruthy();
  });
});

describe('aperturas: configuración válida', () => {
  it('todas las variantes son distintas y dibujables', () => {
    const vistas = new Set();
    Object.values(VARIANTES).forEach((def) => {
      const v = completarVariante(def);
      expect(v.colores.principal).toMatch(/^#/);
      expect(v.colores.particulas.length).toBeGreaterThan(0);
      guionDe(v).forEach((f) => { if (f.id !== 'cartas') expect(f.ms).toBeGreaterThan(0); });
      vistas.add(`${v.colores.principal}|${v.colores.luz}|${v.escenario}|${v.portal}`);
    });
    expect(vistas.size).toBe(Object.keys(VARIANTES).length);
  });

  it('las de cine duran entre 5 y 10 segundos; las estándar, menos de 3', () => {
    Object.values(VARIANTES).forEach((def) => {
      const v = completarVariante(def);
      const total = duracionTotal(v);
      if (v.modo === 'cine') { expect(total).toBeGreaterThanOrEqual(5000); expect(total).toBeLessThanOrEqual(10000); } else expect(total).toBeLessThan(3000);
    });
    expect(duracionTotal(completarVariante(VARIANTES.diario))).toBeLessThan(duracionTotal(completarVariante(VARIANTES.puntos)));
  });

  it('corrige lo que venga mal en vez de romper', () => {
    const v = completarVariante({ modo: 'cine', colores: { luz: 'no-es-color', particulas: [] }, tiempos: { tunel: -5 }, intensidad: 9, particulas: 9999 });
    expect(v.colores.luz).toMatch(/^#/);
    expect(v.colores.particulas.length).toBeGreaterThan(0);
    expect(v.tiempos.tunel).toBe(0);
    expect(v.intensidad).toBe(1.5);
    expect(v.particulas).toBe(160);
  });
});

describe('aperturas: preferencias', () => {
  const semana = completarVariante(VARIANTES.semana);

  it('rápida acorta todo; las fases son las mismas', () => {
    const r = ajustarVariante(semana, { prefs: { velocidad: 'rapida', cine: true } });
    expect(duracionTotal(r)).toBeLessThan(duracionTotal(semana) * 0.6);
    expect(guionDe(r).map((f) => f.id)).toEqual(FASES_CINE);
  });

  it('sin cine o con "reducir movimiento" abre estándar', () => {
    expect(guionDe(ajustarVariante(semana, { prefs: { cine: false } })).map((f) => f.id)).toEqual(FASES_ESTANDAR);
    const quieta = ajustarVariante(semana, { menosMovimiento: true });
    expect(quieta.modo).toBe('estandar');
    expect(quieta.sinMovimiento).toBe(true);
  });

  it('en equipos livianos, menos partículas y sin desenfoque', () => {
    const l = ajustarVariante(completarVariante(VARIANTES.mega), { liviano: true });
    expect(l.particulas).toBeLessThan(VARIANTES.mega.particulas);
    expect(l.desenfoque).toBe(0);
  });
});
