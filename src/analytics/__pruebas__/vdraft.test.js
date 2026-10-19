import { describe, it, expect } from 'vitest';
import { fuerzaDelEquipo, premioPorVictorias, pasoDelDraft, marcador, puestoRival, FORMACIONES_DRAFT } from '../vdraft';
import { FORMACIONES } from '../quinteto';

const carta = (rol, ovr) => ({ carta: { rol, ovr } });
const LUGARES = FORMACIONES['1-2-1'].lugares;

describe('V-Draft: fuerza del equipo', () => {
  it('todos en su puesto: química 100 y fuerza = media + 4', () => {
    const eq = [carta('ARQ', 80), carta('CIE', 90), carta('ALA', 85), carta('ALA', 85), carta('PIV', 90)];
    expect(fuerzaDelEquipo(eq, LUGARES)).toEqual({ media: 86, quimica: 100, fuerza: 90 });
  });

  it('fuera de puesto baja la química; un arquero en el campo, además, resta 6', () => {
    const fuera = [carta('ARQ', 80), carta('ALA', 90), carta('ALA', 85), carta('ALA', 85), carta('PIV', 90)];
    expect(fuerzaDelEquipo(fuera, LUGARES)).toMatchObject({ quimica: 88, fuerza: 87.6 });
    const arq = [carta('ARQ', 80), carta('ARQ', 90), carta('ALA', 85), carta('ALA', 85), carta('PIV', 90)];
    expect(fuerzaDelEquipo(arq, LUGARES)).toMatchObject({ quimica: 80, fuerza: 80 });
  });

  it('con lugares vacíos cuenta sólo los que hay', () => {
    expect(fuerzaDelEquipo([null, carta('CIE', 90), null, null, null], LUGARES)).toMatchObject({ media: 90, quimica: 20 });
    expect(fuerzaDelEquipo([], LUGARES)).toEqual({ media: 0, quimica: 0, fuerza: 0 });
  });
});

describe('V-Draft: premios y textos', () => {
  it('paga según las victorias', () => {
    expect(premioPorVictorias(0)).toMatchObject({ vcoins: 0, sobre: null });
    expect(premioPorVictorias(2)).toMatchObject({ vcoins: 75, sobre: null });
    expect(premioPorVictorias(3)).toMatchObject({ vcoins: 150, sobre: 'premio' });
    expect(premioPorVictorias(4)).toMatchObject({ vcoins: 300, sobre: 'premio_especial' });
  });

  it('dice qué toca elegir', () => {
    const base = { estado: 'draft', lugares: LUGARES, equipo: [{}, null, null, {}, {}], banco: [] };
    expect(pasoDelDraft({ ...base, paso: 'capitan' }).titulo).toBe('ELEGÍ TU CAPITÁN');
    expect(pasoDelDraft({ ...base, paso: 'lugar', lugar_actual: 1 })).toMatchObject({ titulo: 'ELEGÍ CIE', ayuda: 'Te faltan 2 lugares en la cancha.' });
    expect(pasoDelDraft({ ...base, paso: 'banco', banco: [{}] }).titulo).toBe('SUPLENTE 2 DE 2');
    expect(pasoDelDraft({ estado: 'torneo' })).toBeNull();
  });

  it('marcador y puesto del rival', () => {
    expect(marcador({ goles_propios: 3, goles_rival: 2 })).toBe('3-2');
    expect(marcador({ goles_propios: 2, goles_rival: 2, penales: '4-3' })).toBe('2-2 (4-3 pen.)');
    expect(puestoRival({ puesto: 1, de: 19, zona: 'z1', division: 'D' })).toBe('1° de 19 · Zona 1 · Primera D');
    expect(puestoRival({ division: 'A' })).toBe('Primera A');
  });

  it('las cuatro formaciones del draft son las de MySquad', () => {
    expect(FORMACIONES_DRAFT.map((f) => f.id)).toEqual(['2-2', '1-2-1', '3-1', '4-0']);
  });
});
