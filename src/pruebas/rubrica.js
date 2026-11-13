/* PRUEBAS DE JUGADORES · LA RÚBRICA (versionada en código, NO en la base)
 *
 * Cada criterio se puntúa de 1 a 5 con tres descriptores de guía:
 *   1 = no lo logra · 3 = lo hace en condiciones simples · 5 = lo hace bajo
 *   presión y con consistencia.
 * Si se cambia un bloque o un criterio, subir VERSION_RUBRICA: los cierres
 * guardan con qué versión se evaluó.
 *
 * Puestos de la v1: Cierre, Ala y Pivot. El ARQUERO queda pendiente (necesita
 * criterios propios: atajadas, juego con los pies, salidas, achique).
 */

export const VERSION_RUBRICA = 1;

export const PUESTOS = ['Cierre', 'Ala', 'Pivot'];
export const PUESTOS_PENDIENTES = ['Arquero'];

const d = (uno, tres, cinco) => ({ 1: uno, 3: tres, 5: cinco });

export const BLOQUES = [
  {
    id: 'sin_pelota', nombre: 'Activación sin pelota', corto: 'Sin pelota', etapa: 1,
    criterios: [
      { id: 'coordinacion', nombre: 'Coordinación', descriptores: d('Se descoordina en los ejercicios básicos.', 'Coordina bien a ritmo moderado.', 'Coordina con fluidez a máxima velocidad y con cambios.') },
      { id: 'desplazamientos', nombre: 'Desplazamientos específicos', descriptores: d('No frena ni cambia de dirección con control.', 'Frena, cambia de dirección y se desmarca sin oposición.', 'Frena, cambia y se desmarca rápido y con intención, aun con presión.') },
      { id: 'intensidad', nombre: 'Intensidad y predisposición', descriptores: d('Baja la intensidad o se esconde.', 'Mantiene una intensidad correcta casi todo el tiempo.', 'Intensidad alta y constante; contagia.') },
    ],
  },
  {
    id: 'con_pelota', nombre: 'Activación con pelota', corto: 'Con pelota', etapa: 1,
    criterios: [
      { id: 'control_orientado', nombre: 'Control orientado', descriptores: d('El control lo frena o se le escapa.', 'Controla orientado sin presión.', 'Controla orientado hacia ventaja aun con el rival encima.') },
      { id: 'pase', nombre: 'Pase (precisión y velocidad)', descriptores: d('Pases imprecisos o lentos.', 'Pase preciso a ritmo medio.', 'Pase preciso y tenso, al pie correcto, con presión.') },
      { id: 'conduccion', nombre: 'Conducción en espacio reducido', descriptores: d('Pierde la pelota en espacios chicos.', 'Conduce con la cabeza levantada en espacio libre.', 'Conduce y protege en espacios mínimos con la cabeza arriba.') },
      { id: 'perfil_no_dominante', nombre: 'Uso del perfil no dominante', descriptores: d('Evita el perfil no dominante.', 'Lo usa en acciones simples.', 'Lo usa con naturalidad y eficacia en cualquier acción.') },
    ],
  },
  {
    id: 'finalizacion', nombre: 'Drill de finalización', corto: 'Finalización', etapa: 1,
    criterios: [
      { id: 'tecnica_remate', nombre: 'Técnica de remate', descriptores: d('Remata mal apoyado o sin dirección.', 'Remata bien con tiempo y espacio.', 'Remata con técnica limpia aun forzado o de primera.') },
      { id: 'variedad', nombre: 'Variedad (empeine, puntín, definición)', descriptores: d('Un solo recurso.', 'Usa dos o tres recursos.', 'Elige el recurso justo para cada situación.') },
      { id: 'decision_remate', nombre: 'Toma de decisión', descriptores: d('Remata siempre igual o en mala posición.', 'Decide bien en situaciones claras.', 'Decide bien y rápido aun con poco tiempo.') },
      { id: 'eficacia', nombre: 'Eficacia', objetivo: { campos: ['intentos', 'goles'], etiqueta: 'Goles / intentos' }, descriptores: d('Convierte muy poco.', 'Convierte lo esperable.', 'Convierte por encima de lo esperable, también con presión.') },
    ],
  },
  {
    id: 'transiciones', nombre: 'Transiciones', corto: 'Transiciones', etapa: 1,
    criterios: [
      { id: 'reaccion_perdida', nombre: 'Reacción a la pérdida', descriptores: d('Se queda o protesta al perderla.', 'Repliega o presiona cuando es claro.', 'Reacciona al instante: presiona o repliega según convenga.') },
      { id: 'reaccion_recuperacion', nombre: 'Reacción a la recuperación', descriptores: d('No sale ni ocupa espacios.', 'Sale y ocupa espacios con tiempo.', 'Sale rápido y ocupa el espacio justo para atacar.') },
      { id: 'velocidad_decision', nombre: 'Velocidad de decisión', descriptores: d('Decide tarde.', 'Decide a tiempo en lo simple.', 'Decide antes que el resto, aun bajo presión.') },
    ],
  },
  {
    id: 'tarea_jugada', nombre: 'Tarea jugada (2v2 / 3v3)', corto: 'Tarea jugada', etapa: 1, nota: 'Mezclar los grupos entre rondas.',
    criterios: [
      { id: 'lectura', nombre: 'Lectura de juego', descriptores: d('No entiende qué pide la jugada.', 'Lee bien las situaciones simples.', 'Anticipa y lee las situaciones complejas.') },
      { id: 'apoyos', nombre: 'Apoyos', descriptores: d('No da línea de pase.', 'Ofrece apoyos cuando hay tiempo.', 'Siempre da una línea de pase útil y a tiempo.') },
      { id: 'duelos_ofensivos', nombre: 'Duelos 1v1 ofensivos', descriptores: d('Pierde casi todos.', 'Gana algunos en condiciones favorables.', 'Desequilibra con frecuencia.') },
      { id: 'duelos_defensivos', nombre: 'Duelos 1v1 defensivos', descriptores: d('Lo superan con facilidad.', 'Aguanta y orienta en lo simple.', 'Gana duelos y recupera con consistencia.') },
      { id: 'comunicacion', nombre: 'Comunicación', descriptores: d('No habla.', 'Habla cuando hace falta.', 'Ordena y avisa todo el tiempo.') },
    ],
  },
  {
    id: 'juego_real', nombre: 'Juego real', corto: 'Juego real', etapa: 2,
    criterios: [
      { id: 'rol_sistema', nombre: 'Rol en el sistema', descriptores: d('No entiende su rol.', 'Cumple su rol en lo básico.', 'Domina su rol y lo adapta.') },
      { id: 'orden_tactico', nombre: 'Orden táctico', descriptores: d('Se desordena seguido.', 'Mantiene el orden casi siempre.', 'Ordenado y ordena a los demás.') },
      { id: 'aporte_colectivo', nombre: 'Aporte colectivo', descriptores: d('Juega para él.', 'Se integra al equipo.', 'Mejora el juego del equipo.') },
      { id: 'impacto', nombre: 'Impacto', descriptores: d('No influye en el partido.', 'Influye en momentos puntuales.', 'Decide partidos.') },
      { id: 'rendimiento_sostenido', nombre: 'Rendimiento sostenido', descriptores: d('Se cae rápido.', 'Sostiene buena parte del partido.', 'Sostiene el nivel todo el partido.') },
    ],
  },
];

/* Se puntúan sobre toda la prueba (en cualquier sesión). */
export const TRANSVERSALES = [
  {
    id: 'inteligencia_juego', nombre: 'Inteligencia de juego', etapa: null, transversal: true,
    criterios: [{ id: 'inteligencia_juego', nombre: 'Inteligencia de juego', descriptores: d('Juega sin entender el juego.', 'Entiende el juego en lo simple.', 'Entiende y anticipa el juego en todo momento.') }],
  },
  {
    id: 'actitud', nombre: 'Actitud', etapa: null, transversal: true,
    criterios: [{ id: 'actitud', nombre: 'Actitud (reacción al error, liderazgo, trato)', descriptores: d('Se frustra, protesta o trata mal.', 'Reacciona bien y trata bien.', 'Se levanta del error, lidera y suma a los compañeros.') }],
  },
];

export const TODOS_LOS_BLOQUES = [...BLOQUES, ...TRANSVERSALES];
export const bloquePorId = Object.fromEntries(TODOS_LOS_BLOQUES.map((b) => [b.id, b]));

/** Los bloques que se cargan en una sesión de esa etapa (más los transversales). */
export const bloquesDeEtapa = (etapa) => [...BLOQUES.filter((b) => b.etapa === Number(etapa)), ...TRANSVERSALES];

/** Los bloques que cuentan para cerrar una etapa: la 1 sin el juego real; la 2, todo. */
export const bloquesParaCierre = (etapa) => (Number(etapa) === 2 ? TODOS_LOS_BLOQUES : TODOS_LOS_BLOQUES.filter((b) => b.etapa !== 2));
