# Pruebas de jugadores (Plantel › Pruebas, `/pruebas`)

Evaluar candidatos a incorporar con una rúbrica única y cerrar con una
recomendación cuyos criterios se ajustan desde el configurador. Siempre dentro
de **una categoría**: nunca se mezclan candidatos ni pruebas de distintas.

## Piezas

| Qué | Dónde |
|---|---|
| Rúbrica (bloques, criterios, descriptores 1/3/5; campo y arquero), versionada en código | `src/pruebas/rubrica.js` (`VERSION_RUBRICA` = 2) |
| Configuración por defecto, resolución y validación | `src/pruebas/configDefault.js` |
| Motor del cierre (no tiene números fijos: recibe la configuración) | `src/pruebas/evaluacionPrueba.js` |
| Edad relativa (trimestre y edad decimal, no se guarda) | `src/pruebas/edadRelativa.js` |
| Base de datos (por club y categoría, joins con Maps) | `src/pruebas/datos.js` |
| Cola offline de puntajes (como la toma de datos) | `src/pruebas/useColaPruebas.js` |
| Pantalla y pestañas | `src/pages/Pruebas.jsx`, `src/components/pruebas/*` |
| Radar por bloque (SVG propio, aparte del Generador de Reportes) | `src/components/pruebas/RadarBloques.jsx` |
| Tablas y RLS | `supabase/migrations/20261117120000_pruebas_jugadores.sql` |
| Tests | `src/pruebas/__pruebas__/pruebas.test.js` |

## Flujo

1. **Candidatos**: ficha previa (foto, puestos, perfil dominante, antecedentes,
   observaciones no puntuadas). La edad relativa se muestra en la ficha y el listado.
2. **Evaluar**: sesión (fecha y etapa) → candidato → bloque por bloque, tap 1-5
   con el descriptor, dato objetivo (goles/intentos en eficacia) y comentario.
   Cada evaluador ve sólo lo suyo mientras la carga está abierta.
3. **Cierre** (por candidato y etapa):
   - *Cerrar carga* (mínimo de evaluadores **configurable**, por defecto 2; con 1
     alcanza con el DT; contados con `pruebas_resumen_carga` sin ver los
     puntajes) → todos ven todo y no se carga más.
   - El motor calcula con la configuración vigente. El DT confirma o cambia
     (comentario obligatorio si cambia).
   - **Queda congelado**: se guardan el resultado, el snapshot de la
     configuración, su versión y la de la rúbrica. Cambios posteriores del
     configurador no lo recalculan.
   - Ficha con radar, exportable a PNG; *Incorporar* crea el jugador
     (`jugadores`, mismo alta que Plantel: usuario y PIN de kiosco).
   - La etapa 2 (juego real) se habilita sólo si la etapa 1 está decidida y no
     es "No incorporar".
4. **Configurador**: pesos por puesto y bloque (0.0-2.0, paso 0.1), umbrales
   (incluido el mínimo de evaluadores, de 1 a 5),
   bloque clave por puesto; para el club o para la categoría (pisa a la del
   club); restaurar defaults por puesto o todo; **simulación** vigente vs.
   borrador sobre los candidatos con puntajes visibles, sin guardar nada.

## Permisos (RLS con `get_user_rol()` / `get_user_club_id()`)

| | ve | carga puntajes, candidatos, sesiones y cierres | configura |
|---|---|---|---|
| superuser | todo | todo | sí |
| manager | su club | sí | sí |
| ct | su club | sí | sí |
| admin | su club | no | no |

Borrar candidatos y sesiones: superuser y manager. Reabrir un cierre: sólo superuser.

## Decisiones tomadas

- Los **transversales** (inteligencia de juego, actitud) entran en el puntaje
  final con su peso, configurable igual que los bloques (por defecto 1.0).
- Cierre de **etapa 1**: puntajes de sesiones de etapa 1. **Etapa 2**: todos.
- Si un evaluador puntúa el mismo criterio en más de una sesión, se promedia lo suyo.
- Fortalezas y aspectos a mejorar: los 2 bloques (no transversales) más altos y más bajos.

## Arquero (rúbrica v2)

En la etapa 1 tiene sus propios bloques (`BLOQUES_ARQUERO`): activación y
posición, paradas, 1v1 y achique, juego con los pies, saque con las manos,
transiciones y espacios, y tarea jugada. Comparte el juego real y los
transversales; en actitud suma la reacción al gol recibido. Bloque clave por
defecto: paradas. Datos objetivos: atajadas/remates, 1v1 ganados, pases buenos
y saques buenos.

## Señas para reconocerlo

`pruebas_candidatos.senas` ("camiseta naranja, botines blancos"): se ve en
gris e itálica debajo del nombre en todas las pestañas y se edita en el
momento desde EVALUAR (la ropa cambia de un día a otro).

## Manual

Sección `#pruebas` de `public/manual/index.html` (botón MANUAL en la pantalla):
qué se analiza, la escala, cómo se aplica el método en la cancha, cómo se
calcula la recomendación, la edad relativa, el configurador y buenas prácticas.

## Pendientes

- **Calibración**: las ponderaciones y los umbrales por defecto son una primera
  propuesta. Con las primeras pruebas reales, usar la simulación del
  configurador para ajustarlos por categoría.
- Exportar la ficha también desde el Generador de Reportes, si se quiere
  sumar el radar como bloque reutilizable.
