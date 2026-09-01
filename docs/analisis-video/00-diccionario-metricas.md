# Diccionario de métricas — análisis de video

> **Versión 0.1 — BORRADOR.** Escrito a partir de la taxonomía que ya usa
> `src/pages/TomaDatos.jsx`. Necesita que el CT lo corrija antes de escribir
> una línea de pipeline.

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

## Convención de coordenadas (CRÍTICO)

Hoy conviven dos sistemas y no son compatibles:

- **`eventos.zona_x` / `zona_y`**: normalizadas 0–100, y **espejadas** cuando
  `direccionAtaque === 'izquierda'` (`x → 100-x`, `y → 100-y`). Es decir: en
  la base, el equipo Propio **siempre ataca hacia la derecha**.
- **Salida del tracking**: metros crudos sobre cancha de 40 × 20, origen en
  una esquina fija de la imagen, sin espejar.

**Regla única**: el pipeline normaliza a la convención de `eventos` **antes**
de escribir nada. `x_norm = (x_m / 40) * 100`, `y_norm = (y_m / 20) * 100`, y
después aplica el mismo espejado según el período y el lado en que arrancó el
equipo Propio. Se guardan **las dos**: `zona_x/zona_y` para compatibilidad y
`x_m/y_m` crudos para poder recalcular sin reprocesar el video.

Si esto no se respeta, los heatmaps de la IA salen invertidos respecto de los
de `TomaDatos` y nadie se va a dar cuenta hasta que sea tarde.

---

## Parámetros ajustables

Todos los umbrales viven en un solo archivo de configuración, versionado.
Cambiar un umbral cambia los números históricos: cada análisis guarda con qué
versión del diccionario se calculó.

| Parámetro | Valor inicial | Qué controla |
|---|---|---|
| `CONTROL_MIN_MS` | 1000 ms | Cuánto tiene que retener un equipo para que cuente como posesión y no rebote |
| `PASE_DIST_MIN_M` | 2,0 m | Distancia mínima recorrida para que un contacto cuente como pase |
| `PRESION_RADIO_M` | 2,0 m | Rival más cercano dentro de este radio ⇒ la acción fue "bajo presión" |
| `REBOTE_MAX_MS` | 400 ms | Contacto más corto que esto es despeje/rebote, no posesión |
| `BLOQUEO_RADIO_M` | 1,5 m | Rival de campo dentro de este radio en la trayectoria ⇒ remate bloqueado |
| `TERCIO_DEF` / `TERCIO_OFE` | 0–33 / 67–100 | Cortes de tercio para recuperación alta/media/baja |

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

1. Intervalos en cancha ⇒ eventos `Cambio` de `TomaDatos` (MANUAL, exacto).
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

**Se reporta sobre tiempo neto, no sobre tiempo total.** Los porcentajes
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
| Saque de banda, córner, saque de meta | **Sí**, con flag `balon_parado` |
| Pase hacia atrás al arquero | Sí |
| Pase que termina en gol | Sí, y además `Asistencia` |

**Mapeo al vocabulario existente.** `Pase Incompleto` ya existe en
`getColorAccion`. Los completos hoy no se registran de a uno; la IA los
agrega como tipo nuevo.

**Precisión objetivo.** ±8 % en el total; 85 % de acierto en la clasificación
completo/incompleto.

---

### 5. Cadena de pases — AUTO (tabla `secuencias_pase`, ya existe)

**Definición.** Secuencia ordenada de pases consecutivos del mismo equipo sin
interrupción. **Termina** en: pérdida, remate, falta, salida de la pelota o
fin de período.

Se guarda por secuencia: cantidad de pases, duración, tercio donde arrancó,
tercio donde terminó, y en qué desenlace terminó.

**Sin identidad de jugador**, la cadena es anónima: sirve para "secuencias de
5+ pases que terminan en remate", no para "el 7 al 10 al 4". Esa segunda
lectura requiere que el operador asigne dorsales en la UI de corrección, y
solo vale la pena en secuencias marcadas como relevantes.

---

### 6. Pérdidas y recuperaciones — AUTO

- **Pérdida**: el equipo pierde la posesión sin haber rematado y sin salida
  de pelota neutral. Deriva directo del cambio de posesión de la métrica 3.
- **Recuperación**: el equipo gana la posesión en juego dinámico (no por
  saque). Se clasifica por tercio de cancha: **Alta** (tercio ofensivo),
  Media, Baja.

`Recuperación`, `Recuperación Alta` y `Pérdida` ya existen en la taxonomía.

**Precisión objetivo.** ±10 %.

---

### 7. Errores forzados / no forzados — AUTO como *proxy*, MANUAL como verdad

Esto no es un hecho observable, es un criterio. La IA no puede leer intención.
Lo que sí puede calcular es un **proxy geométrico**:

- **Forzado**: en el instante del contacto había un rival a ≤ `PRESION_RADIO_M`,
  o hubo contacto físico / duelo.
- **No forzado**: no había ningún rival dentro de ese radio.

`Error No Forzado` ya existe en la taxonomía y `Bajo Presión` ya es un
modificador en `TomaDatos`, así que el proxy se apoya en algo que el CT ya usa.

**Advertencia explícita.** El proxy y el criterio del CT **no van a coincidir
siempre**, y no es un bug. Se muestra siempre etiquetado como estimación, con
el radio usado a la vista, y el operador lo puede pisar. Si el CT no acepta
esto, la métrica pasa a MANUAL y listo.

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

## Pendiente de decisión del CT

- [ ] ¿El saque de banda cuenta como pase? (propuesta: sí, con flag)
- [ ] `PRESION_RADIO_M` = 2,0 m — ¿es el radio que usás mentalmente?
- [ ] ¿Los cortes de tercio son 33/67 o preferís otra división?
- [ ] ¿Se acepta el proxy geométrico de error no forzado, o va a MANUAL?
- [ ] ¿Posesión se reporta sobre tiempo neto (propuesta) o sobre tiempo total?
