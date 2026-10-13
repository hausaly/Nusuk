"""Usage: python3 -I prep_assets.py [pilgrim_number ...]   (default: every assets/pilgrim_N.ogg)
Builds transparent logo variants and the per-frame audio spectrum used by the video."""
import json, subprocess, sys
import numpy as np
from PIL import Image

FPS, BANDS = 30, 36

# --- logo: teal-on-white PNG -> transparent teal + transparent white versions
src = np.asarray(Image.open("assets/logo_source.png").convert("RGB")).astype(float)
teal = np.array([104, 200, 199], float)
# alpha = how far the pixel is from white towards brand teal (use the red channel: 255 -> 104)
alpha = np.clip((255 - src[..., 0]) / (255 - teal[0]), 0, 1)
for name, rgb in (("logo_teal", teal), ("logo_white", np.array([255, 255, 255], float))):
    out = np.zeros(src.shape[:2] + (4,), np.uint8)
    out[..., :3] = rgb.astype(np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    im = im.crop(im.getchannel("A").getbbox())          # trim empty margins
    im.save(f"assets/{name}.png")

import glob, re
nums = sys.argv[1:] or sorted(re.findall(r"pilgrim_(\d+)\.ogg", " ".join(glob.glob("assets/pilgrim_*.ogg"))))
for n in nums:
    # --- audio spectrum, one row of log-spaced bands per video frame
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", f"assets/pilgrim_{n}.ogg", "-ac", "1",
                          "-ar", "16000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.int16).astype(float) / 32768
    sr, win = 16000, 2048
    edges = np.geomspace(80, 5500, BANDS + 1)
    freqs = np.fft.rfftfreq(win, 1 / sr)
    rows = []
    for f in range(int(len(x) / sr * FPS) + 1):
        c = int(f / FPS * sr)
        seg = x[max(0, c - win // 2): c + win // 2]
        seg = np.pad(seg, (0, win - len(seg))) * np.hanning(win)
        mag = np.abs(np.fft.rfft(seg))
        rows.append([float(mag[(freqs >= lo) & (freqs < hi)].mean()) for lo, hi in zip(edges[:-1], edges[1:])])
    a = np.array(rows)
    a = np.sqrt(a / np.percentile(a, 99.5)).clip(0, 1)         # perceptual scale, normalised
    # light temporal smoothing so bars glide instead of flicker
    for i in range(1, len(a)):
        a[i] = np.maximum(a[i], a[i - 1] * 0.55)
    json.dump({"fps": FPS, "duration": len(x) / sr, "bars": np.round(a, 3).tolist()}, open(f"assets/spectrum_{n}.json", "w"))
    print("frames", len(a), "duration", len(x) / sr)
