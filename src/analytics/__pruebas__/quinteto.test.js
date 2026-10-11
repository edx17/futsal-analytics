import { describe, it, expect } from 'vitest';
import {
  ovrDesdeRating, tierDe, rolDe, percentiles, analizarPartidos, armarCartas,
  FORMACIONES, quintetoIdeal, quintetoMasUsado, quimicaDe, colorPareja, clavePareja,
  puedeIr, enSuPuesto, etiquetaLugar, CASTIGO_FUERA_DE_PUESTO,
} from '../quinteto';
import { procesarPlantel } from '../plantel';
import { elegirMVP } from '../rating';

describe('ovrDesdeRating', () => {
  it('pasa el rating a escala FIFA cuando hay partidos de sobra', () => {
    // Con muchos partidos la corrección casi no pesa.
    expect(ovrDesdeRating(8, 1000, 6)).toBe(90);
    expect(ovrDesdeRating(6, 1000, 6)).toBe(65);
    expect(ovrDesdeRating(6.8, 1000, 6.8)).toBe(75);
  });
  it('con un solo partido bueno no da una carta altísima', () => {
    expect(ovrDesdeRating(9, 1, 6.5)).toBeLessThan(ovrDesdeRating(9, 20, 6.5));
    expect(ovrDesdeRating(9, 1, 6.5)).toBeLessThan(80);
  });
  it('queda entre 40 y 99', () => {
    expect(ovrDesdeRating(10, 1000, 10)).toBe(99);
    expect(ovrDesdeRating(0, 1000, 0.1)).toBe(40);
  });
});

describe('tierDe y rolDe', () => {
  it('bronce, plata y oro', () => {
    expect(tierDe(64)).toBe('bronce');
    expect(tierDe(65)).toBe('plata');
    expect(tierDe(75)).toBe('oro');
  });
  it('puesto a partir del texto del plantel', () => {
    expect(rolDe('Arquero')).toBe('ARQ');
    expect(rolDe('Cierre')).toBe('CIE');
    expect(rolDe('Pivot')).toBe('PIV');
    expect(rolDe('Ala')).toBe('ALA');
    expect(rolDe('')).toBe('ALA');
  });
});

describe('percentiles', () => {
  it('ordena de 0 a 1 y los empates sacan lo mismo', () => {
    expect(percentiles([10, 30, 20])).toEqual([0, 1, 0.5]);
    const [a, b] = percentiles([5, 5, 1]);
    expect(a).toBe(b);
  });
});

/* ── un plantel chico, con dos partidos ── */
const jug = (id, apellido, posicion) => ({ id, nombre: 'N', apellido, posicion, dorsal: id, categoria: 'Primera' });
const JUGADORES = [jug(1, 'ARQ', 'Arquero'), jug(2, 'CIE', 'Cierre'), jug(3, 'ALA1', 'Ala'), jug(4, 'PIV', 'Pivot'),
  jug(5, 'ALA2', 'Ala'), jug(6, 'SUP', 'Ala')];
const q = (...ids) => JSON.stringify(ids.map(String));
const partido = (id) => ({ id, rival: 'R' + id, fecha: `2026-0${id}-10`, categoria: 'Primera', torneo_id: 't1',
  plantilla: JSON.stringify([1, 2, 3, 4, 5, 6].map((x) => ({ id_jugador: x }))) });
const eventos = (idp, base) => {
  const e = { id_partido: idp, equipo: 'Propio', periodo: 'PT' };
  return [
    { ...e, id: base + 1, accion: 'Gol', id_jugador: 4, id_asistencia: 3, minuto: 2, quinteto_activo: q(1, 2, 3, 4, 5) },
    { ...e, id: base + 2, accion: 'Recuperación', id_jugador: 2, minuto: 5, quinteto_activo: q(1, 2, 3, 4, 5) },
    { ...e, id: base + 3, accion: 'Remate - Atajado', id_jugador: 5, minuto: 8, quinteto_activo: q(1, 2, 3, 4, 5) },
    { ...e, id: base + 4, equipo: 'Rival', accion: 'Remate - Gol', minuto: 15, quinteto_activo: q(1, 2, 3, 4, 6) },
    { ...e, id: base + 5, accion: 'Pérdida', id_jugador: 6, minuto: 18, quinteto_activo: q(1, 2, 3, 4, 6) },
  ];
};
const PARTIDOS = [partido(1), partido(2)];
const EVENTOS = [...eventos(1, 100), ...eventos(2, 200)];

describe('analizarPartidos', () => {
  const r = analizarPartidos({ partidos: PARTIDOS, eventos: EVENTOS, jugadores: JUGADORES });

  it('arma la forma partido a partido, del más viejo al más nuevo', () => {
    expect(r.forma['4'].map((f) => f.rival)).toEqual(['R1', 'R2']);
  });
  it('cuenta los minutos juntos y el +/- de cada pareja', () => {
    // 1 y 2 estuvieron juntos en las 5 acciones de cada partido: 40' por partido.
    expect(Math.round(r.parejas[clavePareja(1, 2)].minutos)).toBe(80);
    // 5 y 6 nunca coincidieron.
    expect(r.parejas[clavePareja(5, 6)]).toBeUndefined();
    // con 5 en cancha hubo un gol a favor por partido; con 6, uno en contra.
    expect(r.parejas[clavePareja(4, 5)].pm).toBe(2);
    expect(r.parejas[clavePareja(4, 6)].pm).toBe(-2);
  });
  it('el quinteto más usado es el de más minutos', () => {
    expect(r.quintetos[0].ids.sort()).toEqual(['1', '2', '3', '4', '5']);
  });
  it('marca la figura del último partido', () => {
    expect(r.figura).not.toBeNull();
  });
  it('la figura sale de elegirMVP, igual que en Resumen e Inicio', () => {
    const ultimo = r.partidosJugados[r.partidosJugados.length - 1];
    const mvp = elegirMVP(ultimo.jugadores, { golesFavor: ultimo.golesFavor, golesContra: ultimo.golesContra });
    expect(r.figura).toBe(String(mvp.id));
  });
  it('deja partido a partido la nota, la participación y los goles de cada uno', () => {
    expect(r.partidosJugados).toHaveLength(2);
    const [primero] = r.partidosJugados;
    expect(primero.fecha).toBe('2026-01-10');
    const delantero = primero.jugadores.find((c) => c.id === '4');
    expect(delantero.goles).toBe(1);
    expect(delantero.rol).toBe('PIV');
    expect(primero.jugadores.find((c) => c.id === '3').asistencias).toBe(1);
  });
});

describe('armarCartas, quinteto ideal y química', () => {
  const { jugadoresProc, arquerosProc } = procesarPlantel({
    raw: { jugadores: JUGADORES, partidos: PARTIDOS, eventos: EVENTOS, sanciones: [], torneos: [] },
    partidosScopeCat: PARTIDOS, filtroTorneo: 'Todos', filtroCategoria: 'Todas', misCategorias: [],
    hayRuedas: false, filtroRueda: 'Todas', torneoElegido: null, jornadasOrdenadas: [],
  });
  const analisis = analizarPartidos({ partidos: PARTIDOS, eventos: EVENTOS, jugadores: JUGADORES });
  const { cartas, minimo } = armarCartas({ jugadoresProc, arquerosProc, ...analisis });

  it('hay una carta por jugador que jugó, con su puesto y seis atributos', () => {
    expect(cartas).toHaveLength(6);
    const arq = cartas.find((c) => c.id === '1');
    expect(arq.rol).toBe('ARQ');
    expect(arq.atributos.map(([k]) => k)).toEqual(['ATA', 'EVI', 'PIE', 'SAL', 'IMP', 'FÍS']);
    expect(cartas.find((c) => c.id === '4').atributos.map(([k]) => k)).toEqual(['TIR', 'PAS', 'REG', 'DEF', 'IMP', 'FÍS']);
    expect(minimo).toBe(2);
  });

  it('el quinteto ideal pone al arquero en el arco y respeta los puestos', () => {
    const f = FORMACIONES['2-2'];
    const ideal = quintetoIdeal(cartas, f);
    expect(ideal).toHaveLength(5);
    expect(ideal[0]).toBe('1');
    expect(new Set(ideal).size).toBe(5);
    const porId = new Map(cartas.map((c) => [c.id, c]));
    // el pivot va en un lugar de pivot y el cierre en uno de cierre
    expect(f.lugares[ideal.indexOf('4')].roles).toContain('PIV');
    expect(f.lugares[ideal.indexOf('2')].roles).toContain('CIE');
    expect(porId.get(ideal[0]).rol).toBe('ARQ');
  });

  it('el más usado trae a los cinco que más jugaron juntos', () => {
    const usado = quintetoMasUsado(analisis.quintetos, cartas, FORMACIONES['1-2-1']);
    expect([...usado].sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(usado[0]).toBe('1');
  });

  it('la química pinta cada línea y da un total de 0 a 100', () => {
    const f = FORMACIONES['2-2'];
    const { lineas, total } = quimicaDe(['1', '2', '3', '4', '6'], f, analisis.parejas);
    expect(lineas).toHaveLength(f.enlaces.length);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(100);
  });
});

describe('colorPareja', () => {
  it('poco tiempo juntos es amarilla, aunque el +/- sea bueno', () => {
    expect(colorPareja({ minutos: 10, pm: 3 })).toBe('amarilla');
    expect(colorPareja(null)).toBe('amarilla');
  });
  it('con tiempo de sobra manda el +/-', () => {
    expect(colorPareja({ minutos: 80, pm: 1 })).toBe('verde');
    expect(colorPareja({ minutos: 80, pm: -1 })).toBe('roja');
  });
});

/* ── puestos según la formación ── */
const carta = (id, rol, ovr = 70) => ({ id, rol, ovr, enEvaluacion: false, apellido: id });

describe('puestos', () => {
  it('las formaciones piden los puestos acordados', () => {
    const roles = (id) => FORMACIONES[id].lugares.slice(1).map(etiquetaLugar);
    expect(roles('2-2')).toEqual(['CIE', 'CIE', 'PIV', 'PIV']);
    expect(roles('1-2-1').sort()).toEqual(['ALA', 'ALA', 'CIE', 'PIV']);
    expect(roles('3-1').sort()).toEqual(['ALA', 'ALA', 'CIE', 'PIV']);
    // 4-0: 2 cierres y 2 alas, o 1 cierre y 3 alas
    expect(roles('4-0')).toEqual(['ALA', 'CIE', 'CIE/ALA', 'ALA']);
  });

  it('el arco es fijo: sólo arqueros, y los arqueros no van al campo', () => {
    expect(puedeIr(carta('a', 'ARQ'), 0)).toBe(true);
    expect(puedeIr(carta('b', 'ALA'), 0)).toBe(false);
    expect(puedeIr(carta('a', 'ARQ'), 2)).toBe(false);
    expect(puedeIr(carta('b', 'PIV'), 2)).toBe(true); // fuera de puesto, pero se puede
  });

  it('fuera de puesto baja la química', () => {
    const f = FORMACIONES['2-2'];
    const enPuesto = [carta('g', 'ARQ'), carta('c1', 'CIE'), carta('c2', 'CIE'), carta('p1', 'PIV'), carta('p2', 'PIV')];
    const conUnAla = [...enPuesto.slice(0, 4), carta('a1', 'ALA')];
    expect(enSuPuesto(conUnAla[4], f.lugares[4])).toBe(false);
    const ids = (l) => l.map((c) => c.id);
    const bien = quimicaDe(ids(enPuesto), f, {}, enPuesto);
    const mal = quimicaDe(ids(conUnAla), f, {}, conUnAla);
    expect(bien.fueraDePuesto).toBe(0);
    expect(mal.fueraDePuesto).toBe(1);
    expect(bien.total - mal.total).toBe(CASTIGO_FUERA_DE_PUESTO);
  });

  it('el ideal respeta los puestos y, si falta uno, completa con el mejor que queda', () => {
    const cartas = [carta('g', 'ARQ', 80), carta('c1', 'CIE', 70), carta('c2', 'CIE', 60),
      carta('p1', 'PIV', 75), carta('a1', 'ALA', 90), carta('a2', 'ALA', 85)];
    const f = FORMACIONES['2-2'];
    const ideal = quintetoIdeal(cartas, f);
    expect(ideal[0]).toBe('g');
    expect(ideal.slice(1, 3).sort()).toEqual(['c1', 'c2']);
    // hay un solo pivot: el otro lugar de pivot lo ocupa el mejor que queda (fuera de puesto)
    expect(ideal.slice(3).sort()).toEqual(['a1', 'p1']);
  });
});

