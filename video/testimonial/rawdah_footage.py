"""Footage for the long Rawdah-audio ad: ten of our own pilgrim clips (proxies in assets/client), slowed for a calm, cinematic feel,
cross-faded, held after the last one. Writes build/rawdah_footage.mp4. Overlay timings in rawdah_long.html (T / BEATS) follow the printed starts."""
import subprocess
XF, TOTAL = 0.3, 63.5
C = "assets/client/clip_"
# (proxy, seconds used from the clip start, speed)
SEGS = [("4178", 2.6, 1.0), ("4128", 2.4, 1.0), ("4119", 2.4, 1.0), ("4108", 2.4, 1.0), ("4163", 3.7, 0.8),
        ("4120", 4.4, 0.7), ("4169n", 4.4, 0.9), ("4111", 3.8, 0.8), ("4117", 2.2, 0.8), ("4116", 1.9, 0.8)]
inputs, vf, t, starts, lens = [], [], 0.0, [], []
for i, (n, use, sp) in enumerate(SEGS):
    ln = use / sp; lens.append(ln); starts.append(t); t += ln - XF
    inputs += ["-t", str(use), "-i", f"{C}{n}.mp4"]
    vf.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=30,scale=w='trunc(1080*(1+0.06*t/{ln:.3f})/2)*2':h=-2:eval=frame:flags=lanczos,crop=1080:1920,"
              f"format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
cur, run = "v0", lens[0]
for i in range(1, len(SEGS)):
    vf.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XF}:offset={run - XF:.3f}[x{i}]"); cur, run = f"x{i}", run + lens[i] - XF
vf.append(f"[{cur}]tpad=stop_mode=clone:stop_duration={TOTAL - run + 1:.2f},trim=duration={TOTAL}[vout]")
print("starts", [round(s, 2) for s in starts], "footage ends", round(run, 2))
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium",
                "-crf", "15", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/rawdah_footage.mp4"], check=True)
