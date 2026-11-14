#!/usr/bin/env python3
"""Episodio 4 — "¡Los dulces cobraron vida!"
Voces neuronales (Piper), música y efectos.  Salidas en ../build:
  ep4_soundtrack.wav, ep4_timeline.json
"""
import json, os, subprocess, wave
import numpy as np

SR, DUR, FPS = 48000, 35.0, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BUILD = os.path.join(ROOT, "build"); os.makedirs(BUILD, exist_ok=True)
MODELS = os.path.join(ROOT, "voices_models")
N = int(SR * DUR)
rng = np.random.default_rng(44)

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
    "gummy": ("es_MX-claude-high", 5.0, 1.0, 0.6),
    "king": ("es_MX-claude-high", 1.5, 1.0, 0.75),
    "dragon": ("es_MX-claude-high", -6.0, 1.15, 0.6),
}
LINES = [
    ("l1", "gummy", 0.15, "¡Socorro! ¡Ayúdenme!", None),
    ("l2", "copito", 1.9, "¡¿Pero qué fue eso?!", None),
    ("l3", "monster", 4.3, "¡Una fábrica de dulces gigante!", None),
    ("l4", "king", 9.1, "¡Ahora todos los dulces son míos!", None),
    ("l5", "king", 11.45, "¡Atrapen a ese conejo!", None),
    ("l6", "copito", 13.1, "¡Corre, corre!", None),
    ("l7", "king", 17.5, "¡Nadie quiere compartir dulces conmigo!", None),
    ("l8", "copito", 21.9, "¡Si compartes, tendrás muchos amigos!", None),
    ("l9", "king", 25.4, "¡Dulces para todos!", None),
    ("l10", "dragon", 30.4, "¿Quién despertó al dragón de chocolate?", None),
    ("l11", "copito", 33.3, "¡Ay, no! ¡Un dragón!", None),
]

voice = np.zeros((N, 2), np.float32)
mouth = {c: np.zeros(int(DUR * FPS) + 1) for c in VOICE}
timeline = {"fps": FPS, "duration": DUR, "lines": [], "mouth": {}}
for lid, who, t0, text, ls in LINES:
    model, semis, lscale, nscale = VOICE[who]
    raw = os.path.join(BUILD, f"ep4_{lid}_raw.wav"); out = os.path.join(BUILD, f"ep4_{lid}.wav")
    if not (os.environ.get("KEEP_RAW") and os.path.exists(raw)):
      subprocess.run(["python3", "-m", "piper", "-m", os.path.join(MODELS, model + ".onnx"), "-f", raw,
                    "--length-scale", str(ls or lscale), "--noise-scale", str(nscale), "--noise-w-scale", "0.8"],
                   input=text.encode(), check=True, capture_output=True)
    fx = ["gain", "-4", "pitch", str(int(semis * 100)), "highpass", "90", "equalizer", "3000", "1.2q", "+3",
          "compand", "0.02,0.15", "-60,-60,-30,-14,-10,-6,0,-3", "-3"] + ({"dragon": ["bass", "+8", "overdrive", "4", "reverb", "60", "50", "100"], "king": ["reverb", "15", "50", "50"], "gummy": ["reverb", "20", "50", "60"]}.get(who, ["reverb", "12", "50", "40"])) + ["norm", "-2"]
    subprocess.run(["sox", raw, "-r", str(SR), out] + fx, check=True, capture_output=True)
    x = read_wav(out)
    place(voice, x, t0, 1.0, {"copito": -0.05, "monster": 0.12, "gummy": 0.3, "king": 0.08, "dragon": 0.0}[who])
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





# 0–4: aventura en el bosque, corte por el caramelo volador
for j, m in enumerate([72, 74, 76, 79, 76, 74, 72, 67]): place(music, pluck(midi(m), .35, 1.1), j * .11, .07, .2)
place(music, pad([midi(m) for m in (60, 64, 67)], .9, .5), 0, .12)
n = int(.8 * SR); t = np.arange(n) / SR
place(music, (np.sin(2 * np.pi * np.cumsum(180 + 900 * t) / SR) * np.exp(-t * 2) * .5).astype(np.float32), .9, .2)   # subida cómica
for i, (r, kd) in enumerate([(62, MIN), (58, MAJ), (60, MAJ)]):
    t0 = 1.9 + i * .7; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .8, .4), t0, .1)
    for s_ in range(4): place(music, pizz(midi(tones[s_ % 3] + 12)), t0 + s_ * .175, .14)
# 4–9: asombro (vals de caja de música para la fábrica)
prog = [(60, MAJ), (65, MAJ), (67, MAJ), (64, MIN), (65, MAJ), (67, MAJ), (60, MAJ)]
for i, (r, kd) in enumerate(prog):
    t0 = 4.0 + i * .72
    if t0 >= 9.0: break
    tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .8, .3), t0, .10)
    place(music, pizz(midi(r - 12), .4), t0, .22)
    for s_ in (1, 2): place(music, bell(midi(tones[s_] + 24), .9), t0 + s_ * .24, .05)
# 9–11.8: marcha del rey (villano cómico)
for i, m in enumerate([45, 45, 48, 45, 50, 49, 48, 47, 45, 45, 48, 45, 52, 51, 50, 49]):
    tt = 9.0 + i * .175
    if tt < 11.8: place(music, pizz(midi(m), .3), tt, .3)
    if i % 4 == 0 and tt < 11.8: place(music, kick(), tt, .3)
place(music, pad([midi(m) for m in (45, 48, 52)], 2.8, .5), 9.0, .1)
# 11.8–15.2: persecución rápida
prog = [(62, MIN), (58, MAJ), (60, MAJ), (57, MAJ)] * 2
for i, (r, kd) in enumerate(prog):
    t0 = 11.8 + i * .6
    if t0 >= 15.2: break
    tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .65, .7), t0, .09)
    for s_ in range(6): place(music, pluck(midi(tones[s_ % 3] + 12 + (12 if s_ >= 3 else 0)), .18, 1.2), t0 + s_ * .1, .065, .3 * np.sin(s_))
    place(music, pluck(midi(r - 24), .35, .3), t0, .3)
t = 11.8
while t < 15.2:
    place(music, kick(), t, .32); place(music, hat(.03), t + .15, .35); place(music, snare(), t + .3, .2); place(music, hat(.03), t + .45, .35)
    t += .6
# 15.2: resbalón (glissando abajo) y 16.3 golpe
n = int(1.0 * SR); t = np.arange(n) / SR
place(music, (np.sin(2 * np.pi * np.cumsum(900 * np.exp(-t * 2.5) + 120) / SR) * .4).astype(np.float32), 15.2, .2)
# 16.3–21.8: tenso → triste
place(music, pad([midi(m) for m in (45, 48, 51)], 1.2, .3), 16.3, .12)
for i, (r, kd) in enumerate([(57, MIN), (53, MAJ), (50, MIN)]):
    t0 = 17.4 + i * 1.5; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.7, .1), t0, .11)
    for s_, idx in enumerate([0, 1, 2, 1]): place(music, bell(midi(tones[idx] + 24), 1.3), t0 + s_ * .37, .05)
# 21.8–26.2: tierno que crece
for i, (r, kd) in enumerate([(53, MAJ), (55, MAJ), (57, MIN), (60, MAJ), (65, MAJ)]):
    t0 = 21.8 + i * .88; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones] + [midi(r + 12)], 1.0, .4 + i * .12), t0, .10 + i * .025)
    for s_ in range(4): place(music, pluck(midi(tones[s_ % 3] + 12), .45), t0 + s_ * .22, .055 + i * .01)
# 26.2: explosión de color
place(music, pad([midi(m) for m in (48, 60, 64, 67, 72, 76, 79, 84)], 2.8, 1.0), 26.2, .2)
for j, m in enumerate([84, 88, 91, 96, 100, 103]): place(music, bell(midi(m), 1.5), 26.22 + j * .05, .08)
# 27.5–30.3: fiesta
party = [(60, MAJ), (57, MIN), (65, MAJ), (67, MAJ)]
t0 = 27.5; i = 0
while t0 < 30.3:
    r, kd = party[i % 4]; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.1, .7), t0, .09)
    for s_ in range(4): place(music, pluck(midi([tones[0], tones[1], tones[2], tones[1] + 12][s_ % 4] + 12), .3, 1.1), t0 + s_ * .25, .065)
    for s_, m in enumerate([72, 76, 79, 76] if i % 2 == 0 else [74, 77, 81, 79]): place(music, pluck(midi(m), .3, 1.3), t0 + s_ * .25, .085, -.15)
    for b in range(2):
        place(music, kick(), t0 + b * .5, .35); place(music, hat(), t0 + b * .5 + .25, .4)
        if b == 1: place(music, clap(), t0 + b * .5, .3)
    t0 += 1.0; i += 1
# 30.3: ¡silencio! dron grave, latidos y "tan tan taaan"
n = int(4.7 * SR); t = np.arange(n) / SR
drone = (np.sin(2 * np.pi * 41 * t) + .6 * np.sin(2 * np.pi * 61.7 * t) + .3 * np.sin(2 * np.pi * 82 * t)) * np.minimum(t / .8, 1) * .5
place(music, drone.astype(np.float32), 30.3, .35)
for tb in np.arange(30.6, 33.4, .55): place(music, kick(), tb, .45); place(music, kick(), tb + .16, .3)
for j, m in enumerate([45, 44, 39]): place(music, pad([midi(m), midi(m + 3), midi(m + 6)], .9 if j < 2 else 1.6, .9), 33.0 + j * .32, .2)

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
    return (x * np.minimum(tt / .3, 1) * np.clip((d - tt) / .5, 0, 1)).astype(np.float32)
def squish():
    n = int(.18 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(500 - 1500 * t) / SR) * np.exp(-t * 18) * .6 + onepole(noise(n), 1200) * np.exp(-t * 25) * .5).astype(np.float32)
def creak(d):
    n = int(d * SR); t = np.arange(n) / SR
    return (np.sign(np.sin(2 * np.pi * (60 + 30 * np.sin(2 * np.pi * 2 * t)) * t)) * onepole(noise(n), 800) * .4 * np.sin(np.pi * t / d)).astype(np.float32)
place(sfx, sweep_noise(1.1, 300, 5000), .75, .5, -.3)        # caramelo volador
place(sfx, boing(260), 1.55, .3); place(sfx, boom()[: int(.5 * SR)], 1.75, .35, .4)
for k2 in range(16): place(sfx, step(), .0 + k2 * .25, .1, -.2 if k2 % 2 else .2)
place(sfx, shimmer(1.0, 88), 4.2, .1)
place(sfx, creak(1.0), 5.0, .3)                              # puertas
for k2 in range(30): place(sfx, squish(), 5.6 + k2 * .11, .12, np.sin(k2))   # gomitas marchando
place(sfx, shimmer(.6, 91), 7.3, .1)                         # corona
for k2 in range(26): place(sfx, step(), 11.8 + k2 * .13, .22, -.2 if k2 % 2 else .2)
for tj in (12.6, 13.8): place(sfx, boing(300), tj, .25)      # rebotes en gelatina
for k2 in range(12): place(sfx, squish(), 12.0 + k2 * .27, .14, np.sin(k2))
place(sfx, sweep_noise(1.0, 2500, 300), 15.2, .3)            # resbalón
place(sfx, boom()[: int(.4 * SR)], 16.3, .35)
for ts in (18.0, 19.6, 20.8): place(sfx, sniff(), ts, .3, .1)
place(sfx, sweep_noise(1.0, 200, 6000), 25.6, .3)
place(sfx, boom(), 26.2, .5); place(sfx, shimmer(2.4, 84), 26.2, .16)
for k2 in range(14): place(sfx, pop(), 26.3 + k2 * .09, .2, np.sin(k2))
place(sfx, rumble(4.6), 30.3, .7)                            # tiembla el suelo
place(sfx, boom()[: int(.8 * SR)], 30.35, .4)
place(sfx, rumble(1.0), 32.6, .5)

# ------------------------------------------------------------------ mezcla
venv = np.convolve(np.abs(voice).max(1), np.ones(SR // 10) / (SR // 10), mode="same")
duck = 1 - .5 * np.clip(venv * 6, 0, 1)
mix = music * duck[:, None] * .9 + sfx * duck[:, None] ** .5 * .85 + voice * 1.1
tt = np.arange(N) / SR
mix *= np.minimum(tt / .05, 1)[:, None] * np.clip((DUR - tt) / .6, 0, 1)[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= np.abs(mix).max() / .93
write_wav(os.path.join(BUILD, "ep4_soundtrack.wav"), mix)
json.dump(timeline, open(os.path.join(BUILD, "ep4_timeline.json"), "w"))
print("ok")

