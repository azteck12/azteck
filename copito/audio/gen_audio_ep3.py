#!/usr/bin/env python3
"""Episodio 3 — "¡La estrella que cayó del cielo!"
Voces neuronales (Piper), música y efectos.  Salidas en ../build:
  ep3_soundtrack.wav, ep3_timeline.json
"""
import json, os, subprocess, wave
import numpy as np

SR, DUR, FPS = 48000, 35.0, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BUILD = os.path.join(ROOT, "build"); os.makedirs(BUILD, exist_ok=True)
MODELS = os.path.join(ROOT, "voices_models")
N = int(SR * DUR)
rng = np.random.default_rng(33)

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
    "star": ("es_AR-daniela-high", 0.8, 1.04, 0.6),
    "monster": ("es_MX-ald-medium", 4.0, 0.95, 0.7),
    "bear": ("es_MX-claude-high", 4.5, 0.95, 0.7),
}
LINES = [
    ("l1", "copito", 1.65, "¡Miren! ¡Algo cayó del cielo!", None),
    ("l2", "star", 6.3, "¡Me caí y ya no puedo volver a casa!", None),
    ("l3", "copito", 10.1, "¡Tranquila, nosotros te ayudamos!", None),
    ("l4", "monster", 12.3, "¡Mi mochila ahora hace arcoíris!", None),
    ("l5", "bear", 17.2, "¡Allá vamos!", None),
    ("l6", "star", 20.2, "¡Oh no, mi luz se está apagando!", None),
    ("l7", "copito", 23.0, "¡Todos juntos, un abrazo de amigos!", None),
    ("l8", "star", 27.0, "¡Gracias! ¡Brillo más que nunca!", None),
    ("l9", "copito", 31.3, "¡Cuando nos ayudamos, todo es posible!", None),
]

voice = np.zeros((N, 2), np.float32)
mouth = {c: np.zeros(int(DUR * FPS) + 1) for c in VOICE}
timeline = {"fps": FPS, "duration": DUR, "lines": [], "mouth": {}}
for lid, who, t0, text, ls in LINES:
    model, semis, lscale, nscale = VOICE[who]
    raw = os.path.join(BUILD, f"ep3_{lid}_raw.wav"); out = os.path.join(BUILD, f"ep3_{lid}.wav")
    if not (os.environ.get("KEEP_RAW") and os.path.exists(raw)):
      subprocess.run(["python3", "-m", "piper", "-m", os.path.join(MODELS, model + ".onnx"), "-f", raw,
                    "--length-scale", str(ls or lscale), "--noise-scale", str(nscale), "--noise-w-scale", "0.8"],
                   input=text.encode(), check=True, capture_output=True)
    fx = ["gain", "-4", "pitch", str(int(semis * 100)), "highpass", "90", "equalizer", "3000", "1.2q", "+3",
          "compand", "0.02,0.15", "-60,-60,-30,-14,-10,-6,0,-3", "-3"] + (["chorus", "0.7", "0.8", "40", "0.3", "0.25", "2", "-t", "reverb", "35", "50", "70"] if who == "star" else ["reverb", "12", "50", "40"]) + ["norm", "-2"]
    subprocess.run(["sox", raw, "-r", str(SR), out] + fx, check=True, capture_output=True)
    x = read_wav(out)
    place(voice, x, t0, 1.0, {"copito": -0.05, "monster": 0.12, "star": 0.05, "bear": -0.15}[who])
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


# 0–1.3: nana junto a la fogata (caja de música, noche)
for j, m in enumerate([76, 79, 84, 79, 81, 79, 76, 72]):
    place(music, bell(midi(m + 12), 1.2), j * .16, .07)
place(music, pad([midi(m) for m in (60, 64, 67)], 1.5, .3), 0, .12)
# 1.25: ¡impacto! golpe grave y silbido descendente antes
n = int(.9 * SR); t = np.arange(n) / SR
place(music, (np.sin(2 * np.pi * np.cumsum(2000 * np.exp(-t * 3) + 200) / SR) * np.minimum(t / .05, 1) * np.exp(-t * 1.5) * .3).astype(np.float32), .35, .25)
# 1.6–10: misterio y ternura (menor, pizzicato suave + pad)
prog = [(57, MIN), (53, MAJ), (55, MAJ), (52, MAJ)]
t0 = 1.6; i = 0
while t0 < 10.0:
    r, kd = prog[i % 4]; tones = chord_tones(r, kd); d = 2.1
    place(music, pad([midi(m) for m in tones], d + .2, .25), t0, .11)
    for s in range(8):
        tt = t0 + s * .26
        if tt < 10.0: place(music, pizz(midi(tones[s % 3] + (12 if s % 4 == 3 else 0))), tt, .13, .3 * np.sin(s))
    place(music, pizz(midi(r - 12), .4), t0, .25)
    t0 += d; i += 1
for j, m in enumerate([81, 84, 88]): place(music, bell(midi(m), 1.4), 5.65 + j * .08, .07)   # aparece la estrella
# 10–16: esperanza que crece, el arcoíris sale disparado (13.4)
for i, (r, kd) in enumerate([(53, MAJ), (55, MAJ), (57, MIN), (60, MAJ)]):
    t0 = 10.0 + i * .85; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .95, .4 + i * .1), t0, .10)
    for s in range(4): place(music, pluck(midi(tones[s % 3] + 12), .45), t0 + s * .21, .06 + i * .01)
place(music, pad([midi(m) for m in (48, 60, 64, 67, 72, 76)], 2.6, .9), 13.4, .16)
for j, m in enumerate([72, 76, 79, 84, 88, 91, 96, 100]): place(music, bell(midi(m), 1.0), 13.4 + j * .07, .07)
# 16–20: ¡viaje en arcoíris! rápido y alegre con batería
for i, (r, kd) in enumerate([(60, MAJ), (65, MAJ), (67, MAJ), (60, MAJ), (65, MAJ)]):
    t0 = 16.0 + i * .8
    if t0 >= 20.0: break
    tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .85, .7), t0, .09)
    for s in range(8): place(music, pluck(midi(tones[s % 3] + 12 + (12 if s >= 4 else 0)), .2, 1.2), t0 + s * .1, .06, .3 * np.sin(s))
    place(music, pluck(midi(r - 24), .4, .3), t0, .3)
t = 16.0
while t < 19.9:
    place(music, kick(), t, .3); place(music, hat(.03), t + .2, .35); place(music, snare(), t + .4, .18); place(music, hat(.03), t + .6, .35)
    t += .8
# 20–23: se apaga (triste)
for i, (r, kd) in enumerate([(57, MIN), (53, MAJ)]):
    t0 = 20.0 + i * 1.5; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.7, .1), t0, .11)
    for s, idx in enumerate([0, 1, 2, 1]): place(music, bell(midi(tones[idx] + 24), 1.3), t0 + s * .37, .05)
# 23–26: abrazo, crece
for i, (r, kd) in enumerate([(53, MAJ), (55, MAJ), (57, MIN), (55, MAJ)]):
    t0 = 23.0 + i * .75; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones] + [midi(r + 12)], .85, .4 + i * .15), t0, .10 + i * .03)
# 26: ¡la estrella brilla! acorde enorme
place(music, pad([midi(m) for m in (48, 60, 64, 67, 72, 76, 79, 84)], 3.0, 1.0), 26.0, .2)
for j, m in enumerate([84, 88, 91, 96, 100, 103]): place(music, bell(midi(m), 1.5), 26.02 + j * .05, .08)
# 28.5–35: final alegre y emotivo
party = [(60, MAJ), (67, MAJ), (57, MIN), (65, MAJ)]
t0 = 28.5; i = 0
while t0 < 34.9:
    r, kd = party[i % 4]; tones = chord_tones(r, kd); d = 1.6
    place(music, pad([midi(m) for m in tones], d + .2, .7), t0, .10)
    for s in range(8): place(music, pluck(midi([tones[0], tones[1], tones[2], tones[1] + 12][s % 4] + 12), .3, 1.1), t0 + s * .2, .06, .25 * np.sin(s))
    for b in range(4): place(music, pluck(midi(r - 24), .4, .4), t0 + b * .4, .26)
    melody = [72, 76, 79, 84, 83, 79, 81, 84] if i % 2 == 0 else [84, 83, 81, 79, 77, 76, 74, 79]
    for s, m in enumerate(melody): place(music, pluck(midi(m), .3, 1.3), t0 + s * .2, .08, -.15)
    for b in range(4):
        place(music, kick(), t0 + b * .4, .3); place(music, hat(), t0 + b * .4 + .2, .35)
        if b % 2 == 1: place(music, clap(), t0 + b * .4, .25)
    t0 += d; i += 1
place(music, pad([midi(m) for m in (60, 64, 67, 72, 76)], 1.8, .8), 33.2, .14)
for j, m in enumerate([84, 88, 91, 96]): place(music, bell(midi(m), 2.0), 33.4 + j * .1, .07)

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

def crackle(d):
    n = int(d * SR); x = np.zeros(n, np.float32)
    for k in range(int(d * 40)):
        j = int(rng.uniform(0, n - 400)); x[j:j + 300] += onepole(noise(300), 3000) * np.exp(-np.arange(300) / 40) * rng.uniform(.3, 1)
    return x
def whistle_down(d):
    n = int(d * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(2400 * np.exp(-t * 2.2) + 300) / SR) * np.minimum(t / .1, 1) * .6 + sweep_noise(d, 5000, 400) * .5).astype(np.float32)
def rainbow_zap(d):
    out = shimmer(d, 79)[: int((d + 1.2) * SR)]
    sw = sweep_noise(d, 300, 6000); out[: len(sw)] += sw * .6
    return out
place(sfx, crackle(35.0), 0.0, .10)                          # fogata (de fondo)
place(sfx, whistle_down(1.0), 0.25, .35, .4)                 # estrella cayendo
place(sfx, boom(), 1.25, .65, .3)                            # ¡impacto!
place(sfx, shimmer(1.0, 88), 1.35, .1, .3)
place(sfx, boing(200), 1.4, .22)                             # todos saltan
for k2 in range(12): place(sfx, step(), 4.0 + k2 * .13, .22, -.2 if k2 % 2 else .2)
place(sfx, shimmer(.8, 91), 5.6, .08)                        # brillo débil de la estrella
for ts in (7.0, 8.6, 20.9): place(sfx, sniff(), ts, .28, .1)
place(sfx, pop(), 12.2, .3); place(sfx, boing(260), 12.25, .2)
place(sfx, rainbow_zap(2.4), 13.35, .35)                     # ¡sale el arcoíris!
place(sfx, sweep_noise(3.5, 300, 4000), 16.1, .25)           # viaje
for tb in (16.05, 17.0, 18.2): place(sfx, boing(300), tb, .15, np.sin(tb))
place(sfx, sweep_noise(1.2, 3000, 200), 19.6, .2)            # frenan
place(sfx, shimmer(.6, 72), 20.6, .06)                       # luz que se apaga
place(sfx, sweep_noise(1.0, 200, 6000), 25.2, .3)
place(sfx, boom()[: int(.6 * SR)], 26.0, .35)                # ¡brilla!
place(sfx, shimmer(2.5, 84), 26.0, .16)
place(sfx, rainbow_zap(1.5), 26.1, .2)
for k2 in range(10): place(sfx, pop(), 29.3 + k2 * .12, .22, np.sin(k2))   # fuegos artificiales
place(sfx, shimmer(1.5, 88), 29.4, .12)
place(sfx, shimmer(1.2, 91), 33.6, .12, -.2)

# ------------------------------------------------------------------ mezcla
venv = np.convolve(np.abs(voice).max(1), np.ones(SR // 10) / (SR // 10), mode="same")
duck = 1 - .5 * np.clip(venv * 6, 0, 1)
mix = music * duck[:, None] * .9 + sfx * duck[:, None] ** .5 * .85 + voice * 1.1
tt = np.arange(N) / SR
mix *= np.minimum(tt / .05, 1)[:, None] * np.clip((DUR - tt) / .6, 0, 1)[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= np.abs(mix).max() / .93
write_wav(os.path.join(BUILD, "ep3_soundtrack.wav"), mix)
json.dump(timeline, open(os.path.join(BUILD, "ep3_timeline.json"), "w"))
print("ok")

