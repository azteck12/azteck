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

## Episodio 2: ¡El monstruo que se robaba los colores!

**Video:** `output/copito_ep2_monstruo_colores_4k.mp4` (y versión 1080p)

| Tiempo | Escena |
|---|---|
| 0–4 s | Título y Copito jugando entre flores y mariposas. ¡PUM! Una ola gris se traga los colores: *“¡¿Qué está pasando?!”* |
| 4–9 s | Zoom rápido al monstruo morado de tres ojos con su mochila aspiradora, que chupa corrientes de colores: *“¡Ji, ji, ji! ¡Todos los colores son míos!”* |
| 9–15 s | Persecución: salta troncos, esquiva una piedra y atraviesa un arcoíris que se apaga: *“¡Alto ahí! ¡Devuelve los colores!”* |
| 15–22 s | *“¡Te atrapé!”* El monstruo llora: *“¡Solo quería tener colores porque nadie quiere jugar conmigo!”* |
| 22–29 s | *“¡No necesitas robar colores para tener amigos!”* Copito le ofrece la patita y una explosión mágica devuelve los colores. *“¿De verdad? ¡Qué alegría!”* |
| 29–35 s | El monstruo se transforma en un amigo arcoíris, bailan con el osito y Copito mira a cámara: *“¡Y tú también puedes ser nuestro amigo!”* Tarjeta final de COPITO TV. |

- Copito y el osito salen de `characters.js`, el mismo código del episodio 1 (apariencia idéntica).
- Voces neuronales Piper (`es_AR-daniela-high` para Copito, `es_MX-ald-medium` para el monstruo). Los modelos se descargan de Hugging Face (`rhasspy/piper-voices`) en `voices_models/`.
- `audio/pick_takes_ep2.py` genera varias tomas por frase y se queda con la que Whisper transcribe mejor; luego `KEEP_RAW=1 python3 audio/gen_audio_ep2.py` hace la mezcla.
- Render: `PAGE=ep2/index.html node tools/render.mjs frames_ep2 1080 1920 30 0 1050` y `tools/assemble.sh` con `build/ep2_soundtrack.wav`.

## Episodio 3: ¡La estrella que cayó del cielo!

**Video:** `output/copito_ep3_estrella_cayo_4k.mp4` (y versión 1080p)

| Tiempo | Escena |
|---|---|
| 0–4 s | Noche de fogata en el bosque. Un meteorito cruza el cielo y ¡PUM! cae entre los árboles: *“¡Miren! ¡Algo cayó del cielo!”* |
| 4–10 s | Corren al cráter y encuentran a la Estrella del episodio 1, pequeña y apagada: *“¡Me caí y ya no puedo volver a casa!”* |
| 10–16 s | *“¡Tranquila, nosotros te ayudamos!”* El monstruo arcoíris: *“¡Mi mochila ahora hace arcoíris!”* y lanza un camino de arcoíris al cielo. |
| 16–23 s | Suben todos por el arcoíris (*“¡Allá vamos!”*, dice el osito), pero en la cima la Estrella se apaga: *“¡Oh no, mi luz se está apagando!”* |
| 23–29 s | *“¡Todos juntos, un abrazo de amigos!”* El abrazo la hace brillar y sube volando: *“¡Gracias! ¡Brillo más que nunca!”* |
| 29–35 s | Fuegos artificiales con forma de corazón. Copito a cámara: *“¡Cuando nos ayudamos, todo es posible!”* Tarjeta final de COPITO TV. |

- La Estrella, el monstruo, Copito y el osito salen de `characters.js` (mismo código que los episodios anteriores).
- Voces Piper: Copito y la Estrella con `es_AR-daniela-high` (tonos y efectos distintos), el monstruo con `es_MX-ald-medium` y el osito con `es_MX-claude-high`.
- Audio: `python3 audio/pick_takes.py ep3` y luego `KEEP_RAW=1 python3 audio/gen_audio_ep3.py`.

## Episodio 4: ¡Los dulces cobraron vida!

**Video:** `output/copito_ep4_dulces_vida_4k.mp4` (y versión 1080p)

| Tiempo | Escena |
|---|---|
| 0–4 s | Copito y el monstruo pasean por el bosque. Una voz grita *“¡Socorro! ¡Ayúdenme!”* y un caramelo gigante pasa volando: *“¡¿Pero qué fue eso?!”* |
| 4–9 s | *“¡Una fábrica de dulces gigante!”* Las puertas se abren y salen 120 gomitas, chocolates y caramelos con ojos. Aparece el Rey Caramelo con su corona. |
| 9–15 s | *“¡Ahora todos los dulces son míos! ¡Atrapen a ese conejo!”* Persecución entre montañas de chocolate, un río de gelatina y piruletas gigantes: *“¡Corre, corre!”* |
| 15–22 s | Copito resbala por el río de chocolate y cae frente al rey, que llora: *“¡Nadie quiere compartir dulces conmigo!”* |
| 22–29 s | *“¡Si compartes, tendrás muchos amigos!”* *“¡Dulces para todos!”* Explosión de colores: la fábrica se vuelve un parque con noria y globos. |
| 29–35 s | Baile… tiembla el suelo, una sombra gigante y una voz grave: *“¿Quién despertó al dragón de chocolate?”* Copito: *“¡Ay, no! ¡Un dragón!”* — ¡Continuará! |

- Voces Piper: Copito (`es_AR-daniela-high`), monstruo (`es_MX-ald-medium`), Rey Caramelo, gomita y dragón (`es_MX-claude-high` con tono y efectos distintos; el dragón lleva graves, saturación y eco).

## Episodio 5: ¡El dragón con dolor de muela!

**Video:** `output/copito_ep5_dragon_muela_4k.mp4` (y versión 1080p)

| Tiempo | Escena |
|---|---|
| 0–4 s | Continúa el final del episodio 4: el dragón de chocolate ruge sobre la fábrica (*“¡Grrr! ¿Quién hizo tanto ruido?”*), salta a la plaza y todos huyen: *“¡A correr, rápido!”* |
| 4–10 s | Escondidos tras una barra de chocolate gigante. El dragón pisotea, ruge… y de pronto: *“¡Ay, ay, ay! ¡Mi muela!”* |
| 10–16 s | *“¡Le duele una muela!”* El rey, avergonzado: *“¡Se comió todos los dulces!”* Copito sale valiente. |
| 16–23 s | *“¡Dragón, abre la boca!”* El monstruo trae un cepillo gigante (*“¡Aquí está el cepillo!”*) y le cepillan los dientes entre burbujas. |
| 23–29 s | ¡Ding! La muela queda blanca y brillante: *“¡Ya no me duele! ¡Gracias, amigos!”* Copito: *“¡Después de los dulces, a cepillarse los dientes!”* |
| 29–35 s | El dragón los lleva volando sobre el mundo de dulces. Copito, de pie sobre su cabeza: *“¿Y tú, te lavaste los dientes hoy?”* Tarjeta de COPITO TV. |
