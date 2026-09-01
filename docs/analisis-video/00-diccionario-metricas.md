# Diccionario de métricas — análisis de video

> **Versión 0.2.** Decisiones del CT incorporadas (2026-09-01). Escrito a
> partir del modelo compartido `src/offline/modelo.js`, que es la autoridad
> sobre coordenadas, tiempo y vocabulario de acciones.

## Para qué existe este documento

Sin definiciones operativas no se puede medir si el modelo acierta. "El pase
lo detectó bien" no es verificable si dos personas del club no coinciden en
qué es un pase. Este documento es el contrato: contra esto se valida la IA y
contra esto se codifica a mano el set de control.

Regla: **si una definición no se puede aplicar mirando el video en cámara
lenta sin discutir, la definición está mal escrita.**

---

## Origen del dato: tres categorías

Toda métrica cae en una de estas. No se mezclan.

| Origen | Qué significa | Quién lo produce |
|---|---|---|
| **AUTO** | La IA lo calcula sola. Se audita por muestreo. | Pipeline de visión |
| **ASISTIDO** | La IA propone, un humano confirma o corrige en la UI. | Pipeline + operador |
| **MANUAL** | No se intenta automatizar. Se sigue cargando a mano. | `TomaDatos` |

Decisión tomada: **identidad de jugador, cambios y quinteto en cancha son
MANUAL.** No se pelean con video. `TomaDatos` ya los captura con precisión
perfecta y costo cero.

---

## Convención de coordenadas — ya está resuelta, no se reinventa

`src/offline/modelo.js` es la autoridad y documenta la convención:

```
x = 0   → nuestro arco          y = 0   → banda izquierda mirando al arco rival
x = 100 → arco rival            y = 100 → banda derecha
```

Siempre 0–100 y siempre **absolutas respecto del arco propio**, o sea que el
espejado según el lado de la cancha ya está resuelto por `espejar(p, invertida)`.

**El pipeline no define coordenadas propias.** Convierte de metros a esta
convención y después importa y usa las funciones que ya existen:

| Función de `modelo.js` | Para qué |
|---|---|
| `espejar(p, invertida)` | Normalizar según el lado en que ataca el equipo |
| `zonaDe(x, y)` / `etiquetaZona(x, y)` | Asignar la celda Z1–Z4 × I/C/D |
| `tMsDeEvento(ev)` / `msAbsoluto(periodo, tMs)` | Tiempo, en ms dentro del período |
| `LARGO_CANCHA_M` (40) / `ANCHO_CANCHA_M` (20) | Conversión metros ↔ 0–100 |

Conversión: `x_norm = (x_m / 40) * 100`, `y_norm = (y_m / 20) * 100`, y después
`espejar()`.

Se guardan **las dos**: `zona_x` / `zona_y` en la convención de la app, y los
metros crudos en el snapshot, para poder recalcular sin reprocesar el video.

**Lo que sí hay que arreglar**: `VideoTracingIA.jsx` hoy devuelve metros crudos
40×20 sin normalizar ni espejar. Si se guarda así, los mapas de la IA salen
invertidos respecto de los de `TomaDatos` y nadie se va a dar cuenta hasta que
sea tarde.

---

## Zonas de cancha — las que ya existen

No hay tercios ni ninguna grilla nueva. La cancha se lee con la grilla del
club, definida en `modelo.js`: **cuatro zonas de 10 m desde el arco propio
(Z1 Z2 Z3 Z4) por tres carriles (I, C, D)**. Doce celdas.

```
        ┌────────┬────────┬────────┬────────┐
   I    │  Z1-I  │  Z2-I  │  Z3-I  │  Z4-I  │
        ├────────┼────────┼────────┼────────┤
   C    │  Z1-C  │  Z2-C  │  Z3-C  │  Z4-C  │
        ├────────┼────────┼────────┼────────┤
   D    │  Z1-D  │  Z2-D  │  Z3-D  │  Z4-D  │
        └────────┴────────┴────────┴────────┘
    arco propio                       arco rival
      0-10m     10-20m    20-30m    30-40m
```

Cada evento que emite la IA sale con `zona_tactica` y `zona_tactica_fin`
calculadas con `etiquetaZona()`, igual que los que carga `TomaDatosOffline`.

---

## Parámetros ajustables

Todos los umbrales viven en un solo archivo de configuración, versionado.
Cambiar un umbral cambia los números históricos: cada análisis guarda con qué
versión del diccionario se calculó.

| Parámetro | Valor inicial | Qué controla |
|---|---|---|
| `CONTROL_MIN_MS` | 1000 ms | Cuánto tiene que retener un equipo para que cuente como posesión y no rebote |
| `PASE_DIST_MIN_M` | 2,0 m | Distancia mínima recorrida para que un contacto cuente como pase |
| `PRESION_RADIO_M` | **1,0 m** | Rival más cercano dentro de este radio ⇒ la acción fue "bajo presión". Decisión del CT: 2 m no es presión en futsal |
| `REBOTE_MAX_MS` | 400 ms | Contacto más corto que esto es despeje/rebote, no posesión |
| `BLOQUEO_RADIO_M` | 1,5 m | Rival de campo dentro de este radio en la trayectoria ⇒ remate bloqueado |
| `ZONA_RECUPERACION_ALTA` | `['Z3','Z4']` | Qué zonas cuentan como recuperación alta (mitad rival) |

---

## El esquema de salida ya existe (no hay base de datos que diseñar)

`src/offline/modelo.js` + la migración `20260824120000_captura_offline.sql` ya
definen exactamente las estructuras que el pipeline tiene que producir. La IA
no inventa un formato propio: **llena el mismo que llena un humano cargando en
`TomaDatosOffline`.**

| Fábrica en `modelo.js` | Tabla | Qué escribe la IA ahí |
|---|---|---|
| `crearSnapshot()` | `snapshots_posicionales` | Posiciones de los 10 + `x_balon`/`y_balon` en un instante. **Es literalmente la salida del tracking** |
| `crearRecorrido()` | `recorridos_jugador` | Trayectoria de un jugador (`puntos`) en un tramo. Es la salida del tracker por track-id |
| `crearEvento()` | `eventos` | Pases, pérdidas, recuperaciones, remates, con zona, secuencia y flags |
| `crearSecuencia()` | `secuencias_pase` | Cadenas de pases |
| `crearStint()` | `stints_cancha` | Tramos en cancha. **Los llena el humano, no la IA** |

La única marca nueva: `eventos.origen_captura` (la columna ya existe) pasa a
valer `'ia'` en vez de `'offline'`, para poder filtrar, comparar y auditar por
origen.

**Consecuencia práctica**: todo lo que hay en `src/analytics/` — `posesiones.js`,
`transiciones.js`, `xg.js`, `spatial.js`, `insights.js` — funciona sobre eventos
sin saber quién los generó. Si el pipeline emite eventos correctos, la posesión,
las transiciones, el xG y los mapas **ya están calculados**. No hay que
reimplementar nada de eso.

Esto recorta la Fase 4 casi entera y baja el riesgo del proyecto: el trabajo
real es producir eventos buenos, no construir una app alrededor de ellos.

---

## Métricas

### 1. Tiempo neto de juego — AUTO

**Definición.** Suma de todos los intervalos en que la pelota está en juego.

- **Abre** el intervalo: el instante en que un pie toca la pelota para
  ejecutar el saque (inicial, de banda, de meta, de esquina, tiro libre,
  penal). **No** cuando el árbitro silba: cuando la pelota se mueve.
- **Cierra** el intervalo: la pelota cruza completamente una línea, silbato
  del árbitro, gol convertido, tiempo muerto, fin de período.

**Cómo lo calcula la IA.** Detección de pelota fuera de los límites de la
cancha (vía homografía) + detección de silbato en el audio. Las dos señales
se cruzan: el silbato solo, sin pelota fuera, indica falta.

**Precisión objetivo.** ±0,5 s por intervalo; ±2 % sobre el total del partido.

**Nota.** No confundir con el reloj oficial de futsal, que se para en cada
pelota muerta y siempre da 40:00. Esto es tiempo de juego real, que suele
caer entre 22 y 30 minutos.

---

### 2. Tiempo neto por jugador — ASISTIDO (y este es el regalo)

**Definición.** Para cada jugador: la intersección entre sus intervalos en
cancha y los intervalos de pelota en juego.

**Cómo se calcula.** No hace falta que la IA reconozca al jugador. Se cruzan
dos streams que ya existen por separado:

1. Intervalos en cancha ⇒ tabla `stints_cancha` (`entrada_ms` / `salida_ms`),
   que ya la llena `TomaDatosOffline` vía `crearStint()`. MANUAL, exacto.
2. Intervalos de pelota en juego ⇒ métrica 1 (AUTO).

`tiempo_neto_jugador = Σ (intervalo_en_cancha ∩ intervalo_pelota_en_juego)`

**Por qué importa.** Esta era la métrica más difícil de la lista original y
resulta que sale casi gratis, con precisión alta, sin resolver identidad por
video. Es la diferencia entre "jugó 18 minutos de reloj" y "jugó 11 minutos
de pelota en movimiento", que es el número que sirve para dosificar carga.

**Requisito.** Los cambios tienen que estar cargados con timestamp confiable.
Si el operador carga los cambios tarde, esta métrica se degrada. Ver el
protocolo: el reloj de `TomaDatos` y el del video deben estar sincronizados.

**Precisión objetivo.** ±3 % si los cambios están bien cargados.

---

### 3. Posesión por equipo — AUTO

**Definición.** Un equipo tiene la posesión desde que uno de sus jugadores
hace un **contacto controlado** hasta que un jugador del otro equipo hace un
contacto controlado, o la pelota sale.

**Contacto controlado**: el equipo retiene la pelota ≥ `CONTROL_MIN_MS`, o
hace ≥ 2 contactos consecutivos. Todo lo más corto que `REBOTE_MAX_MS` es
rebote o despeje y **no** transfiere posesión.

**Siempre sobre tiempo neto. Nunca sobre tiempo total.** Decisión del CT: es
lo que demanda el futsal, donde el reloj corrido no dice nada. Los porcentajes
suman 100 % contando solo pelota en juego.

**Precisión objetivo.** ±3 puntos porcentuales.

---

### 4. Pases: total, completos, incompletos — AUTO

**Definición.** Contacto intencional de un jugador con la pelota, tras el
cual la pelota recorre ≥ `PASE_DIST_MIN_M` y el siguiente contacto lo hace
**otro** jugador.

- **Completo**: el siguiente contacto es de un compañero.
- **Incompleto**: el siguiente contacto es de un rival, o la pelota sale sin
  que nadie la toque.

**Qué NO es pase** (decidir y no volver atrás):

| Caso | ¿Cuenta? |
|---|---|
| Mismo jugador vuelve a tocar (conducción) | No |
| Remate | No — es remate, categoría aparte |
| Despeje sin destinatario claro | No — se marca `Despeje` |
| Rebote de remate que cae en un compañero | No |
| Saque de banda, córner, saque de meta | **Sí**, con `etiqueta_tactica: 'Pelota parada'` |
| Pase hacia atrás al arquero | Sí |
| Pase que termina en gol | Sí, y además `Asistencia` |

**Saque de banda (decisión del CT).** Cuenta como pase con todas las de la
ley: puede ser completo, incompleto, y puede ser **asistencia** si termina en
gol. Se distingue solo por `etiqueta_tactica: 'Pelota parada'`, que ya está en
`ETIQUETAS_TACTICAS`. Esto importa más en futsal que en fútbol 11: el saque de
banda es un arma ofensiva real y esconderlo en otra categoría borraría datos
que el CT usa.

**Mapeo al vocabulario existente.** No hay tipo nuevo que inventar: la acción
`Pase` de `modelo.js` ya tiene `resultado: true` y el evento ya lleva
`pase_completado`, `id_receptor`, y coordenadas de origen y destino
(`zona_x/y` → `zona_x_fin/y_fin`).

**Precisión objetivo.** ±8 % en el total; 85 % de acierto en la clasificación
completo/incompleto.

---

### 5. Cadena de pases — AUTO

**Definición.** Secuencia ordenada de pases consecutivos del mismo equipo sin
interrupción. **Termina** en cualquier acción con `cierra: true` en `ACCIONES`
(pérdida, los cuatro tipos de remate, bloqueo/intercepción), o en falta, salida
de pelota o fin de período.

**No hay tabla nueva que diseñar.** `crearSecuencia()` y la tabla
`secuencias_pase` ya existen con exactamente los campos que hacen falta:
`cantidad_pases`, `pases_completados`, `pases_incompletos`, `t_inicio_ms`,
`t_fin_ms`, `resultado`, `id_evento_final`, `etiqueta_tactica`. Cada evento de
pase se cuelga con `secuencia_id` y `orden_secuencia`.

**Sobre la identidad.** La cadena *anónima* sale sola y ya sirve: "secuencias de
5+ pases que terminan en remate", "de qué zona a qué zona". La cadena *nominal*
(el 7 al 10 al 4) necesita `id_jugador` e `id_receptor`, que la IA no puede
llenar. Se completan en la UI de corrección, y solo para las secuencias que el
operador marque como relevantes. No tiene sentido nominalizar las 400 de un
partido.

---

### 6. Pérdidas y recuperaciones — AUTO

- **Pérdida**: el equipo pierde la posesión sin haber rematado y sin salida
  de pelota neutral. Deriva directo del cambio de posesión de la métrica 3.
- **Recuperación**: el equipo gana la posesión en juego dinámico (no por
  saque). Se clasifica por la celda donde ocurre, con `etiquetaZona()`.

**Recuperación alta** = la que ocurre en `ZONA_RECUPERACION_ALTA`, hoy
`['Z3','Z4']`, es decir la mitad del campo rival. Se reporta igual el desglose
completo por las 12 celdas: colapsar a alta/media/baja es solo para el titular
del reporte, el dato fino no se pierde.

`Recuperación` y `Pérdida` ya existen en `ACCIONES`; `Recuperación Alta` existe
en la taxonomía vieja de `TomaDatos` y se deriva de la zona, no se guarda como
acción aparte.

**Precisión objetivo.** ±10 %.

---

### 7. Errores forzados / no forzados — AUTO como *proxy*, MANUAL como verdad

Esto no es un hecho observable, es un criterio. La IA no puede leer intención.
Lo que sí puede calcular es un **proxy geométrico**:

- **Forzado**: en el instante del contacto había un rival a ≤ `PRESION_RADIO_M`
  (**1,0 m**), o hubo contacto físico / duelo.
- **No forzado**: no había ningún rival dentro de ese radio.

**Aceptado por el CT, con una condición: tiene que ser editable.** Eso es un
requisito de producto, no un detalle. Se implementa así:

- El evento se guarda con `tipo_perdida` (el campo ya existe en `crearEvento`)
  y con `bajo_presion` calculado.
- Se guarda además la **distancia real al rival más cercano** en el momento del
  contacto. Sin ese número el operador corrige a ciegas; con él ve *por qué* la
  IA decidió lo que decidió y puede discutirlo.
- En la UI de corrección la clasificación se cambia con un toque, y el evento
  queda marcado como corregido por humano para no volver a pisarlo.
- Las correcciones se acumulan: si el CT corrige sistemáticamente en un sentido,
  ese es el dato que dice que `PRESION_RADIO_M` está mal calibrado. **Se revisa
  el umbral después de los primeros 5 partidos, con las correcciones en la mano.**

`Bajo Presión` ya es un modificador en `TomaDatos`, así que el proxy se apoya en
algo que el CT ya usa. Aun así, el proxy y el criterio humano no van a coincidir
siempre, y no es un bug: se muestra siempre etiquetado como estimación.

---

### 8. Remates — ASISTIDO

**Definición.** Contacto con intención de gol: trayectoria dirigida a la
portería rival.

Clasificación, mapeada 1 a 1 con lo que ya existe:

| Resultado | `accion` actual | Criterio |
|---|---|---|
| Gol | `Remate - Gol` | La pelota cruza la línea de gol entre los postes |
| Al arco | `Remate - Atajado` | Trayectoria dentro del marco, la toca el arquero |
| Desviado | `Remate - Desviado` | Sale sin tocar arquero ni bloqueo |
| Bloqueado | `Remate - Rebatido` | Un rival de campo la intercepta a ≤ `BLOQUEO_RADIO_M` |

**Por qué ASISTIDO.** Son pocos eventos por partido (10–25), o sea poca data
para entrenar, y el costo de un error es alto porque son las jugadas que el
CT mira una por una. La IA propone el remate y su minuto; el operador
confirma la clasificación en 10 segundos. Los modificadores que ya usás
(`2do Palo`, `Mano a Mano`, `Punteo`, `Arq. Adelantado`, `De Espaldas`) siguen
siendo MANUAL.

**Precisión objetivo.** 90 % de recall en *detectar* que hubo remate (que no
se le escape ninguno importa más que clasificar bien). Clasificación: 75 %.

---

### 9. Mapa de calor — AUTO

**Definición.** Densidad de posiciones sobre la cancha, en la convención de
coordenadas de arriba. Dos variantes distintas, no confundirlas:

- **Mapa de acciones**: densidad de *eventos* (dónde se pierde, dónde se
  recupera, desde dónde se remata). Es lo que ya hace `simpleheat` con
  `eventos`.
- **Mapa de ocupación**: densidad de *presencia* por unidad de tiempo, con
  todos los frames. Solo lo puede dar el tracking. Es información nueva.

Solo se computa sobre frames con pelota en juego; si no, los minutos parados
en el saque contaminan el mapa.

---

### 10. Jugadores en campo y cambios — MANUAL

No se automatiza. El cambio volante en futsal (20–25 entradas y salidas por
jugador, camiseta de espaldas, mismo uniforme) está por debajo del piso de
lo que el video de cancha resuelve. `TomaDatos` ya lo captura exacto.

Si en el futuro se quiere automatizar, el camino es una **segunda cámara
apuntando a la zona de cambios** — ahí el jugador está cerca y lento y el
dorsal es legible — no mejorar el modelo sobre la cámara principal.

---

## Criterio de aceptación

Antes de mostrarle un número a un CT, el pipeline se valida así:

1. **Set de control**: 5 partidos codificados a mano, con este diccionario en
   la mano, por una persona. 2 de esos 5, codificados **dos veces** por
   personas distintas.
2. **Acuerdo entre humanos primero.** Si dos personas no llegan al 90 % de
   acuerdo entre sí en una métrica, la definición está mal escrita y se
   arregla el documento, no el modelo. Ninguna IA va a superar el techo que
   ponen dos humanos que no se ponen de acuerdo.
3. Recién ahí se compara la IA contra el set de control, métrica por métrica,
   contra los objetivos de precisión de cada sección.
4. Una métrica que no llega a su objetivo **no se publica en la app**. Se
   deja apagada. Un número malo con cara de dato es peor que no tener el dato.

## Decisiones del CT — cerradas el 2026-09-01

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿El saque de banda cuenta como pase? | **Sí**, con todas las de la ley: completo, incompleto y puede ser asistencia. Se marca con `etiqueta_tactica: 'Pelota parada'` |
| 2 | Radio de presión | **1,0 m.** 2 m no es presión en futsal |
| 3 | División de cancha | **Ninguna nueva.** Se usa la grilla del club: Z1–Z4 × I/C/D, ya definida en `modelo.js` |
| 4 | Proxy geométrico de error no forzado | **Aceptado**, con la condición de que sea editable y muestre la distancia que usó para decidir |
| 5 | Base de la posesión | **Siempre tiempo neto.** Nunca tiempo total |

Queda una sub-decisión abierta, menor: se propone **recuperación alta = Z3 o
Z4** (mitad rival). Si el CT prefiere que sea solo Z4, es cambiar una constante.
