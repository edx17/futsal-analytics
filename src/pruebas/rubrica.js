/* PRUEBAS DE JUGADORES · LA RÚBRICA (versionada en código, NO en la base)
 *
 * Cada criterio se puntúa de 1 a 5 con tres descriptores de guía:
 *   1 = no lo logra · 3 = lo hace en condiciones simples · 5 = lo hace bajo
 *   presión y con consistencia.
 * Si se cambia un bloque o un criterio, subir VERSION_RUBRICA: los cierres
 * guardan con qué versión se evaluó.
 *
 * Puestos: Cierre, Ala y Pivot comparten la rúbrica de campo. El ARQUERO
 * tiene la suya en la etapa 1 (BLOQUES_ARQUERO); el juego real (etapa 2) y
 * los transversales son los mismos, y en actitud suma la reacción al gol
 * recibido.
 *
 * Versión 2: se sumó el arquero.
 */

export const VERSION_RUBRICA = 2;

export const PUESTOS_CAMPO = ['Cierre', 'Ala', 'Pivot'];
export const PUESTOS = [...PUESTOS_CAMPO, 'Arquero'];
export const PUESTOS_PENDIENTES = [];

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

/* EL ARQUERO (etapa 1). `objetivo.campos`: [total, logrados] (ej. remates y atajadas). */
export const BLOQUES_ARQUERO = [
  {
    id: 'arq_activacion', nombre: 'Activación y posición', corto: 'Posición', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'posicion_base', nombre: 'Posición de base y perfilamiento al remate', descriptores: d('Llega mal parado al remate.', 'Se perfila bien con tiempo.', 'Siempre perfilado y equilibrado, aun en jugadas rápidas.') },
      { id: 'desplazamientos_laterales', nombre: 'Desplazamientos laterales cortos', descriptores: d('Se cruza de piernas o llega tarde.', 'Se desplaza bien a ritmo medio.', 'Desplazamientos cortos, rápidos y sin perder la base.') },
      { id: 'explosividad', nombre: 'Explosividad y reacción', descriptores: d('Reacciona tarde.', 'Reacciona a tiempo en lo previsible.', 'Reacciona explosivo ante lo imprevisto.') },
    ],
  },
  {
    id: 'arq_paradas', nombre: 'Paradas', corto: 'Paradas', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'remate_bajo', nombre: 'Remate a media y baja altura (pie, mano baja)', objetivo: { campos: ['remates', 'atajadas'], etiqueta: 'Atajadas / remates al arco' }, descriptores: d('Le entran los bajos o rasantes.', 'Ataja los bajos con tiempo.', 'Ataja bajos y a media altura aun a quemarropa.') },
      { id: 'remate_alto', nombre: 'Remate alto y a corta distancia (reflejos)', descriptores: d('No llega a los altos ni a los cercanos.', 'Responde bien a los altos lejanos.', 'Reflejos de primer nivel a corta distancia.') },
      { id: 'rebote', nombre: 'Control del rebote / desvío fuera de zona', descriptores: d('Da rebotes al medio.', 'Controla o desvía lo simple.', 'Siempre controla o desvía fuera de peligro.') },
      { id: 'tecnica_bloqueo', nombre: 'Técnica de bloqueo (cruz, split / espagat, rodilla al piso)', descriptores: d('No usa técnica de bloqueo.', 'Usa el bloqueo en lo previsible.', 'Elige y ejecuta el bloqueo justo en cada situación.') },
    ],
  },
  {
    id: 'arq_uno_contra_uno', nombre: '1v1 y achique', corto: '1v1', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'timing_salida', nombre: 'Timing de salida', objetivo: { campos: ['duelos', 'ganados'], etiqueta: '1v1 ganados / 1v1' }, descriptores: d('Sale tarde o a destiempo.', 'Sale a tiempo en lo claro.', 'Sale siempre en el momento justo.') },
      { id: 'achique', nombre: 'Reducción del ángulo (achique)', descriptores: d('No achica.', 'Achica bien con tiempo.', 'Achica rápido y deja sin ángulo.') },
      { id: 'aguante', nombre: 'Aguante sin regalar el primer movimiento', descriptores: d('Se tira antes.', 'Aguanta en lo simple.', 'Aguanta hasta el final y obliga al rival a decidir.') },
      { id: 'lectura_rematador', nombre: 'Lectura del rematador', descriptores: d('No anticipa la intención.', 'Lee los remates previsibles.', 'Anticipa la intención del rematador.') },
    ],
  },
  {
    id: 'arq_juego_pies', nombre: 'Juego con los pies', corto: 'Pies', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'control_pase_pies', nombre: 'Control y pase con los dos perfiles', objetivo: { campos: ['pases', 'buenos'], etiqueta: 'Pases buenos / intentos' }, descriptores: d('Control y pase imprecisos.', 'Correcto con su perfil hábil.', 'Preciso con los dos perfiles, aun presionado.') },
      { id: 'pase_largo', nombre: 'Pase largo al pivot / diagonal', descriptores: d('No llega o la regala.', 'Llega con tiempo y espacio.', 'Encuentra al pivot o la diagonal con precisión.') },
      { id: 'tranquilidad_presion', nombre: 'Tranquilidad ante la presión', descriptores: d('Se apura y la pierde.', 'Resuelve la presión simple.', 'Resuelve con calma la presión alta.') },
      { id: 'arquero_jugador', nombre: 'Participación como jugador de campo (4v3, arquero-jugador)', descriptores: d('No se suma al juego.', 'Se suma cuando le toca.', 'Es un jugador más y genera superioridad.') },
    ],
  },
  {
    id: 'arq_saque', nombre: 'Saque con las manos', corto: 'Saque', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'saque_rapido', nombre: 'Saque rápido para iniciar el contraataque', objetivo: { campos: ['saques', 'buenos'], etiqueta: 'Saques buenos / saques' }, descriptores: d('Tarda y deja armar al rival.', 'Saca rápido cuando la ve clara.', 'Detecta y ejecuta el contraataque al instante.') },
      { id: 'precision_saque', nombre: 'Precisión (corto, largo, picado)', descriptores: d('Saques imprecisos.', 'Preciso en corto.', 'Preciso en corto, largo y picado.') },
      { id: 'eleccion_saque', nombre: 'Elección de la opción', descriptores: d('Elige mal a quién.', 'Elige bien la opción simple.', 'Elige siempre la opción que más ventaja da.') },
      { id: 'cuatro_segundos', nombre: 'Respeta los 4 segundos', descriptores: d('Se pasa o se apura.', 'Los respeta sin presión.', 'Los maneja con calma aun con presión.') },
    ],
  },
  {
    id: 'arq_transiciones', nombre: 'Transiciones y espacios', corto: 'Transiciones', etapa: 1, puesto: 'Arquero',
    criterios: [
      { id: 'defensa_contragolpe', nombre: 'Defensa del contragolpe (2v1, 3v2)', descriptores: d('Se queda o se entrega.', 'Defiende el contragolpe simple.', 'Gana tiempo y resuelve en inferioridad.') },
      { id: 'salidas_pase', nombre: 'Salidas a cortar pases filtrados', descriptores: d('No sale o sale mal.', 'Corta los pases evidentes.', 'Anticipa y corta los pases filtrados.') },
      { id: 'pelota_parada', nombre: 'Pelota parada en contra (córner, falta, doble penal)', descriptores: d('Se ubica mal.', 'Se ubica bien en lo estándar.', 'Lee y ordena cada pelota parada.') },
    ],
  },
  {
    id: 'arq_tarea_jugada', nombre: 'Tarea jugada (con arquero)', corto: 'Tarea jugada', etapa: 1, puesto: 'Arquero', nota: 'Mezclar los grupos entre rondas.',
    criterios: [
      { id: 'lectura_anticipacion', nombre: 'Lectura y anticipación', descriptores: d('Reacciona tarde a la jugada.', 'Lee las jugadas simples.', 'Anticipa las jugadas antes que se definan.') },
      { id: 'comunicacion_defensa', nombre: 'Comunicación y orden de la defensa', descriptores: d('No habla.', 'Avisa cuando hace falta.', 'Ordena la defensa todo el tiempo.') },
      { id: 'intervenciones', nombre: 'Intervenciones decisivas', descriptores: d('No influye.', 'Interviene en lo previsible.', 'Salva situaciones de gol con frecuencia.') },
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

const JUEGO_REAL = BLOQUES.find((b) => b.id === 'juego_real');

/* El arquero suma en actitud la reacción al gol recibido. */
const TRANSVERSALES_ARQUERO = TRANSVERSALES.map((t) => (t.id !== 'actitud' ? t : {
  ...t,
  criterios: [...t.criterios, { id: 'reaccion_gol', nombre: 'Reacción al gol recibido', descriptores: d('Se cae y arrastra al equipo.', 'Se recompone y sigue.', 'Se levanta al instante y sostiene al equipo.') }],
}));

export const esArquero = (puesto) => puesto === 'Arquero';
export const transversalesDe = (puesto) => (esArquero(puesto) ? TRANSVERSALES_ARQUERO : TRANSVERSALES);

/** Todos los bloques de un puesto (las dos etapas y los transversales). */
export const bloquesDePuesto = (puesto) => (esArquero(puesto)
  ? [...BLOQUES_ARQUERO, JUEGO_REAL, ...TRANSVERSALES_ARQUERO]
  : [...BLOQUES, ...TRANSVERSALES]);

/** Todos los bloques que existen (campo + arquero), para buscar nombres por id. */
export const TODOS_LOS_BLOQUES = [...BLOQUES, ...BLOQUES_ARQUERO, ...TRANSVERSALES];
export const bloquePorId = Object.fromEntries(TODOS_LOS_BLOQUES.map((b) => [b.id, b]));

/** Los bloques que se cargan en una sesión de esa etapa para ese puesto (más los transversales). */
export const bloquesDeEtapa = (etapa, puesto = 'Ala') => bloquesDePuesto(puesto).filter((b) => b.transversal || b.etapa === Number(etapa));

/** Los bloques que cuentan para cerrar una etapa: la 1 sin el juego real; la 2, todo. */
export const bloquesParaCierre = (etapa, puesto = 'Ala') => bloquesDePuesto(puesto).filter((b) => Number(etapa) === 2 || b.etapa !== 2);
