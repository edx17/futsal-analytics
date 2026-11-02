import { describe, it, expect } from 'vitest';
import { EDICIONES, jugadoresParaEdicion, filaEdicion } from '../edicionesEspeciales';
import { familiaDe, conDisenoEspecial, esEspecial } from '../especialesCartas';

const k = (tipo, id, carta, extra = {}) => ({ clave: `${tipo}|x|${id}`, tipo, jugador_id: id, carta, ...extra });
const catalogo = [
  k('BASE', '1', { nombre: 'Juan', apellido: 'Pérez', rol: 'ALA', ovr: 80, categoria: 'Primera', atributos: [['RIT', 80], ['TIR', 97]] }),
  k('BASE', '2', { nombre: 'Leo', apellido: 'Ruiz', rol: 'PIV', ovr: 70, categoria: 'Tercera', atributos: [['RIT', 70]] }),
  k('HERO', '9', { nombre: 'Viejo', apellido: 'Crack', ovr: 90 }),
  { clave: 'TOTY|2026|1', tipo: 'TOTY', jugador_id: '1', carta: { ovr: 85 } },
];

describe('ediciones especiales: TOTY y Copa Futuro de Oro', () => {
  it('TOTY: el plantel entero, con la media de su temporada más el plus', () => {
    const js = jugadoresParaEdicion(EDICIONES.TOTY, catalogo, new Map(), 2026);
    expect(js.map((j) => [j.apellido, j.ovr, j.sugerida, j.tiene])).toEqual([['Pérez', 80, 85, true], ['Ruiz', 70, 75, false]]);
  });

  it('Copa Futuro: sólo los de inferiores', () => {
    expect(jugadoresParaEdicion(EDICIONES.CFOR, catalogo, new Map(), 2026).map((j) => j.apellido)).toEqual(['Ruiz']);
  });

  it('la fila del catálogo: atributos que suben con la media (hasta 99) y si va a los sobres o sólo al evento', () => {
    const [j] = jugadoresParaEdicion(EDICIONES.TOTY, catalogo, new Map(), 2026);
    const f = filaEdicion(EDICIONES.TOTY, j, { anio: 2026, ovr: 88 });
    expect(f).toMatchObject({ clave: 'TOTY|2026|1', tipo: 'TOTY', rareza: 'toty', exclusiva_evento: false });
    expect(f.carta.atributos).toEqual([['RIT', 88], ['TIR', 99]]);
    const c = filaEdicion(EDICIONES.CFOR, jugadoresParaEdicion(EDICIONES.CFOR, catalogo, new Map(), 2026)[0], { anio: 2026 });
    expect(c).toMatchObject({ tipo: 'CFOR', exclusiva_evento: true });
    expect(c.carta.pie).toBe('TERCERA · 2026');
  });

  it('la TOTY se dibuja con su familia sin volverse especial (su lógica sigue siendo la de MySquad)', () => {
    expect(familiaDe('TOTY')).toBe('toty');
    expect(conDisenoEspecial('TOTY')).toBe(true);
    expect(esEspecial('TOTY')).toBe(false);
    expect(familiaDe('CFOR')).toBe('icono');
  });
});
