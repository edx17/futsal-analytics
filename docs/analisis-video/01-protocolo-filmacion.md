# Protocolo de filmación

> **Versión 0.1 — BORRADOR.**

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
