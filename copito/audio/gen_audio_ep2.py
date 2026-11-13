#!/usr/bin/env python3
"""Episodio 2 — "¡El monstruo que se robaba los colores!"
Voces neuronales (Piper), música y efectos.  Salidas en ../build:
  ep2_soundtrack.wav, ep2_timeline.json
"""
import json, os, subprocess, wave
import numpy as np

SR, DUR, FPS = 48000, 35.0, 30
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BUILD = os.path.join(ROOT, "build"); os.makedirs(BUILD, exist_ok=True)
MODELS = os.path.join(ROOT, "voices_models")
N = int(SR * DUR)
rng = np.random.default_rng(11)

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
}
LINES = [
    ("l1", "copito", 1.75, "¡¿Qué está pasando?!", 0.85),
    ("l2", "monster", 5.4, "¡Ji, ji, ji! ¡Todos los colores son míos!", None),
    ("l3", "copito", 9.25, "¡Alto ahí! ¡Devuelve los colores!", None),
    ("l4", "copito", 15.0, "¡Te atrapé!", None),
    ("l5", "monster", 17.0, "¡Solo quería tener colores porque nadie quiere jugar conmigo!", 1.02),
    ("l6", "copito", 22.1, "¡No necesitas robar colores para tener amigos!", None),
    ("l7", "monster", 27.2, "¿De verdad? ¡Qué alegría!", None),
    ("l8", "copito", 31.6, "¡Y tú también puedes ser nuestro amigo!", None),
]

voice = np.zeros((N, 2), np.float32)
mouth = {c: np.zeros(int(DUR * FPS) + 1) for c in VOICE}
timeline = {"fps": FPS, "duration": DUR, "lines": [], "mouth": {}}
for lid, who, t0, text, ls in LINES:
    model, semis, lscale, nscale = VOICE[who]
    raw = os.path.join(BUILD, f"ep2_{lid}_raw.wav"); out = os.path.join(BUILD, f"ep2_{lid}.wav")
    if not (os.environ.get("KEEP_RAW") and os.path.exists(raw)):
      subprocess.run(["python3", "-m", "piper", "-m", os.path.join(MODELS, model + ".onnx"), "-f", raw,
                    "--length-scale", str(ls or lscale), "--noise-scale", str(nscale), "--noise-w-scale", "0.8"],
                   input=text.encode(), check=True, capture_output=True)
    fx = ["gain", "-4", "pitch", str(int(semis * 100)), "highpass", "90", "equalizer", "3000", "1.2q", "+3",
          "compand", "0.02,0.15", "-60,-60,-30,-14,-10,-6,0,-3", "-3", "reverb", "12", "50", "40", "norm", "-2"]
    subprocess.run(["sox", raw, "-r", str(SR), out] + fx, check=True, capture_output=True)
    x = read_wav(out)
    place(voice, x, t0, 1.0, {"copito": -0.05, "monster": 0.12}[who])
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

# 0–1.5: alegre (bosque de colores)
for i, (r, k) in enumerate([(60, MAJ), (65, MAJ), (67, MAJ)]):
    t0 = i * .5
for j, m in enumerate([72, 76, 79, 84, 79, 76, 81, 84, 88, 84, 91, 96]):
    place(music, pluck(midi(m), .4), .0 + j * .125, .09, .2 * np.sin(j))
place(music, pad([midi(m) for m in (60, 64, 67, 72)], 1.6, .6), 0, .14)
for b in range(3):
    place(music, kick(), b * .5, .3); place(music, hat(), b * .5 + .25, .4)
# 1.5: ¡PUM! — corte de música, nota grave descendente
n = int(1.4 * SR); t = np.arange(n) / SR
place(music, (np.sin(2 * np.pi * np.cumsum(220 * np.exp(-t * 1.2) + 40) / SR) * np.exp(-t * 1.5) * .8).astype(np.float32), 1.55, .3)
# 2.2–9: suspenso divertido (pizzicato en menor, paso furtivo)
sneak = [57, None, 60, None, 64, 63, 62, None, 57, None, 60, None, 65, 64, 63, None]
t = 2.4; k = 0
while t < 9.0:
    m = sneak[k % len(sneak)]
    if m: place(music, pizz(midi(m)), t, .22, -.2)
    if k % 4 == 0: place(music, pizz(midi(45 if (k // 16) % 2 == 0 else 41), .4), t, .35)
    if k % 8 == 4: place(music, pizz(midi(52)), t, .2)
    k += 1; t += .25
for t0, ch in [(2.4, (57, 60, 64)), (4.4, (53, 57, 60)), (6.4, (52, 56, 59, 62)), (8.4, (52, 56, 59))]:
    place(music, pad([midi(m - 12) for m in ch], 2.2, .2), t0, .10)
for j, m in enumerate([81, 84, 88, 93]):  # "ta-da" al revelar al monstruo
    place(music, bell(midi(m), 1.0), 4.1 + j * .06, .07)
# 9–15: persecución (rápida, mayor, con batería)
prog = [(62, MIN), (58, MAJ), (60, MAJ), (57, MAJ)] * 2
for i, (r, kd) in enumerate(prog):
    t0 = 9.0 + i * .75
    if t0 >= 15.0: break
    tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], .8, .7), t0, .10)
    for s in range(6):
        place(music, pluck(midi(tones[s % 3] + 12 + (12 if s >= 3 else 0)), .2, 1.2), t0 + s * .125, .07, .3 * np.sin(s))
    place(music, pluck(midi(r - 24), .4, .3), t0, .3); place(music, pluck(midi(r - 24), .3, .3), t0 + .375, .22)
t = 9.0
while t < 15.0:
    place(music, kick(), t, .32); place(music, hat(.03), t + .125, .35); place(music, snare(), t + .25, .2); place(music, hat(.03), t + .375, .35)
    t += .5
# 15–22: atrapado y triste (caja de música, lento)
place(music, bell(midi(96), 1.5), 15.15, .12)
for i, (r, kd) in enumerate([(57, MIN), (53, MAJ), (50, MIN), (52, MAJ)]):
    t0 = 15.6 + i * 1.6; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 1.8, .1), t0, .11)
    for s, idx in enumerate([0, 1, 2, 1]):
        place(music, bell(midi(tones[idx] + 24), 1.4), t0 + s * .4, .055)
# 22–25.6: tierno, crece hacia la explosión
for i, (r, kd) in enumerate([(53, MAJ), (55, MAJ), (57, MIN), (55, MAJ)]):
    t0 = 22.0 + i * .9; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones] + [midi(r + 12)], 1.0, .4 + i * .15), t0, .10 + i * .03)
    for s in range(4): place(music, pluck(midi(tones[s % 3] + 12), .5), t0 + s * .225, .06 + i * .015)
# 25.6: ¡explosión de color! acorde enorme
place(music, pad([midi(m) for m in (48, 60, 64, 67, 72, 76, 79, 84)], 3.0, 1.0), 25.6, .2)
for j, m in enumerate([84, 88, 91, 96, 100, 103]): place(music, bell(midi(m), 1.5), 25.62 + j * .05, .08)
# 27–35: fiesta (baile a 120 bpm)
party = [(60, MAJ), (57, MIN), (65, MAJ), (67, MAJ)]
t0 = 27.0; i = 0
while t0 < 34.9:
    r, kd = party[i % 4]; tones = chord_tones(r, kd)
    place(music, pad([midi(m) for m in tones], 2.1, .7), t0, .09)
    for s in range(8):
        place(music, pluck(midi([tones[0], tones[1], tones[2], tones[1] + 12][s % 4] + 12), .35, 1.1), t0 + s * .25, .065, .25 * np.sin(s))
    for b in range(4): place(music, pluck(midi(r - 24), .45, .4), t0 + b * .5, .3)
    melody = [72, 74, 76, 79, 76, 74, 72, 67] if i % 2 == 0 else [76, 79, 81, 84, 81, 79, 76, 79]
    for s, m in enumerate(melody): place(music, pluck(midi(m), .3, 1.3), t0 + s * .25, .085, -.15)
    for b in range(4):
        place(music, kick(), t0 + b * .5, .35); place(music, hat(), t0 + b * .5 + .25, .4)
        if b % 2 == 1: place(music, clap(), t0 + b * .5, .3)
    t0 += 2.0; i += 1
place(music, pad([midi(m) for m in (60, 64, 67, 72, 76)], 1.6, .8), 33.4, .14)

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

place(sfx, shimmer(1.2, 88), 0.0, .12, .3)                  # gancho: brillo de colores
place(sfx, pop(), .35, .3, -.3); place(sfx, pop(), .7, .3, .3)
place(sfx, boom(), 1.5, .7)                                  # ¡PUM!
place(sfx, sweep_noise(1.6, 4000, 300), 1.55, .35)           # se va el color
place(sfx, boing(160), 1.62, .25)
place(sfx, sweep_noise(.8, 400, 5000), 3.9, .3)              # zoom rápido al monstruo
place(sfx, slurp(4.5), 4.3, .28, .25)                        # aspiradora de colores
place(sfx, hiccup(), 7.9, .35, .2)                           # hipo con burbuja arcoíris
place(sfx, pop(), 8.15, .35, .2)
for k2 in range(48):                                         # pasos de la carrera
    place(sfx, step(), 9.0 + k2 * .125, .25 if k2 % 2 else .2, -.2 if k2 % 2 else .2)
for tj in (9.85, 11.45): place(sfx, boing(260), tj, .3)      # saltos de troncos
place(sfx, sweep_noise(.4, 600, 3000), 10.55, .3, .5)        # esquiva la piedra
place(sfx, shimmer(1.0, 79), 12.5, .12)                      # arcoíris que se apaga
place(sfx, sweep_noise(.5, 3000, 300), 13.2, .2)
place(sfx, boing(200), 14.7, .3); place(sfx, boom()[: int(.4 * SR)], 15.2, .45)   # salto y atrapada
for ts in (16.3, 19.9, 21.2): place(sfx, sniff(), ts, .3, .15)
place(sfx, shimmer(.6, 91), 24.9, .1)                        # la patita
place(sfx, sweep_noise(.9, 200, 6000), 24.8, .3)
place(sfx, boom(), 25.6, .55)                                # explosión mágica
place(sfx, shimmer(2.5, 84), 25.6, .16)
for k2 in range(14): place(sfx, pop(), 25.7 + k2 * .09, .2, np.sin(k2))
place(sfx, sweep_noise(1.0, 300, 6000), 28.6, .25)           # transformación
place(sfx, shimmer(1.4, 88), 29.1, .13)
for tb in np.arange(29.5, 34.5, 1.0): place(sfx, boing(300), tb, .12, np.sin(tb))
place(sfx, shimmer(1.2, 91), 33.8, .12, -.2)

# ------------------------------------------------------------------ mezcla
venv = np.convolve(np.abs(voice).max(1), np.ones(SR // 10) / (SR // 10), mode="same")
duck = 1 - .5 * np.clip(venv * 6, 0, 1)
mix = music * duck[:, None] * .9 + sfx * duck[:, None] ** .5 * .85 + voice * 1.1
tt = np.arange(N) / SR
mix *= np.minimum(tt / .05, 1)[:, None] * np.clip((DUR - tt) / .6, 0, 1)[:, None]
mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= np.abs(mix).max() / .93
write_wav(os.path.join(BUILD, "ep2_soundtrack.wav"), mix)
json.dump(timeline, open(os.path.join(BUILD, "ep2_timeline.json"), "w"))
print("ok")
