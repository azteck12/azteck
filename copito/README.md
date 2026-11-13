# Copito y la Estrella ⭐🐰

Cortometraje infantil en animación 3D (35 s, vertical 9:16), generado 100 % por código:
escena Three.js renderizada cuadro a cuadro, música y efectos sintetizados, y voces con TTS en español latino.

**Video final:** `output/copito_y_la_estrella_4k.mp4` (2160×3840, 30 fps, H.264 + AAC)

## Guion

| Tiempo | Escena |
|---|---|
| 0–6.5 s | Estrella fugaz. Copito mira el cielo desde su jardín: *“¡Algún día voy a tocar una estrella!”* |
| 6.5–13 s | Las piezas del cohete de cartón caen rebotando: cajas, aletas de juguete, globos, molinete y patito. El osito salta: *“¡Guau! ¿Un cohete?”* |
| 13–19 s | *“¡Tres, dos, uno… despegue!”* Humo, llama mágica y una estela de chispas arcoíris atraviesan las nubes hasta el espacio. |
| 19–24 s | Una estrella gigante llora: *“Snif… estoy tan solita…”*. Copito vuela hacia ella. |
| 24–29 s | Abrazo: *“¡Nunca estarás sola, ahora somos amigos!”* La estrella sonríe y salen corazones. |
| 29–35 s | La estrella brilla y llena el cielo de color: *“¡Los mejores sueños se cumplen cuando compartimos nuestro amor!”* Título y otra estrella fugaz que enlaza con el inicio, para verlo otra vez. |

## Cómo regenerarlo

Requisitos: Node 18+, Python 3 con numpy, ffmpeg, `espeak-ng` y `sox`, Playwright con Chromium.

```bash
npm install
python3 audio/gen_audio.py              # build/soundtrack.wav + build/timeline.json (sincronía labial)
python3 -m http.server 8123 &           # servir la carpeta
node tools/render.mjs frames 1080 1920 30 0 1050   # cuadros JPEG (se puede repartir en rangos paralelos)
tools/assemble.sh frames output/copito_y_la_estrella_4k.mp4
```

Vista previa en tiempo real: `http://localhost:8123/index.html?w=540&h=960&play=1`
Un cuadro concreto: `http://localhost:8123/index.html?t=26.5`

## Archivos

- `scene.js`: personajes (Copito, osito, estrella), cohete, jardín, cielo, partículas, cámara y subtítulos
- `audio/gen_audio.py`: voces, música (6 secciones según el ánimo) y efectos de sonido; mezcla con ducking bajo los diálogos
- `tools/render.mjs`, `tools/snap.mjs`: render por cuadros con Playwright
- `tools/assemble.sh`: une los cuadros y el audio en un MP4 4K

## Imágenes del canal COPITO TV

- `brand/copito_tv_perfil.png`: foto de perfil de 800×800 (el nombre queda dentro del recorte circular)
- `brand/copito_tv_banner.jpg`: banner de 2560×1440; el texto está dentro de la zona segura de 1546×423 que se ve en todos los dispositivos

Se generan con los mismos personajes 3D: `tools/still.mjs` renderiza los fondos (`brand/raw/`, parámetros `brand=1`, `cam=…`) y `tools/brand.mjs` compone los textos (`brand/compose.html`).
