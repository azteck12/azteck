#!/usr/bin/env python3
"""Episodio 5 — "¡El dragón con dolor de muela!"
Voces neuronales (Piper), música y efectos.  Salidas en ../build:
  ep5_soundtrack.wav, ep5_timeline.json
"""
import json, os, subprocess, wave
import numpy as np

SR, DUR, FPS = 48000, 35.0, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BUILD = os.path.join(ROOT, "build"); os.makedirs(BUILD, exist_ok=True)
MODELS = os.path.join(ROOT, "voices_models")
N = int(SR * DUR)
rng = np.random.default_rng(55)

def read_wav(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1: x = x.reshape(-1, ch).mean(1)
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) / SR, np.arange(len(x)) / sr, x).astype(np.float32)
    return x

def write_wav(path, st):
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(st, -1, 1) * 32767).astype(np.int16).tobytes())

def place(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= len(buf) or i < 0: return
    sig = sig[: len(buf) - i]
    buf[i:i + len(sig), 0] += sig * gain * np.sqrt(.5 * (1 - pan))
    buf[i:i + len(sig), 1] += sig * gain * np.sqrt(.5 * (1 + pan))

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def onepole(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y

# ------------------------------------------------------------------ voces (Piper)
VOICE = {
    # personaje: (modelo, semitonos, length_scale, noise_scale)
    "copito": ("es_AR-daniela-high", 3.5, 0.95, 0.7),
    "monster": ("es_MX-ald-medium", 4.0, 0.95, 0.7),
    "king": ("es_MX-claude-high", 1.5, 1.0, 0.75),
    "dragon": ("es_MX-claude-high", -5.0, 1.1, 0.6),
}
LINES = [
    ("l1", "dragon", 0.35, "¡Grrr! ¿Quién hizo tanto ruido?", None),
    ("l2", "copito", 3.2, "¡A correr, rápido!", None),
    ("l3", "dragon", 7.9, "¡Ay, ay, ay! ¡Mi muela!", None),
    ("l4", "copito", 10.5, "¡Le duele una muela!", None),
    ("l5", "king", 12.5, "¡Se comió todos los dulces!", None),
    ("l6", "copito", 16.1, "¡Dragón, abre la boca!", None),
    ("l7", "monster", 18.3, "¡Aquí está el cepillo!", None),
    ("l8", "dragon", 23.9, "¡Ya no me duele! ¡Gracias, amigos!", None),
    ("l9", "copito", 26.95, "¡Después de los dulces, a cepillarse los dientes!", None),
    ("l10", "copito", 31.4, "¿Y tú, te lavaste los dientes hoy?", None),
]

voice = np.zeros((N, 2), np.float32)
mouth = {c: np.zeros(int(DUR * FPS) + 1) for c in VOICE}
timeline = {"fps": FPS, "duration": DUR, "lines": [], "mouth": {}}
for lid, who, t0, text, ls in LINES:
    model, semis, lscale, nscale = VOICE[who]
    raw = os.path.join(BUILD, f"ep5_{lid}_raw.wav"); out = os.path.join(BUILD, f"ep5_{lid}.wav")
    if not (os.environ.get("KEEP_RAW") and os.path.exists(raw)):
      subprocess.run(["python3", "-m", "piper", "-m", os.path.join(MODELS, model + ".onnx"), "-f", raw,
                    "--length-scale", str(ls or lscale), "--noise-scale", str(nscale), "--noise-w-scale", "0.8"],
                   input=text.encode(), check=True, capture_output=True)
    fx = ["gain", "-4", "pitch", str(int(semis * 100)), "highpass", "90", "equalizer", "3000", "1.2q", "+3",
          "compand", "0.02,0.15", "-60,-60,-30,-14,-10,-6,0,-3", "-3"] + ({"dragon": ["bass", "+7", "overdrive", "2", "reverb", "40", "50", "80"], "king": ["reverb", "15", "50", "50"], "gummy": ["reverb", "20", "50", "60"]}.get(who, ["reverb", "12", "50", "40"])) + ["norm", "-2"]
    subprocess.run(["sox", raw, "-r", str(SR), out] + fx, check=True, capture_output=True)
    x = read_wav(out)
    place(voice, x, t0, 1.0, {"copito": -0.05, "monster": 0.12, "king": 0.08, "dragon": 0.0}[who])
    dur = len(x) / SR
    timeline["lines"].append({"id": lid, "who": who, "start": t0, "end": t0 + dur, "text": text})
    hop = SR // FPS
    for k in range(int(dur * FPS)):
        seg = x[k * hop:(k + 1) * hop]; f = int(round(t0 * FPS)) + k
        if len(seg) and f < len(mouth[who]): mouth[who][f] = max(mouth[who][f], float(np.sqrt((seg ** 2).mean())))
    print(f"{lid} {who:8s} {t0:5.2f}-{t0 + dur:5.2f}s  {text}")
for c, m in mouth.items():
    if m.max() > 0: m = np.clip(m / (np.percentile(m[m > 0], 90) + 1e-6), 0, 1)
    timeline["mouth"][c] = [round(float(v), 3) for v in m]
# comprobar que no se pisan
ls_ = sorted(timeline["lines"], key=lambda l: l["start"])
for a, b in zip(ls_, ls_[1:]):
    if a["end"] > b["start"] - 0.05: print(f"AVISO: {a['id']} termina {a['end']:.2f} y {b['id']} empieza {b['start']:.2f}")

# ------------------------------------------------------------------ instrumentos
BEAT = 0.5  # 120 bpm (el baile final va a tempo)
def pluck(f, d, bright=1.0):
    n = int(d * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .4 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 9) + .15 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t * 16)
    return (s * np.exp(-t * 5 / d) * np.minimum(t / .003, 1)).astype(np.float32)
def pizz(f, d=.25):
    n = int(d * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .5 * np.sin(4 * np.pi * f * t) + .2 * np.sin(6 * np.pi * f * t)
    return (s * np.exp(-t * 18) * np.minimum(t / .002, 1)).astype(np.float32)
def bell(f, d=1.2):
    n = int(d * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + .25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
    return (s * np.exp(-t * 3.2) * np.minimum(t / .002, 1)).astype(np.float32)
def pad(fs, d, bright=.4):
    n = int(d * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in fs:
        for det in (-.1, 0, .1):
            ff = f * 2 ** (det / 12); s += np.sin(2 * np.pi * ff * t + rng.uniform(0, 6)) + bright * .3 * np.sin(4 * np.pi * ff * t)
    s /= len(fs) * 3
    a = min(.3, d / 3); env = np.minimum(t / a, 1) * np.clip((d - t) / min(.5, d / 3), 0, 1)
    return (s * env).astype(np.float32)
def kick():
    n = int(.25 * SR); t = np.arange(n) / SR; f = 130 * np.exp(-t * 25) + 45
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 13)).astype(np.float32)
def hat(d=.05):
    n = int(d * SR); x = rng.standard_normal(n); x = x - np.concatenate([[0], x[:-1]])
    return (x * np.exp(-np.arange(n) / SR * 70) * .25).astype(np.float32)
def snare():
    n = int(.18 * SR); t = np.arange(n) / SR
    return (rng.standard_normal(n) * np.exp(-t * 22) * .5 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * .5).astype(np.float32)
def clap():
    n = int(.2 * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
    env = np.exp(-t * 30) + .6 * np.exp(-np.maximum(t - .012, 0) * 30) * (t > .012) + .4 * np.exp(-np.maximum(t - .024, 0) * 25) * (t > .024)
    return (onepole(x.astype(np.float32), 3000) * env * 1.5).astype(np.float32)

music = np.zeros((N, 2), np.float32)
MAJ, MIN = (0, 4, 7), (0, 3, 7)
def chord_tones(root, kind): return [root + k for k in kind]





# 0–4: ¡rugido! acordes graves de susto cómico y huida
for j, m in enumerate([40, 39, 34]): place(music, pad([midi(m), midi(m + 3), midi(m + 6), midi(m + 12)], .5 if j < 2 else 1.0, .9), .1 + j * .3, .22)
t = 2.4
while t < 4.0:
    place(music, pizz(midi([57, 60, 64, 60][int((t - 2.4) / .15) % 4] + 12)), t, .15); t += .15
for b in range(4): place(music, kick(), 2.4 + b * .4, .3)
# 4–7.8: escondidos — suspenso de puntillas
for i, m in enumerate([45, None, 48, None, 52, 51, 50, None] * 4):
    tt = 4.0 + i * .24
    if m and tt < 7.8: place(music, pizz(midi(m)), tt, .24, -.2)
    if i % 4 == 0 and tt < 7.8: place(music, pizz(midi(33), .4), tt, .3)
place(music, pad([midi(m) for m in (45, 48, 52)], 3.8, .2), 4.0, .09)
# 7.8–16: tristeza del dragón y decisión de Copito
for i, (r, kd) in enumerate([(57, MIN), (53, MAJ), (50, MIN), (52, MAJ), (53, MAJ)]):
    t0 = 7.9 + i * 1.6; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.8, .15 + (i >= 3) * .3), t0, .11)
    for s_, idx in enumerate([0, 1, 2, 1]): place(music, bell(midi(tones[idx] + 24), 1.3), t0 + s_ * .4, .05)
# 16–23: ¡a cepillar! música alegre y rápida con batería
party = [(60, MAJ), (65, MAJ), (67, MAJ), (60, MAJ)]
t0 = 16.0; i = 0
while t0 < 23.0:
    r, kd = party[i % 4]; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.1, .6), t0, .08)
    for s_ in range(8): place(music, pluck(midi([tones[0], tones[1], tones[2], tones[1] + 12][s_ % 4] + 12), .2, 1.2), t0 + s_ * .125, .06, .3 * np.sin(s_))
    place(music, pluck(midi(r - 24), .4, .3), t0, .28); place(music, pluck(midi(r - 24), .3, .3), t0 + .5, .2)
    for b in range(2):
        place(music, kick(), t0 + b * .5, .3); place(music, hat(.03), t0 + b * .5 + .25, .35)
        if b == 1: place(music, clap(), t0 + b * .5, .25)
    t0 += 1.0; i += 1
# 23.1: ¡diente brillante! destello
for j, m in enumerate([84, 88, 91, 96, 100]): place(music, bell(midi(m), 1.4), 23.1 + j * .05, .08)
place(music, pad([midi(m) for m in (48, 60, 64, 67, 72, 76)], 2.4, 1.0), 23.1, .16)
# 25.5–29: tierno (la lección)
for i, (r, kd) in enumerate([(65, MAJ), (67, MAJ), (64, MIN), (65, MAJ)]):
    t0 = 25.5 + i * .9; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.0, .4), t0, .09)
    for s_ in range(4): place(music, pluck(midi(tones[s_ % 3] + 12), .45), t0 + s_ * .225, .05)
# 29–35: ¡vuelo! épico y alegre
party = [(60, MAJ), (67, MAJ), (69, MIN), (65, MAJ)]
t0 = 29.0; i = 0
while t0 < 34.9:
    r, kd = party[i % 4]; tones = chord_tones(r, kd); d = 1.5
    place(music, pad([midi(m) for m in tones] + [midi(r - 12)], d + .2, .8), t0, .11)
    for s_, m in enumerate([72, 76, 79, 84, 83, 79] if i % 2 == 0 else [81, 79, 77, 76, 74, 79]): place(music, pluck(midi(m), .35, 1.3), t0 + s_ * .25, .085, -.15)
    for b in range(3):
        place(music, kick(), t0 + b * .5, .3); place(music, hat(), t0 + b * .5 + .25, .35)
    t0 += d; i += 1
place(music, pad([midi(m) for m in (60, 64, 67, 72, 76)], 1.6, .8), 33.4, .14)
for j, m in enumerate([84, 88, 91, 96]): place(music, bell(midi(m), 2.0), 33.6 + j * .1, .07)

# ------------------------------------------------------------------ efectos
sfx = np.zeros((N, 2), np.float32)
def noise(n): return rng.standard_normal(n).astype(np.float32)
def sweep_noise(d, f0, f1):
    n = int(d * SR); x = noise(n); out = np.zeros(n, np.float32); blocks = 30
    for b in range(blocks):
        a, z = b * n // blocks, (b + 1) * n // blocks
        out[a:z] = onepole(x[a:z], f0 * (f1 / f0) ** (b / blocks))
    tt = np.arange(n) / SR
    return out / (np.abs(out).max() + 1e-9) * np.sin(np.pi * np.clip(tt / d, 0, 1)) ** .6
def boing(f0=220):
    n = int(.45 * SR); t = np.arange(n) / SR
    f = f0 + 150 * np.sin(2 * np.pi * 10 * t) * np.exp(-t * 5) + 150 * t
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)).astype(np.float32)
def boom():
    n = int(1.2 * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-t * 4) + 30) / SR) * np.exp(-t * 3) + onepole(noise(n), 400) * np.exp(-t * 6) * 3
    return (s / np.abs(s).max()).astype(np.float32)
def pop():
    n = int(.1 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(300 + 1500 * np.exp(-t * 40)) / SR) * np.exp(-t * 35)).astype(np.float32)
def step():
    n = int(.06 * SR); t = np.arange(n) / SR
    return (onepole(noise(n), 900) * np.exp(-t * 60) * 3).astype(np.float32)
def slurp(d):
    n = int(d * SR); t = np.arange(n) / SR
    f = 300 + 250 * np.sin(2 * np.pi * 3 * t) + 200 * t
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (.5 + .5 * np.sin(2 * np.pi * 7 * t)) * .5 + onepole(noise(n), 1500) * .6
    return (s * np.minimum(t / .1, 1) * np.clip((d - t) / .3, 0, 1)).astype(np.float32)
def shimmer(d, base=84):
    out = np.zeros(int((d + 1.2) * SR), np.float32); k = 0; tt = 0.0
    while tt < d:
        b = bell(midi(base + [0, 4, 7, 11, 12, 16, 19, 23][k % 8]), 1.0); j = int(tt * SR); out[j:j + len(b)] += b * (.6 + .4 * np.sin(k)); k += 1; tt += .06
    return out
def sniff():
    n = int(.35 * SR); t = np.arange(n) / SR
    return (onepole(noise(n), 2500) * np.exp(-((t - .12) / .06) ** 2) * 3).astype(np.float32)
def hiccup():
    n = int(.25 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(500 + 700 * np.exp(-t * 20)) / SR) * np.exp(-t * 15)).astype(np.float32)

def rumble(d):
    n = int(d * SR); x = onepole(noise(n), 90); x = x / (np.abs(x).max() + 1e-9)
    tt = np.arange(n) / SR
    return (x * np.minimum(tt / .2, 1) * np.clip((d - tt) / .5, 0, 1)).astype(np.float32)
def roar(d):
    n = int(d * SR); t = np.arange(n) / SR
    f = 70 + 30 * np.sin(2 * np.pi * 7 * t) + 40 * np.exp(-t * 2)
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * .4 + onepole(noise(n), 700) * 1.2
    return (onepole(s.astype(np.float32), 1200) * np.minimum(t / .08, 1) * np.clip((d - t) / .4, 0, 1) * 1.6).astype(np.float32)
def scrub(d):
    n = int(d * SR); t = np.arange(n) / SR
    return (onepole(noise(n), 4000) * (.5 + .5 * np.sin(2 * np.pi * 6 * t)) ** 2 * .9).astype(np.float32)
def flap():
    n = int(.35 * SR); t = np.arange(n) / SR
    return (onepole(noise(n), 400) * np.sin(np.pi * t / .35) * 2).astype(np.float32)
place(sfx, roar(1.6), 0.05, .55)                              # ¡rugido!
place(sfx, boom(), 2.0, .55); place(sfx, rumble(1.0), 2.0, .5)   # aterriza
for k2 in range(14): place(sfx, step(), 2.5 + k2 * .11, .22, np.sin(k2))   # todos corren
for tb in (4.4, 5.6, 6.8): place(sfx, boom()[: int(.35 * SR)], tb, .35); place(sfx, rumble(.5), tb, .3)   # pisotones
place(sfx, roar(.8), 5.9, .3)
for ts in (9.2, 10.2, 14.0): place(sfx, sniff(), ts, .35, .1)
for k2 in range(6): place(sfx, step(), 14.4 + k2 * .25, .18)  # Copito se acerca
place(sfx, pop(), 18.2, .3); place(sfx, shimmer(.5, 91), 18.3, .08)
place(sfx, scrub(4.0), 19.4, .35)                              # ¡cepillando!
for k2 in range(16): place(sfx, pop(), 19.6 + k2 * .22, .12, np.sin(k2))   # burbujas
place(sfx, shimmer(1.4, 91), 23.05, .16)                       # ¡ding! diente brillante
place(sfx, boing(240), 24.4, .2)
for k2 in range(6): place(sfx, flap(), 28.9 + k2 * .55, .3)    # alas
place(sfx, sweep_noise(3.0, 300, 3000), 29.3, .2)
place(sfx, shimmer(1.2, 91), 33.7, .12, -.2)

# ------------------------------------------------------------------ mezcla
venv = np.convolve(np.abs(voice).max(1), np.ones(SR // 10) / (SR // 10), mode="same")
duck = 1 - .5 * np.clip(venv * 6, 0, 1)
mix = music * duck[:, None] * .9 + sfx * duck[:, None] ** .5 * .85 + voice * 1.1
tt = np.arange(N) / SR
mix *= np.minimum(tt / .05, 1)[:, None] * np.clip((DUR - tt) / .6, 0, 1)[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= np.abs(mix).max() / .93
write_wav(os.path.join(BUILD, "ep5_soundtrack.wav"), mix)
json.dump(timeline, open(os.path.join(BUILD, "ep5_timeline.json"), "w"))
print("ok")

