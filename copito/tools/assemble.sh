#!/usr/bin/env bash
# Une cuadros + banda sonora. Uso: tools/assemble.sh <carpeta_cuadros> <salida.mp4>
set -euo pipefail
FR=$1; OUT=$2; HERE=$(cd "$(dirname "$0")/.." && pwd)
# Master 4K vertical (2160x3840): reescalado lanczos desde 1080x1920 + nitidez suave
ffmpeg -y -loglevel error -framerate 30 -i "$FR/f%05d.jpg" -i "$HERE/build/soundtrack.wav" \
  -vf "scale=2160:3840:flags=lanczos,unsharp=5:5:0.4,format=yuv420p" \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level 5.1 -movflags +faststart \
  -c:a aac -b:a 256k -shortest "$OUT"
