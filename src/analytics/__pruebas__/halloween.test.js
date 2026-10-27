import { describe, it, expect } from 'vitest';
import { jugadoresParaHalloween, filaHalloween, claveHalloween } from '../halloween';
import { esEspecial, familiaDe } from '../especialesCartas';

const atr = [['TIR', 90], ['PAS', 80], ['REG', 70], ['DEF', 60], ['IMP', 75], ['FÍS', 85]];
const catalogo = [
  { clave: 'BASE|7', jugador_id: '7', tipo: 'BASE', carta: { nombre: 'A', apellido: 'PEREZ', rol: 'ALA', ovr: 84, atributos: atr, foto: 'base.png' } },
  { clave: 'TOTW|1|7', jugador_id: '7', tipo: 'TOTW', carta: { apellido: 'PEREZ', ovr: 95, foto: 'totw.png' }, actualizada_at: '2026-10-01' },
  { clave: 'GOLM|1|9', jugador_id: '9', tipo: 'GOLM', carta: { nombre: 'B', apellido: 'ALVAREZ', rol: 'PIV', ovr: 90, atributos: [] }, actualizada_at: '2026-09-01' },
  { clave: 'TOTM|1|9', jugador_id: '9', tipo: 'TOTM', carta: { nombre: 'B', apellido: 'ALVAREZ', rol: 'PIV', ovr: 88, atributos: atr }, actualizada_at: '2026-08-01' },
  { clave: 'HERO|x', jugador_id: 'heroe:x', tipo: 'HERO', carta: { apellido: 'HEROE' } },
  { clave: 'HALW|2026|9', jugador_id: '9', tipo: 'HALW', carta: { apellido: 'ALVAREZ' } },
];

describe('halloween: quiénes pueden recibirla', () => {
  const js = jugadoresParaHalloween(catalogo, new Map([['TOTW|1|7', 'especial.png']]), 2026);
  it('uno por jugador, sin los Héroes, en orden alfabético', () => {
    expect(js.map((j) => j.apellido)).toEqual(['ALVAREZ', 'PEREZ']);
  });
  it('los datos de la BASE; sin BASE, de la más reciente; los atributos de donde haya', () => {
    const perez = js.find((j) => j.jugador_id === '7');
    expect(perez.ovr).toBe(84);
    expect(perez.foto).toBe('especial.png');               // la foto cargada a mano manda
    const alvarez = js.find((j) => j.jugador_id === '9');
    expect(alvarez.ovr).toBe(90);
    expect(alvarez.atributos).toEqual(atr);
  });
  it('marca a los que ya tienen la de este año', () => {
    expect(js.find((j) => j.jugador_id === '9').tiene).toBe(true);
    expect(js.find((j) => j.jugador_id === '7').tiene).toBe(false);
  });
});

describe('halloween: la carta', () => {
  it('va al catálogo como HALW, exclusiva del evento, con la media elegida', () => {
    const j = jugadoresParaHalloween(catalogo, new Map(), 2026).find((x) => x.jugador_id === '7');
    const f = filaHalloween(j, { anio: 2026, ovr: 120 });
    expect(f.clave).toBe(claveHalloween('7', 2026));
    expect(f).toMatchObject({ tipo: 'HALW', rareza: 'potm', exclusiva_evento: true });
    expect(f.carta.ovr).toBe(99);
    expect(f.carta.titulo).toBe('HALLOWEEN 2026');
    expect(esEspecial(f.carta.premio)).toBe(true);
    expect(familiaDe('HALW')).toBe('halloween');
  });
});
