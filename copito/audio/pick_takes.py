#!/usr/bin/env python3
"""Genera varias tomas de cada frase con Piper y guarda la que Whisper entiende mejor
(build/<ep>_<id>_raw.wav). Uso: python3 audio/pick_takes.py ep3 ; luego KEEP_RAW=1 python3 audio/gen_audio_ep3.py"""
import os, re, subprocess, unicodedata, numpy as np, importlib.util
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
from faster_whisper import WhisperModel
import sys
EP = sys.argv[1] if len(sys.argv) > 1 else "ep2"
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..")
src = open(os.path.join(HERE, f"gen_audio_{EP}.py")).read()
ns = {"__file__": os.path.join(HERE, f"gen_audio_{EP}.py")}; exec(src.split("voice = np.zeros")[0], ns)      # reutiliza VOICE y LINES
VOICE, LINES = ns["VOICE"], ns["LINES"]
norm = lambda s: re.sub(r"[^a-z ]", "", unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode())
m = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=4)
ONLY = sys.argv[2:]
for lid, who, t0, text, ls in LINES:
    if ONLY and lid not in ONLY: continue
    model, semis, lscale, nscale = VOICE[who]
    target = norm(text).split(); best = (-1, None)
    for k in range(6):
        tmp = os.path.join(ROOT, "build", f"take_{lid}_{k}.wav")
        subprocess.run(["python3", "-m", "piper", "-m", os.path.join(ROOT, "voices_models", model + ".onnx"), "-f", tmp,
                        "--length-scale", str(ls or lscale), "--noise-scale", str(nscale), "--noise-w-scale", "0.8"],
                       input=text.encode(), check=True, capture_output=True)
        a = np.frombuffer(subprocess.run(["sox", tmp, "-t", "raw", "-r", "16000", "-c", "1", "-e", "float", "-b", "32", "-", "gain", "-4", "pitch", str(int(semis * 100))], capture_output=True).stdout, dtype=np.float32)
        heard = norm(" ".join(s.text for s in m.transcribe(a, language="es", beam_size=3)[0])).split()
        score = sum(1 for w in target if w in heard) / len(target)
        if score > best[0]: best = (score, tmp, " ".join(heard))
        if score == 1: break
    os.replace(best[1], os.path.join(ROOT, "build", f"{EP}_{lid}_raw.wav"))
    for f in os.listdir(os.path.join(ROOT, "build")):
        if f.startswith(f"take_{lid}_"): os.remove(os.path.join(ROOT, "build", f))
    print(f"{lid}: {best[0]:.0%}  «{text}» → «{best[2]}»")
