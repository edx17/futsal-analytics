#!/usr/bin/env bash
# Pasa los cuadros renderizados (PNG) a video para la web y deja el póster.
#   cine/codificar.sh vdraft [carpeta_de_cuadros]
# Salida: public/cine/<variante>.webm (VP9), .mp4 (H.264, faststart) y .jpg.
set -euo pipefail
VAR="${1:?variante}"
CUADROS="${2:-/tmp/cine/$VAR}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SALIDA="$RAIZ/public/cine"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')}"
mkdir -p "$SALIDA"

# VP9: liviano para la web (Chrome, Firefox, Edge, Android).
"$FFMPEG" -hide_banner -loglevel error -y -framerate 30 -i "$CUADROS/%04d.png" \
  -c:v libvpx-vp9 -b:v 0 -crf 33 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p -an "$SALIDA/$VAR.webm"
# H.264: para Safari / iPhone.
"$FFMPEG" -hide_banner -loglevel error -y -framerate 30 -i "$CUADROS/%04d.png" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -movflags +faststart -an "$SALIDA/$VAR.mp4"
# Póster: el primer cuadro (se ve mientras carga).
"$FFMPEG" -hide_banner -loglevel error -y -i "$CUADROS/0001.png" -q:v 4 "$SALIDA/$VAR.jpg"
ls -la "$SALIDA/$VAR".*
