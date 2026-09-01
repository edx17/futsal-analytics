# Protocolo de filmación

> **Versión 0.2.** Incorpora el setup elegido: GoPro Hero 13 fija en un corner, bien alta.

## Por qué esto va antes que el código

De todas las variables del proyecto, **la posición de la cámara es la que más
mueve la precisión final**. Más que el modelo, más que el entrenamiento, más
que la GPU. La misma IA sobre una cámara fija alta da 85 % y sobre un celular
en la esquina da 45 %.

Cuesta una tarde de trabajo y una mañana de instalación. El desarrollo cuesta
meses. Se hace primero.

---

## Setup mínimo viable

| Parámetro | Requerido | Ideal | Por qué |
|---|---|---|---|
| **Posición** | Centro de la línea lateral | Centro, lado opuesto a los bancos | Desde la esquina, la perspectiva aplasta el fondo y la homografía pierde precisión donde más la necesitás |
| **Altura** | ≥ 4 m | 6–8 m | Menos altura ⇒ más oclusión: los jugadores del fondo desaparecen atrás de los del frente |
| **Encuadre** | Cancha completa + 2 m de margen | Idem, fijo | Si un jugador sale del cuadro, el tracker le pierde la identidad |
| **Movimiento** | **Ninguno.** Cámara fija | Idem | Un solo paneo obliga a recalibrar la homografía frame a frame |
| **Resolución** | 1080p | 4K (3840×2160) | En 1080p la pelota de futsal ocupa ~8 px y se pierde entre las piernas |
| **Framerate** | 30 fps | 50–60 fps | La pelota se mueve 8–10 m/s: a 30 fps salta 30 cm entre frames |
| **Obturador** | 1/250 | 1/500 o más rápido | El motion blur es el enemigo N° 1 de la detección de pelota |
| **Exposición** | **Manual, fija** | Idem | El auto-exposición cambia los colores y rompe el clustering por camiseta |
| **Balance de blancos** | **Manual, fijo** | Idem | Mismo motivo |
| **Autofoco** | **Apagado**, foco fijo | Idem | El AF "caza" foco durante el partido y desenfoca jugadas enteras |
| **Audio** | **Encendido** | Micrófono hacia la cancha | El silbato es la señal principal para el tiempo neto. Sin audio, esa métrica se degrada mucho |
| **Bitrate** | ≥ 20 Mbps | ≥ 40 Mbps en 4K | La compresión agresiva destruye la pelota antes que a los jugadores |
| **Formato** | MP4 / H.264 | H.264 (más compatible que H.265) | — |

---

## Qué NO hacer

- ❌ **Filmar a través de la red o del vidrio.** Mete un patrón fijo sobre
  toda la imagen que el detector interpreta como objetos.
- ❌ **Contraluz de ventanas.** Los jugadores quedan en silueta y el
  clustering por color de camiseta deja de funcionar.
- ❌ **Zoom o seguimiento manual.** Aunque quede más lindo de mirar.
- ❌ **Cortar la grabación dentro de un período.** Si es inevitable, anotar
  el minuto exacto del corte.
- ❌ **Música o ruido fuerte cerca del micrófono.** Tapa el silbato.
- ❌ **Camisetas de color parecido entre los dos equipos, o parecido al
  piso.** Si el club puede elegir el juego de camisetas, elegir contraste.
  El arquero siempre de color distinto a los diez de campo.

---

## Rutina de grabación

**Antes del partido**

1. Montar la cámara en la posición marcada. Marcar con cinta en el piso el
   lugar del trípode: la calibración se reutiliza entre partidos solo si la
   cámara vuelve exactamente al mismo lugar.
2. Fijar exposición, balance de blancos y foco. Bloquearlos.
3. Verificar que la cancha entera entra en cuadro, con margen.
4. **Grabar 30 segundos de cancha vacía** antes de que salgan los equipos.
   Estos frames son los que se usan para calibrar la homografía: las líneas
   se ven sin nadie encima.
5. Arrancar la grabación **antes** del saque inicial, no justo encima.

**Sincronización con `TomaDatos` (importante)**

El tiempo neto por jugador cruza los cambios de `TomaDatos` con la pelota en
juego del video. Si los dos relojes están corridos, el cruce da mal.

- Al arrancar el reloj de `TomaDatos`, **el operador da un aplauso fuerte y
  sostenido frente a la cámara**. Ese pico de audio es el punto cero.
- Alternativa: anotar el timestamp del video en el que se ejecuta el saque
  inicial, y cargarlo al subir el video.

**Después del partido**

Nombre de archivo, siempre igual:

```
AAAA-MM-DD_categoria_vs-RIVAL_PT.mp4
AAAA-MM-DD_categoria_vs-RIVAL_ST.mp4
```

Un archivo por período. Ejemplo: `2026-09-14_primera_vs-SanLorenzo_PT.mp4`.

---

## El setup elegido: GoPro Hero 13 en un corner, alta

Decisión tomada. La tabla de arriba pide el centro de la lateral porque es lo
mejor en abstracto; el corner tiene un costo concreto, medible, y acá está
medido en vez de quedar como advertencia vaga. **La altura es lo que salva el
setup**, y ese es justamente el punto fuerte de esta decisión.

### Lo que cuesta el corner, en números

Corriendo la calibración de la Fase 1 sobre una cámara simulada en un corner a
12 m de altura, 4K, con 3 px de error de detección:

| Celda | píxeles por metro | incertidumbre |
|---|---:|---:|
| Z1-I (rincón cercano) | 52,6 | **6 cm** |
| Z2-C | 19,0 | 16 cm |
| Z3-C | 11,5 | 26 cm |
| Z4-C | 7,6 | 40 cm |
| Z4-D (rincón lejano) | 6,7 | **45 cm** |

Reproducible con `python -m futsal_ia.cli precision --calibracion tu_cal.json`.

Ocho veces peor en la esquina lejana que en la cercana. Nada de esto invalida
el proyecto —45 cm sigue siendo utilísimo para heatmaps, ocupación y zonas—
pero significa dos cosas: que un dato de Z4-D no es del mismo material que uno
de Z1-I, y que el pipeline tiene que decirlo en vez de dejarlo pasar. Por eso
el informe de precisión sale en cada análisis.

**Cómo se mejora, en orden de impacto**: subir la cámara, correrla hacia atrás
alejándola de la esquina, y recién después cualquier cosa del software.
Simulado, pasar de 8 m a 12 m de altura y de 2 m a 5 m de retroceso mejora
notablemente el rincón lejano. Nada de lo que se escriba en Python compite con
eso.

### Linear NO alcanza desde un corner

Este es el hallazgo que más cambia la configuración de la cámara.

Para que la cancha entera entre en cuadro desde un corner hacen falta
**unos 115–125 grados de campo horizontal**, según qué tan alta y qué tan
atrás esté. El modo **Linear de la GoPro ronda los 90–95 grados: no alcanza.**
Desde el centro de la lateral sí alcanzaría; desde un corner, no.

Consecuencia directa: hay que filmar en **Wide**, que distorsiona, y corregir
la distorsión en el pipeline antes de calibrar. Deja de ser opcional.

La homografía asume que las líneas rectas se ven rectas. Calibrar sobre una
imagen curvada da un resultado que anda bien en el centro y cada vez peor hacia
los bordes — es decir, exactamente donde está el rincón lejano, que ya es el
peor lugar de la imagen. Los dos errores se suman.

`ia/futsal_ia/lente.py` trae coeficientes aproximados para arrancar y
`calibrar_con_tablero()` para hacerlo bien. La calibración real es filmar un
tablero de ajedrez impreso desde 20–30 ángulos, ocupando las esquinas del
cuadro. Una tarde, una sola vez por cámara y por modo.

### Ajustes de la GoPro

Verificá los nombres exactos en el menú de tu unidad, pero el criterio es este:

| Ajuste | Valor | Por qué |
|---|---|---|
| Lente digital | **Wide** | Linear no cubre la cancha desde el corner |
| Horizon Lock / nivelación | **APAGADO** | Rota y recorta el cuadro sobre la marcha. Una homografía fija deja de valer si el encuadre se mueve un grado |
| HyperSmooth / estabilización | **APAGADO** | Mismo problema. Está en un trípode, no hace falta |
| Resolución | **4K**, no 5.3K | 5,3K calienta más y no aporta: el cuello de botella es la lente, no los píxeles |
| Framerate | 60 fps | Ya pensando en la Fase 2, que necesita la pelota |
| Obturador | **≥ 1/500** (ProTune, manual) | El motion blur es el enemigo número uno de la detección de pelota |
| ISO | Fijo, tope bajo | Que no lo mueva la cámara sola |
| Balance de blancos | **Manual, fijo** | Si cambia, los colores se mueven y el clustering de equipos se mezcla |
| Bitrate | **High** | La compresión agresiva destruye la pelota antes que a los jugadores |

Los tres apagados —Horizon Lock, estabilización, automatismos— son los que
silenciosamente arruinan un partido entero.

### Dos trampas prácticas de la GoPro

1. **Parte los archivos.** Cuando la grabación pasa cierto tamaño la GoPro
   corta y sigue en un archivo nuevo. Hay que **concatenarlos antes de
   analizar**, o los tiempos del segundo pedazo salen corridos y todo el
   cruce con el reloj de `TomaDatos` queda mal. Con `ffmpeg`:

   ```bash
   printf "file '%s'\n" GX01*.MP4 > lista.txt
   ffmpeg -f concat -safe 0 -i lista.txt -c copy periodo_PT.mp4
   ```

2. **Se calienta.** En resoluciones altas puede cortar sola antes de que
   termine el período. **Probá una grabación completa de 25 minutos con la
   alimentación conectada antes del primer partido en serio**, no el día del
   partido.

---

## Segunda cámara (opcional, más adelante)

Solo si en algún momento se quiere automatizar los cambios. Apunta a la zona
de sustituciones de 5 m del propio banco, encuadre cerrado. Ahí el jugador
está cerca y lento y el dorsal **sí** es legible.

Si se usan dos cámaras, el aplauso de sincronización pasa a ser obligatorio:
es lo que permite alinear los dos archivos por la pista de audio.

**No es necesario para el v1.** Los cambios siguen siendo manuales.

---

## Presupuesto de cámara

Órdenes de magnitud, a verificar contra precios actuales:

| Opción | Costo aprox. | Resultado esperable |
|---|---|---|
| Celular viejo + trípode alto + soporte de pared | USD 0–150 | Suficiente para validar el pipeline; techo bajo |
| Cámara de acción gran angular 4K fija | USD 250–500 | **Punto dulce.** Es la recomendada para el v1 |
| Cámara IP / PTZ de seguridad 4K montada fija | USD 300–700 | Buena si el club puede cablear el gimnasio |
| Sistema automático tipo Veo / Pixellot | USD 1.200+ y suscripción | Cómodo, pero pagás por un análisis que estás construyendo vos |

Nota práctica: muchas cámaras de acción sobrecalientan y cortan la grabación
a los 20–30 minutos en 4K. Probar una grabación completa de 25 minutos
**antes** del primer partido real, con alimentación conectada.

---

## Checklist de un partido

```
[ ] Cámara en la posición marcada, altura ≥ 4 m
[ ] Cancha completa en cuadro + margen
[ ] Exposición / WB / foco bloqueados en manual
[ ] 4K o 1080p, ≥ 30 fps, obturador ≥ 1/250
[ ] Audio encendido y sin obstrucción
[ ] Batería y tarjeta con espacio para 2 períodos
[ ] Alimentación conectada (sobrecalentamiento)
[ ] 30 s de cancha vacía grabados
[ ] Aplauso de sincronización al arrancar el reloj de TomaDatos
[ ] Grabación arrancada antes del saque inicial
[ ] Archivos renombrados con la convención
```
