#!/usr/bin/env python3
"""Genera voces (espeak-ng), música y efectos para "Copito y la Estrella".

Salidas (en ../build):
  soundtrack.wav  - mezcla final estéreo 48 kHz, 35 s
  timeline.json   - tiempos de diálogo + envolventes de boca por cuadro (30 fps)
"""
import json, os, subprocess, wave
import numpy as np

SR = 48000
DUR = 35.0
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "..", "build")
os.makedirs(BUILD, exist_ok=True)
N = int(SR * DUR)
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- utilidades
def read_wav(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(1)
    if sr != SR:
        t_old = np.arange(len(x)) / sr
        t_new = np.arange(int(len(x) * SR / sr)) / SR
        x = np.interp(t_new, t_old, x).astype(np.float32)
    return x

def write_wav(path, stereo):
    s = np.clip(stereo, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((s * 32767).astype(np.int16).tobytes())

def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l = np.sqrt(0.5 * (1 - pan)); r = np.sqrt(0.5 * (1 + pan))
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r

def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n) * s
    e[t < a] = t[t < a] / a
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / d
    rel = t > total - r
    e[rel] *= np.clip((total - t[rel]) / r, 0, 1)
    return e

def lowpass(x, cutoff):
    # one-pole low-pass, vectorised via lfilter-like recursion in numpy chunks
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y

def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- voces
LINES = [
    # (id, personaje, inicio, texto, voz, tono espeak, velocidad, semitonos extra)
    ("l1", "copito", 1.0, "¡Algún día voy a tocar una estrella!", "es-419+f2", 85, 155, 3.0),
    ("l2", "bear", 9.0, "¡Guau! ¿Un cohete?", "es-419+m3", 70, 150, 4.0),
    ("l3", "copito", 13.4, "¡Tres, dos, uno... despegue!", "es-419+f2", 90, 170, 3.0),
    ("l4", "star", 20.3, "Snif... estoy tan solita...", "es-419+f4", 60, 120, 2.0),
    ("l5", "copito", 24.4, "¡Nunca estarás sola, ahora somos amigos!", "es-419+f2", 85, 160, 3.0),
    ("l6", "copito", 29.6, "¡Los mejores sueños se cumplen cuando compartimos nuestro amor!", "es-419+f2", 85, 165, 3.0),
]

voice = np.zeros((N, 2), np.float32)
timeline = {"fps": FPS, "duration": DUR, "lines": [], "mouth": {}}
mouth = {c: np.zeros(int(DUR * FPS) + 1) for c in ("copito", "bear", "star")}
for lid, who, t0, text, v, p, s, semis in LINES:
    raw = os.path.join(BUILD, f"{lid}_raw.wav")
    out = os.path.join(BUILD, f"{lid}.wav")
    subprocess.run(["espeak-ng", "-v", v, "-p", str(p), "-s", str(s), "-w", raw, text], check=True)
    # voz tierna: subir tono, calidez y un poco de reverb
    subprocess.run(["sox", raw, "-r", str(SR), out, "gain", "-6", "pitch", str(int(semis * 100)),
                    "bass", "-4", "treble", "+2", "lowpass", "7000",
                    "reverb", "18", "50", "60", "norm", "-3"], check=True)
    x = read_wav(out)
    pan = {"copito": 0.0, "bear": -0.25, "star": 0.2}[who]
    place(voice, x, t0, 0.95, pan)
    dur = len(x) / SR
    timeline["lines"].append({"id": lid, "who": who, "start": t0, "end": t0 + dur, "text": text})
    # envolvente de boca por cuadro
    hop = SR // FPS
    for k in range(int(dur * FPS)):
        seg = x[k * hop:(k + 1) * hop]
        if len(seg) == 0:
            break
        f = int(round(t0 * FPS)) + k
        if f < len(mouth[who]):
            mouth[who][f] = max(mouth[who][f], float(np.sqrt((seg ** 2).mean())))
    print(f"{lid}: {t0:.2f}-{t0+dur:.2f}s  {text}")
for c in mouth:
    m = mouth[c]
    if m.max() > 0:
        m = np.clip(m / (np.percentile(m[m > 0], 90) + 1e-6), 0, 1)
    timeline["mouth"][c] = [round(float(v), 3) for v in m]

# ---------------------------------------------------------------- música
music = np.zeros((N, 2), np.float32)
BPM = 120
BEAT = 60 / BPM

def pluck(freq, dur, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.exp(-t * (5 / dur))
    s = np.sin(2 * np.pi * freq * t) + 0.35 * bright * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 8) \
        + 0.12 * bright * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 14)
    a = np.minimum(t / 0.004, 1)
    return (s * e * a).astype(np.float32)

def bell(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6)
         + 0.25 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 12))
    return (s * np.exp(-t * 3.2) * np.minimum(t / 0.002, 1)).astype(np.float32)

def pad(freqs, dur, bright=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            s += np.sin(2 * np.pi * ff * t + rng.uniform(0, 6)) + bright * 0.3 * np.sin(4 * np.pi * ff * t)
    s /= len(freqs) * 3
    return (s * env_adsr(n, a=min(0.5, dur / 3), d=0.2, s=0.85, r=min(0.6, dur / 3))).astype(np.float32)

def kick():
    n = int(0.25 * SR); t = np.arange(n) / SR
    f = 120 * np.exp(-t * 22) + 45
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)).astype(np.float32)

def hat(dur=0.05):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    x = x - np.concatenate([[0], x[:-1]])  # high-pass-ish
    return (x * np.exp(-np.arange(n) / SR * 70) * 0.25).astype(np.float32)

def snare():
    n = int(0.18 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t * 22) * 0.5 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return x.astype(np.float32)

# Secciones: (inicio, fin, acordes [raíz midi, tipo], carácter)
C, D, E, F, G, A = 60, 62, 64, 65, 67, 69
MAJ, MIN = (0, 4, 7), (0, 3, 7)
SECTIONS = [
    (0.0, 6.5, [(C, MAJ), (A - 12, MIN), (F - 12, MAJ), (G - 12, MAJ)], "dream"),
    (6.5, 13.0, [(C, MAJ), (F - 12, MAJ), (G - 12, MAJ), (C, MAJ)], "build"),
    (13.0, 19.0, [(F - 12, MAJ), (G - 12, MAJ), (A - 12, MIN), (G - 12, MAJ)], "launch"),
    (19.0, 24.3, [(A - 12, MIN), (F - 12, MAJ), (D - 12, MIN), (E - 12, MAJ)], "sad"),
    (24.3, 29.3, [(F - 12, MAJ), (G - 12, MAJ), (E - 12, MIN), (A - 12, MIN)], "tender"),
    (29.3, 35.0, [(C, MAJ), (G - 12, MAJ), (A - 12, MIN), (F - 12, MAJ), (C, MAJ)], "finale"),
]
MELODY_PATTERNS = {
    "dream": [0, 2, 4, 2, 1, 2, 4, 5],
    "build": [0, 1, 2, 4, 2, 1, 0, 4],
    "launch": [0, 2, 4, 6, 4, 2, 4, 7],
    "sad": [4, -1, 2, -1, 1, -1, 0, -1],
    "tender": [2, -1, 4, 2, 1, -1, 0, -1],
    "finale": [0, 2, 4, 7, 6, 4, 5, 7],
}

for (s0, s1, chords, mood) in SECTIONS:
    secdur = s1 - s0
    cd = secdur / len(chords)
    for ci, (root, kind) in enumerate(chords):
        t0 = s0 + ci * cd
        tones = [root + k for k in kind]
        loud = {"dream": .5, "build": .6, "launch": .7, "sad": .45, "tender": .55, "finale": .75}[mood]
        place(music, pad([midi(m) for m in tones] + [midi(root - 12)], cd + 0.4,
                         bright=0.8 if mood in ("launch", "finale") else 0.3), t0, 0.16 * loud)
        # bajo
        if mood not in ("sad",):
            for b in range(int(cd / BEAT + 0.01)):
                if b % 2 == 0 or mood in ("launch", "finale"):
                    place(music, pluck(midi(root - 24), BEAT * 1.5, 0.3), t0 + b * BEAT, 0.28 * loud)
        # arpegio / caja de música
        step = BEAT / 2 if mood not in ("sad", "tender") else BEAT
        arp = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[1] + 12]
        k = 0; tt = t0
        while tt < t0 + cd - 0.01:
            m = arp[k % 4]
            snd = bell(midi(m + 12), 1.2) if mood in ("sad", "dream", "tender") else pluck(midi(m), 0.6)
            place(music, snd, tt, 0.07 * loud, pan=0.3 * np.sin(k))
            k += 1; tt += step
        # melodía
        scale = [0, 2, 4, 5, 7, 9, 11, 12, 14]
        pat = MELODY_PATTERNS[mood]
        mstep = cd / len(pat)
        base = 72 if mood != "sad" else 69
        for j, deg in enumerate(pat):
            if deg < 0:
                continue
            if mood == "sad":
                sc = [0, 2, 3, 5, 7, 8, 10, 12, 14]
            else:
                sc = scale
            note = base + sc[deg % len(sc)] + (root - 60 if mood != "sad" else root - 57) // 12 * 0
            # mantener la melodía dentro del acorde en tiempos fuertes
            if j % 2 == 0:
                note = min(tones, key=lambda q: abs((q + 12) - note)) + 12
            place(music, pluck(midi(note), mstep * 1.6, 1.2), t0 + j * mstep, 0.10 * loud, pan=-0.15)
        # batería
        if mood in ("build", "launch", "finale"):
            for b in range(int(cd / BEAT + 0.01)):
                tb = t0 + b * BEAT
                if mood != "build" or b % 2 == 0:
                    place(music, kick(), tb, 0.35)
                place(music, hat(), tb + BEAT / 2, 0.5)
                place(music, hat(0.03), tb, 0.25)
                if mood in ("launch", "finale") and b % 2 == 1:
                    place(music, snare(), tb, 0.18)
# acorde final y destello
place(music, pad([midi(m) for m in (60, 64, 67, 72, 76)], 3.0, 0.6), 33.0, 0.12)
for i, m in enumerate([84, 88, 91, 96]):
    place(music, bell(midi(m), 2.0), 32.6 + i * 0.12, 0.08)

# ---------------------------------------------------------------- efectos
sfx = np.zeros((N, 2), np.float32)

def twinkle(n_notes=6, base=88, gap=0.06):
    out = np.zeros(int((n_notes * gap + 1.2) * SR), np.float32)
    for i in range(n_notes):
        b = bell(midi(base + [0, 4, 7, 12, 16, 19, 24, 28][i % 8]), 1.0)
        j = int(i * gap * SR); out[j:j + len(b)] += b
    return out

def pop():
    n = int(0.12 * SR); t = np.arange(n) / SR
    f = 300 + 1600 * np.exp(-t * 40)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 35)).astype(np.float32)

def boing():
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 220 + 160 * np.sin(2 * np.pi * 9 * t) * np.exp(-t * 4) + 120 * t
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)).astype(np.float32)

def knock():
    n = int(0.09 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 60) + rng.standard_normal(n) * np.exp(-t * 90) * 0.4
    return x.astype(np.float32)

def whoosh(dur, f0=300, f1=3000):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # barrido de filtro: mezcla de lowpass a diferentes cortes por bloques
    out = np.zeros(n)
    blocks = 40
    for b in range(blocks):
        a, z = b * n // blocks, (b + 1) * n // blocks
        fc = f0 * (f1 / f0) ** (b / blocks)
        alpha = np.exp(-2 * np.pi * fc / SR)
        seg = noise[a:z]; y = np.empty_like(seg); acc = 0.0
        for i in range(len(seg)):
            acc = (1 - alpha) * seg[i] + alpha * acc; y[i] = acc
        out[a:z] = y
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.7
    return (out / (np.abs(out).max() + 1e-9) * e).astype(np.float32)

def rumble(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    x = lowpass(rng.standard_normal(n).astype(np.float32), 140)
    x = x / (np.abs(x).max() + 1e-9)
    e = np.minimum(t / 0.3, 1) * np.clip((dur - t) / 1.5, 0, 1)
    return (x * e).astype(np.float32)

def sniff():
    n = int(0.35 * SR); t = np.arange(n) / SR
    x = lowpass(rng.standard_normal(n).astype(np.float32), 2500)
    e = np.exp(-((t - 0.12) / 0.06) ** 2)
    return (x * e * 3).astype(np.float32)

def heart_chime():
    return twinkle(4, 79, 0.09)

def shimmer(dur):
    out = np.zeros(int((dur + 1.2) * SR), np.float32)
    k = 0; tt = 0.0
    while tt < dur:
        m = 84 + [0, 4, 7, 11, 12, 16, 19, 23][k % 8]
        b = bell(midi(m), 1.0); j = int(tt * SR); out[j:j + len(b)] += b * (0.6 + 0.4 * np.sin(k))
        k += 1; tt += 0.07
    return out

place(sfx, twinkle(), 0.15, 0.22, 0.4)          # estrella fugaz de apertura
place(sfx, shimmer(1.0), 3.6, 0.10, -0.3)        # brillo estrellas
place(sfx, whoosh(0.5, 800, 5000), 6.3, 0.18)    # transición
# construcción del cohete: piezas que aparecen
for i, tp in enumerate([6.9, 7.35, 7.8, 8.25, 8.7, 10.6, 10.95, 11.3, 11.65, 12.0]):
    place(sfx, pop(), tp, 0.35, pan=(-0.4 if i % 2 else 0.4))
    place(sfx, knock(), tp + 0.05, 0.25)
place(sfx, boing(), 8.95, 0.30, -0.3)            # osito salta sorprendido
place(sfx, rumble(6.0), 15.2, 0.55)              # motor
place(sfx, whoosh(3.2, 200, 4000), 15.4, 0.35)
place(sfx, shimmer(3.0), 15.6, 0.10, 0.2)        # estela mágica
place(sfx, whoosh(1.0, 1500, 300), 18.6, 0.2)    # llegada
place(sfx, sniff(), 19.6, 0.25, 0.2)
place(sfx, sniff(), 22.6, 0.22, 0.2)
place(sfx, heart_chime(), 26.9, 0.20)            # abrazo
place(sfx, whoosh(1.4, 200, 6000), 28.7, 0.25)   # estrella se ilumina
place(sfx, shimmer(4.5), 29.0, 0.12)
place(sfx, twinkle(8, 84, 0.08), 33.4, 0.18, -0.4)

# ---------------------------------------------------------------- mezcla
voice_env = np.abs(voice).max(1)
voice_env = np.convolve(voice_env, np.ones(SR // 10) / (SR // 10), mode="same")
duck = 1 - 0.45 * np.clip(voice_env * 6, 0, 1)
mix = music * duck[:, None] * 0.9 + sfx * 0.9 + voice * 1.0
# fades
t = np.arange(N) / SR
mix *= np.minimum(t / 0.15, 1)[:, None] * np.clip((DUR - t) / 0.8, 0, 1)[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.abs(mix).max() / 0.92
write_wav(os.path.join(BUILD, "soundtrack.wav"), mix)
with open(os.path.join(BUILD, "timeline.json"), "w") as f:
    json.dump(timeline, f)
print("ok: soundtrack.wav, timeline.json")
