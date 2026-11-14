# Analizador de video (prueba local)

Primera prueba del análisis de partidos por IA (ver `docs/ANALISIS_VIDEO_IA.md`).
Toma un tramo de un partido y te devuelve:

- **resultado.mp4**: el video con cada jugador marcado (verde = equipo A, rojo = equipo B,
  gris = árbitros y arqueros con otro color, amarillo = pelota) y, abajo, el **radar 2D** de la cancha;
- **mapas de calor** de cada equipo y de la pelota;
- **jugadores.csv**: distancia, metros por minuto, velocidad máxima y media, y sprints de cada seguimiento;
- **informe.html**: todo junto, más los números para evaluar la calidad;
- **datos.json**: las posiciones en metros, cuadro por cuadro.

Todavía no escribe nada en la app ni en la base: es para ver si con nuestras cámaras alcanza.

---

## 1. Instalar (una sola vez, en Windows)

1. **Python 3.11 o 3.12** desde https://www.python.org/downloads/. En el instalador tildá **"Add python.exe to PATH"**.
2. **ffmpeg** (para cortar el video). En una terminal:
   ```
   winget install Gyan.FFmpeg
   ```
   Cerrá y volvé a abrir VS Code después.
3. **Traer el código.** En VS Code, con la carpeta del repo abierta, abrí la terminal (`Ctrl` + `ñ`) y:
   ```
   git fetch origin
   git checkout main
   git pull
   ```
   (Si el PR todavía no está mergeado: `git checkout claude/awesome-bohr-0hnpkl` y `git pull`.)
4. **Crear el entorno de Python:**
   ```
   cd analizador
   python -m venv .venv
   .venv\Scripts\activate
   ```
   Fijate la versión con `python --version`. Si es **3.13 o más nueva**, torch puede no instalarse:
   instalá además Python 3.12 y creá el entorno con esa versión:
   ```
   py -3.12 -m venv .venv
   ```
   Si PowerShell dice que no puede ejecutar scripts, corré una vez
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y repetí la última línea.
5. **Instalar torch.** Para saber si tenés placa NVIDIA: corré `nvidia-smi`. Si muestra una tabla, tenés.
   - **Con placa NVIDIA:**
     ```
     pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
     ```
   - **Sin placa:**
     ```
     pip install torch torchvision
     ```
6. **El resto:**
   ```
   pip install -r requirements.txt
   ```

La primera vez que corre baja el modelo (unos 130 MB).

**Para verificar que quedó todo instalado** (con el entorno activado; tiene que imprimir dos versiones, sin errores):
```
python -c "import torch, cv2; print(torch.__version__, cv2.__version__)"
```

## 2. Correr la prueba con el partido vs 25 de Mayo (Tercera, 22/09)

En el resumen ese partido tiene el PT en el segundo 5 del video. Arrancamos un minuto
después y analizamos 5 minutos:

```
python analizar.py --video "https://youtu.be/M0JUKcmyOWc" --desde 65 --duracion 300 --salida resultados/25demayo
```

Sin placa NVIDIA va a tardar bastante: probá primero con menos cuadros y un modelo más liviano,

```
python analizar.py --video "https://youtu.be/M0JUKcmyOWc" --desde 65 --duracion 120 --fps 5 --modelo small --salida resultados/25demayo_corto
```

### La calibración (la ventana que se abre)

Para pasar de píxeles a metros, el programa necesita saber dónde está la cancha en la imagen.
Se abre un cuadro del video y arriba te dice qué punto marcar:

| Tecla | Qué hace |
|---|---|
| **Clic** | Marca el punto que te pide |
| **S** | Ese punto no se ve: lo salteás |
| **Z** | Deshace el último |
| **ENTER** | Terminar (mínimo 4 puntos, mejor 6 u 8) |
| **ESC** | Salir |

- "Izquierda", "derecha", "lejana" y "cercana" son **como se ve en el video**.
- Marcá donde se cruzan las líneas, lo más preciso que puedas: un error de unos pocos
  píxeles en la otra punta de la cancha es casi un metro.
- Si las esquinas cercanas quedan fuera de cuadro, usá la mitad de cancha, el círculo central y los puntos penales.
- Al terminar te muestra **la cancha dibujada en amarillo encima del video**. Si las líneas
  caen sobre las de verdad, ENTER. Si no, R para rehacer.

La calibración queda guardada en la carpeta de resultados (`calibracion.json`). Para reusarla
con otro tramo del mismo video: `--calib resultados/25demayo/calibracion.json`.

### Todas las opciones

| Opción | Para qué | Por defecto |
|---|---|---|
| `--video` | Link de YouTube/Vimeo/Drive, o un archivo `.mp4` | — |
| `--desde` | Segundo del video donde empezar | 0 |
| `--duracion` | Cuántos segundos analizar (0 = hasta el final) | 300 |
| `--salida` | Carpeta de resultados | resultados/prueba |
| `--calib` | Reusar una calibración | — |
| `--fps` | Cuadros por segundo que se analizan. 10 alcanza para jugadores; 25 ayuda con la pelota | 10 |
| `--modelo` | `nano`, `small` o `medium` (más grande = más preciso y más lento) | medium |

## 3. Qué mirar y qué mandarme

Al terminar se abre `informe.html`. Arriba hay cinco números:

| Número | Qué significa | Lo ideal |
|---|---|---|
| Jugadores por cuadro A / B | Cuántos detecta de cada equipo, en promedio | cerca de 5 / 5 |
| Otros por cuadro | Árbitros y arqueros con otro color | 2 a 4 |
| Cuadros con la pelota | En qué % de los cuadros la encontró | cuanto más, mejor (en esta etapa todavía no está entrenado para futsal) |
| Seguimientos de 3 s o más | En cuántos "pedazos" quedó cortado el seguimiento | cuanto más cerca de 12, mejor |
| Tiempo de proceso | Cuánto tardó tu compu | para estimar un partido entero |

**Mandame:**
1. Una captura del informe (los cinco números de arriba).
2. Una captura de `calibracion.jpg` (la cancha amarilla sobre el video).
3. Si podés, subí `resultado.mp4` a Drive y pasame el link.
4. Qué compu usaste y si tiene placa NVIDIA.

## Lo que esta prueba todavía NO hace (y está previsto)

- Saber **quién es quién**: cada número es un seguimiento, no un jugador. Se corta cuando dos
  se cruzan. En la versión final se une con los cambios de la toma en vivo y una revisión corta.
- Corregir la **deformación del lente** (la cámara de esquina gran angular).
- **Pases, contactos y cadenas**: dependen de la pelota, que es la etapa 2.
- Escribir en la app.

## Licencias

RF-DETR (Apache 2.0), trackers / ByteTrack (Apache 2.0), supervision (MIT), yt-dlp (Unlicense).
No se usa YOLO de Ultralytics (AGPL).
