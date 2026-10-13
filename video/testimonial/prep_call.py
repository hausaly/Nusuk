"""Audio analysis for the caller-tune video: per-frame spectrum bars + 'speech progress' (0..1).

Progress is the running share of voiced energy (300-3400 Hz) heard so far, so on-screen words advance
with the voice and pause when it pauses - no speech-to-text involved."""
import json, subprocess
import numpy as np
FPS, BANDS, SR, WIN = 30, 36, 16000, 2048
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", "assets/caller_tune_umrah.mp3", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
x = np.frombuffer(pcm, np.int16).astype(float) / 32768
fr = np.fft.rfftfreq(WIN, 1 / SR)
edges = np.geomspace(80, 5500, BANDS + 1)
n = int(len(x) / SR * FPS) + 1
bars, voiced = [], []
for f in range(n):
    c = int(f / FPS * SR)
    seg = np.pad(x[max(0, c - WIN // 2): c + WIN // 2], (0, max(0, WIN - len(x[max(0, c - WIN // 2): c + WIN // 2])))) * np.hanning(WIN)
    m = np.abs(np.fft.rfft(seg))
    bars.append([float(np.nan_to_num(m[(fr >= lo) & (fr < hi)].mean())) for lo, hi in zip(edges[:-1], edges[1:])])
    voiced.append(10 * np.log10((m[(fr > 300) & (fr < 3400)] ** 2).sum() + 1e-12))
bars = np.array(bars); bars = np.sqrt(bars / np.percentile(bars, 99.5)).clip(0, 1)
for i in range(1, len(bars)): bars[i] = np.maximum(bars[i], bars[i - 1] * 0.55)
v = np.array(voiced)
active = np.clip((v - 30) / 8, 0, 1)                      # ~0 in the pauses (<30 dB), 1 while voiced (>38 dB)
cum = np.cumsum(active); prog = cum / cum[-1]
json.dump({"fps": FPS, "duration": len(x) / SR, "bars": np.round(bars, 3).tolist(), "prog": np.round(prog, 4).tolist()},
          open("assets/call_audio.json", "w"))
print("frames", n, "duration", round(len(x) / SR, 2), "prog at 25/50/75%:", [round(float(np.searchsorted(prog, q) / FPS), 1) for q in (.25, .5, .75)])
