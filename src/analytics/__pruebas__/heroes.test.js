import { describe, it, expect } from 'vitest';
import { slugHeroe, normalizarHeroe, erroresHeroe, filaDeHeroe, heroeDeFila } from '../heroes';
import { esEspecial, familiaDe, ESPECIALES } from '../especialesCartas';
import { rarezaDeCarta, nombreDeCarta } from '../sobres';
import { aSepia } from '../../utils/sepia';
import { PLANTILLAS, eventoDePlantilla } from '../eventos';

describe('cartas de Héroes', () => {
  it('la clave sale del nombre, sin tildes', () => {
    expect(slugHeroe('Ciro', 'Albarracín')).toBe('ciro-albarracin');
    expect(filaDeHeroe({ nombre: 'Ciro', apellido: 'Albarracín' }).clave).toBe('HERO|ciro-albarracin');
  });

  it('normaliza: media 1-99, puesto válido, hasta 4 rasgos sin repetir', () => {
    const h = normalizarHeroe({ nombre: ' Ana ', apellido: 'P', rol: 'XX', ovr: 140, rasgos: 'Goleador, goleador ,Goleador, Fuerte, Rápido, Líder, Otro' });
    expect(h).toMatchObject({ nombre: 'Ana', rol: 'ALA', ovr: 99, exclusiva: true });
    expect(h.rasgos).toEqual(['Goleador', 'goleador', 'Fuerte', 'Rápido']);
  });

  it('la fila del catálogo: tipo HERO, rareza toty, exclusiva por defecto, con rasgos y capitán', () => {
    const f = filaDeHeroe({ nombre: 'Juan', apellido: 'Pérez', rol: 'CIE', ovr: 97, rasgos: ['Goleador'], capitan: true });
    expect(f).toMatchObject({ tipo: 'HERO', rareza: 'toty', jugador_id: 'heroe:juan-perez', exclusiva_evento: true });
    expect(f.carta).toMatchObject({ ovr: 97, rol: 'CIE', premio: 'HERO', capitan: true, rasgos: ['Goleador'], pie: 'CAPITÁN · LEYENDA' });
    expect(heroeDeFila({ clave: f.clave, carta: f.carta, exclusiva_evento: true })).toMatchObject({ nombre: 'Juan', rasgos: 'Goleador', claveOriginal: f.clave });
  });

  it('no deja dos héroes con el mismo nombre', () => {
    const existentes = [{ clave: 'HERO|juan-perez' }];
    expect(erroresHeroe({ nombre: 'Juan', apellido: 'Perez' }, existentes)).toHaveLength(1);
    expect(erroresHeroe({ nombre: 'Juan', apellido: 'Perez', claveOriginal: 'HERO|juan-perez' }, existentes)).toHaveLength(0);
    expect(erroresHeroe({}, [])).not.toHaveLength(0);
  });

  it('es una carta especial más: familia, rareza y nombre en los sobres', () => {
    expect(esEspecial('HERO')).toBe(true);
    expect(familiaDe('HERO')).toBe('heroe');
    expect(rarezaDeCarta({ premio: 'HERO', ovr: 95 })).toBe('toty');
    expect(nombreDeCarta({ tipo: 'HERO', rareza: 'toty' })).toBe(ESPECIALES.HERO.sigla);
  });

  it('el evento de Héroes toma todas las cartas HERO activas', () => {
    const cat = [{ clave: 'HERO|a', tipo: 'HERO' }, { clave: 'HERO|b', tipo: 'HERO', activa: false }, { clave: 'BASE|1', tipo: 'BASE' }];
    const ev = eventoDePlantilla('heroes', cat);
    expect(ev.cartas).toEqual(['HERO|a']);
    expect(ev.escena.video).toBe('evento_heroes');
    expect(PLANTILLAS.heroes.sobre.exclusivas).toBe(true);
  });
});

describe('la foto en sepia', () => {
  it('pasa a tonos cálidos (rojo > verde > azul) y respeta la transparencia', () => {
    const px = aSepia(new Uint8ClampedArray([10, 200, 30, 128, 255, 255, 255, 255]));
    expect(px[0]).toBeGreaterThan(px[1]);
    expect(px[1]).toBeGreaterThan(px[2]);
    expect(px[3]).toBe(128);
    expect(px[4]).toBe(255);
  });
});
