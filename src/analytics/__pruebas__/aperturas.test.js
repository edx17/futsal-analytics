import { describe, it, expect } from 'vitest';
import {
  VARIANTES, VARIANTE_DE_TIPO, VIDEOS, varianteDeApertura, completarVariante, ajustarVariante, guionDe, duracionTotal,
  varianteDeEvento, indiceMejorCarta, FASES_VIDEO, FASES_ESTANDAR,
} from '../aperturas';
import { SOBRES } from '../sobres';

const cartas = (...rarezas) => rarezas.map((rareza, i) => ({ rareza, carta: { ovr: 70 + i } }));
// Como si estuvieran todos los videos renderizados.
const TODOS = Object.fromEntries(['vdraft', 'elite', 'epico', 'leyenda'].map((id) => [id, { ...VIDEOS.vdraft, poster: `/cine/${id}.jpg` }]));

describe('aperturas: qué variante toca', () => {
  it('cada tipo de sobre de la base tiene su variante', () => {
    Object.keys(SOBRES).forEach((tipo) => expect(VARIANTES[VARIANTE_DE_TIPO[tipo]]).toBeTruthy());
    expect(varianteDeApertura({ tipo: 'diario' })).toMatchObject({ id: 'diario', modo: 'estandar', video: null });
    expect(varianteDeApertura({ tipo: 'wellness' })).toMatchObject({ id: 'wellness', latido: true });
    expect(varianteDeApertura({ tipo: 'premio_especial' })).toMatchObject({ id: 'vdraft', modo: 'video' });
    expect(varianteDeApertura({ tipo: 'premio_especial' }).video.fuentes.length).toBeGreaterThan(0);
  });

  it('una variante cuyo video todavía no existe abre estándar', () => {
    expect(varianteDeApertura({ tipo: 'mega', videos: { vdraft: VIDEOS.vdraft } })).toMatchObject({ id: 'elite', modo: 'estandar', video: null });
    expect(varianteDeApertura({ tipo: 'mega', videos: TODOS })).toMatchObject({ id: 'elite', modo: 'video' });
    expect(varianteDeApertura({ tipo: 'racha', videos: TODOS })).toMatchObject({ id: 'epico', modo: 'video' });
  });

  it('un tipo desconocido abre como un sobre común (no rompe)', () => {
    expect(varianteDeApertura({ tipo: 'inventado' })).toMatchObject({ id: 'puntos', modo: 'estandar' });
  });

  it('sólo si de verdad salió un TOTY la escena es la de Leyenda, y el sobre conserva su nombre', () => {
    const v = varianteDeApertura({ tipo: 'puntos', cartas: cartas('toty', 'plata'), videos: TODOS });
    expect(v).toMatchObject({ id: 'leyenda', modo: 'video', nombre: 'SOBRE POR V-COINS', icono: 'estrella' });
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('potm', 'potm', 'totm'), videos: TODOS }).id).toBe('elite');
  });

  it('sin el video de Leyenda, un TOTY usa la escena del tipo de sobre con los colores de Leyenda', () => {
    const v = varianteDeApertura({ tipo: 'premio_especial', cartas: cartas('toty'), videos: { vdraft: VIDEOS.vdraft } });
    expect(v).toMatchObject({ id: 'vdraft', modo: 'video', escena: 'leyenda' });
    expect(v.colores.luz).toBe(VARIANTES.leyenda.colores.luz);
  });

  it('excepcional: TOTY y además otra carta top en el mismo sobre', () => {
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'potm', 'totw'), videos: TODOS }).id).toBe('excepcional');
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'toty'), videos: TODOS }).id).toBe('excepcional');
    expect(varianteDeApertura({ tipo: 'mega', cartas: cartas('toty', 'totw'), videos: TODOS }).id).toBe('leyenda');
  });

  it('eventos: sólo si están cargados', () => {
    expect(varianteDeApertura({ tipo: 'racha', evento: 'aniversario' }).id).not.toMatch(/^evento/);
    const eventos = { aniversario: { nombre: 'ANIVERSARIO', colores: { luz: '#f43f5e' } } };
    expect(varianteDeApertura({ tipo: 'racha', evento: 'aniversario', eventos }))
      .toMatchObject({ id: 'evento:aniversario', nombre: 'ANIVERSARIO', modo: 'video' });
    expect(varianteDeEvento('x', {}).colores.luz).toBeTruthy();
  });
});

describe('aperturas: la mejor carta del sobre', () => {
  it('la más rara; entre iguales, la de más media', () => {
    expect(indiceMejorCarta(cartas('plata', 'totw', 'oro'))).toBe(1);
    expect(indiceMejorCarta(cartas('totw', 'potm', 'toty', 'oro'))).toBe(2);
    expect(indiceMejorCarta([{ rareza: 'oro', carta: { ovr: 80 } }, { rareza: 'oro', carta: { ovr: 84 } }])).toBe(1);
    expect(indiceMejorCarta([])).toBe(-1);
  });
});

describe('aperturas: configuración válida', () => {
  it('todas las variantes se pueden mostrar y son distintas', () => {
    const vistas = new Set();
    Object.values(VARIANTES).forEach((def) => {
      const v = completarVariante(def, TODOS);
      expect(v.colores.principal).toMatch(/^#/);
      expect(v.colores.particulas.length).toBeGreaterThan(0);
      vistas.add(`${v.colores.principal}|${v.colores.luz}|${v.nombre}`);
    });
    expect(vistas.size).toBe(Object.keys(VARIANTES).length);
  });

  it('el video dura ~6,5 s; la estándar, menos de 3', () => {
    expect(duracionTotal(completarVariante(VARIANTES.vdraft))).toBe(6500);
    expect(duracionTotal(completarVariante(VARIANTES.diario))).toBeLessThan(duracionTotal(completarVariante(VARIANTES.puntos)));
    expect(duracionTotal(completarVariante(VARIANTES.puntos))).toBeLessThan(3000);
  });

  it('corrige lo que venga mal en vez de romper', () => {
    const v = completarVariante({ modo: 'video', video: 'no-existe', colores: { luz: 'no-es-color', particulas: [] }, tiempos: { tiembla: -5 }, intensidad: 9, particulas: 9999 });
    expect(v.modo).toBe('estandar');
    expect(v.colores.luz).toMatch(/^#/);
    expect(v.colores.particulas.length).toBeGreaterThan(0);
    expect(v.tiempos.tiembla).toBe(0);
    expect(v.intensidad).toBe(1.5);
    expect(v.particulas).toBe(160);
  });
});

describe('aperturas: preferencias', () => {
  const vdraft = completarVariante(VARIANTES.vdraft);

  it('el modo video pasa por la mejor carta antes de las demás', () => {
    expect(guionDe(vdraft).map((f) => f.id)).toEqual(FASES_VIDEO);
  });

  it('rápida acelera el video y acorta la estándar', () => {
    const r = ajustarVariante(vdraft, { prefs: { velocidad: 'rapida', cine: true } });
    expect(r.velocidadVideo).toBeGreaterThan(1);
    expect(duracionTotal(r)).toBeLessThan(duracionTotal(vdraft) * 0.7);
  });

  it('sin cine o con "reducir movimiento" abre estándar', () => {
    expect(guionDe(ajustarVariante(vdraft, { prefs: { cine: false } })).map((f) => f.id)).toEqual(FASES_ESTANDAR);
    const quieta = ajustarVariante(vdraft, { menosMovimiento: true });
    expect(quieta.modo).toBe('estandar');
    expect(quieta.sinMovimiento).toBe(true);
  });

  it('en equipos livianos, menos partículas', () => {
    expect(ajustarVariante(completarVariante(VARIANTES.elite), { liviano: true }).particulas).toBeLessThan(VARIANTES.elite.particulas);
  });
});
