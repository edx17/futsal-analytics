# futsal-ia — Fase 1

De un MP4 a posiciones sobre la cancha, en el mismo formato que llena un humano
en `TomaDatosOffline`.

## Qué hace y qué no

**Hace:** detecta personas, las sigue entre frames, decide de qué equipo son por
color, las proyecta al plano de la cancha, descarta lo que cae fuera (tribuna,
bancos, mesa de control) y escribe `snapshots_posicionales` y
`recorridos_jugador`. Entrega mapa de ocupación por celda Z1–Z4 × I/C/D y un
video de auditoría.

**No hace, a propósito:**

| | Por qué |
|---|---|
| Detectar la pelota | Fase 2. Objeto chico, rapidísimo y tapado la mitad del tiempo: necesita detector propio y modelo temporal |
| Contar pases y posesión | Fase 2, depende de la pelota |
| Reconocer jugadores | No se resuelve con video de cancha. Decisión registrada en el diccionario de métricas |
| Detectar cambios | Ídem. Sigue siendo manual en `TomaDatos`, que lo captura exacto |

## Instalación

```bash
cd ia
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
# 1. Ver qué puntos hay que marcar en la imagen
python -m futsal_ia.cli puntos

# 2. Calibrar (una vez por posición de cámara, no por partido)
python -m futsal_ia.cli calibrar \
    --marcas marcas.json --salida calibracion.json --resolucion 3840 2160

# 3. Ver qué precisión da esa posición de cámara, celda por celda
python -m futsal_ia.cli precision --calibracion calibracion.json

# 4. Analizar un período
python -m futsal_ia.cli analizar \
    --video 2026-09-14_primera_vs-SanLorenzo_PT.mp4 \
    --calibracion calibracion.json \
    --club <club_id> --partido <id_partido> --periodo PT \
    --lente-aproximada 3840 2160 \
    --salida analisis_PT.json \
    --overlay auditoria_PT.mp4
```

`marcas.json` es `{"esq_prop_izq": [u_px, v_px], ...}` con los píxeles que
clickeó el operador. En el segundo tiempo se agrega `--invertida`.

## Mirá el overlay antes de creerle al resumen

El resumen dice "1.847 detecciones, 23 tracks" tanto si el análisis salió bien
como si estuvo diez minutos siguiendo al técnico rival. Treinta segundos de
`auditoria_PT.mp4` te dicen en qué estado está. Qué mirar:

- Recuadros sobre la tribuna → falla el filtro de cancha.
- Puntos del radar donde no están los jugadores → falla la calibración.
- Colores de equipo que bailan → falla el clasificador, o la cámara tenía la
  exposición en automático.
- Números que saltan → el seguidor pierde identidades. En futsal es esperable;
  lo que importa es cuánto.

## Estado de verificación

Honestidad sobre qué está probado de verdad:

| Módulo | Estado |
|---|---|
| `cancha.py` | **Verificado.** 9 tests. La grilla Z1–Z4 × I/C/D se compara contra el `zonaDe()` real de `src/offline/modelo.js` corriéndolo con node sobre una grilla densa |
| `geometria.py` | **Verificado.** 17 tests contra una cámara sintética en un corner, de la que conocemos la respuesta correcta |
| `equipos.py` | **Verificado.** 12 tests de clustering de color |
| `salida.py` | **Verificado.** 13 tests; los campos se comparan contra `crearSnapshot()` y `crearRecorrido()` reales de modelo.js |
| `preproceso.py` | **Verificado.** 14 tests del giro y recorte determinista |
| `deteccion.py` | **Parcial.** El partido en mosaicos y la fusión están verificados (11 tests); el detector en sí necesita GPU y los pesos |
| `seguimiento.py` | **Sin ejecutar.** Necesita `supervision` instalado |
| `lente.py` | **Sin ejecutar.** Necesita OpenCV y un video real |
| `pipeline.py` | **Sin ejecutar de punta a punta.** La orquestación no se probó con un video |
| `overlay.py` | **Sin ejecutar.** |

Los verificados son el núcleo que decide si los números salen bien o
espejados. El resto se prueba recién con el primer partido filmado.

```bash
cd ia && python -m pytest tests/ -q     # 77 tests
```

## Decisiones que están en el código y conviene no olvidar

1. **Se proyectan los PIES**, el medio del borde inferior del recuadro, no el
   centro del cuerpo. Solo los pies están sobre el plano de la cancha.
2. **Homografía por mínimos cuadrados con 15 puntos**, no con 4. Con cuatro
   esquinas el residuo da siempre cero y engaña; con quince el error se reparte.
   Hay un test que lo mide.
3. **10 fps de análisis**, no los 60 del archivo. Un jugador de futsal se mueve
   menos de 80 cm entre frames a esa cadencia. La pelota sí va a necesitar la
   cadencia completa, pero eso es Fase 2.
4. **El equipo de cada track se decide por voto de mayoría**, no por el primer
   frame.
5. **El pipeline escribe un JSON, no toca Supabase.** Un análisis sin revisar no
   debería poder ensuciar la tabla de eventos del club.
6. **El giro y el recorte son un dato, no un paso manual.** Viajan en un JSON
   junto a la calibración y se aplican solos. Si el recorte saliera tres
   píxeles distinto un día, la homografía seguiría calculando sin fallar y
   todas las posiciones quedarían corridas para siempre.
7. **Primero se endereza la lente, después se encuadra.** Al revés no funciona:
   la corrección depende de dónde está el centro óptico del sensor, y recortar
   lo corre.
8. **El informe de precisión se calcula por período.** Con un arco cerca y otro
   lejos, la misma celda cambia de calidad hasta 8x entre tiempos.
9. **Detector RF-DETR (Apache 2.0) por defecto.** Ultralytics YOLO es AGPL-3.0 y
   está detrás de un aviso: si esto se comercializa, obliga a abrir el código
   del servicio o a pagar licencia.
