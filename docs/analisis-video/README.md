# Análisis de video con IA — documentación

Módulo semiautomático de extracción de estadísticas a partir del video del
partido. La IA hace el trabajo tedioso; un operador corrige lo dudoso.

**El objetivo no es reemplazar al que carga los datos.** Es bajar la carga de
2–3 horas por partido a unos 20 minutos, con precisión medida y publicada.

## Documentos

| Doc | Qué define | Estado |
|---|---|---|
| [`00-diccionario-metricas.md`](00-diccionario-metricas.md) | Qué es exactamente cada métrica, quién la produce (IA / asistida / manual) y con qué precisión se acepta | v0.2 — **decisiones del CT cerradas** |
| [`01-protocolo-filmacion.md`](01-protocolo-filmacion.md) | Cómo se graba el partido para que el pipeline funcione | Borrador — **pendiente de prueba en cancha** |

## Estado del proyecto

- **Fase 0 — Definiciones y protocolo** ← acá estamos
  - [x] Borrador del diccionario de métricas
  - [x] Borrador del protocolo de filmación
  - [x] Revisión del CT: las 5 decisiones abiertas quedaron cerradas
  - [ ] Primer partido grabado con el protocolo
  - [ ] Set de control: 5 partidos codificados a mano
- **Fase 1 — Posiciones 2D**: detección, tracking, equipo, homografía, overlay
  de auditoría. Entrega heatmaps y mapa de ocupación.
- **Fase 2 — Pelota**: posesión y pases. El bloque más difícil y el que más
  valor aporta. Si esto no funciona con el material del club, el alcance del
  proyecto se recorta acá.
- **Fase 3 — Eventos**: remates, pérdidas, recuperaciones, tiempo neto con audio.
- **Fase 4 — UI de corrección.** Más corta de lo previsto: el esquema y los
  cálculos de `src/analytics/` ya existen, así que es UI de corrección y nada más.
- **Fase 5 — Validación** contra el set de control.

## Decisiones ya tomadas

1. **Semiautomático, no automático.** La IA propone, el humano confirma lo
   que importa.
2. **Identidad de jugador, cambios y quinteto siguen siendo manuales.** El
   cambio volante del futsal está por debajo del piso de lo que resuelve una
   cámara de cancha. `TomaDatos` ya lo captura perfecto y gratis.
3. **El tiempo neto por jugador sale del cruce** entre los cambios manuales y
   la pelota en juego detectada por IA. No requiere que la IA reconozca a
   nadie.
4. **Una métrica que no llega a su precisión objetivo no se publica.**
5. **La IA escribe en el esquema que ya existe.** `snapshots_posicionales`,
   `recorridos_jugador`, `eventos`, `secuencias_pase` y las fábricas de
   `src/offline/modelo.js` ya definen todo lo que el pipeline tiene que
   producir. Se distingue por `eventos.origen_captura = 'ia'`.
6. **La cancha se lee con la grilla del club** (Z1–Z4 × I/C/D de `modelo.js`).
   No se inventan tercios ni ninguna otra división.
7. **Licencia**: si el módulo se comercializa, no se usa Ultralytics YOLO
   (AGPL-3.0). Alternativas Apache/MIT: RF-DETR, RT-DETR, `supervision`.
   Decidir antes de escribir el pipeline, no después.

## Estado del código existente

`src/pages/VideoTracingIA.jsx` es un prototipo funcional: calibra 4 esquinas,
sube el video a Supabase Storage, llama a un backend Python en
`VITE_IA_API_URL`, mapea tracker-ids a dorsales y guarda en `tactical_analysis`.

Limitaciones conocidas a resolver en Fase 1:

- El `POST /analyze` es sincrónico: un partido tarda minutos y el request se
  va a caer. Necesita cola de trabajos con polling de estado.
- El mapeo de identidades se hace sobre un solo frame inicial. Con cambios
  volantes, esas identidades duran unos segundos.
- `frame_data` se guarda como un blob JSON por partido. A 30 fps × 40 min son
  ~72.000 frames: no escala como columna JSON.
- Las coordenadas del tracking no aplican la normalización ni el espejado que
  define `src/offline/modelo.js`. Guardadas así, los mapas de la IA salen
  invertidos respecto de los de `TomaDatos`.
- Escribe en `tactical_analysis`, una tabla propia, en vez de las tablas del
  modelo compartido (`snapshots_posicionales`, `recorridos_jugador`). Eso lo
  deja fuera de todo lo que ya calcula `src/analytics/`.
