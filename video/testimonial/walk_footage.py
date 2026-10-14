"""Footage for the 'walk with us' video: four clips (trimmed, slightly slowed), cross-faded, held after the last one.
Writes build/walk_footage.mp4 and build/walk_ambience.wav (the clips' own sound, timed to match)."""
import subprocess
XF, TOTAL = 0.4, 21.8
# (proxy, speed, seconds used from the start of the clip)
SEGS = [("assets/client/clip_4178.mp4", 1.0, 3.6), ("assets/client/clip_4128.mp4", 0.9, 3.2),
        ("assets/client/clip_4120.mp4", 0.9, 3.0), ("assets/client/clip_4117.mp4", 0.85, 2.2)]
inputs, vf, af, t, starts, lens = [], [], [], 0.0, [], []
for i, (src, sp, use) in enumerate(SEGS):
    ln = use / sp; lens.append(ln); starts.append(t); t += ln - XF
    inputs += ["-t", str(use), "-i", src]
    vf.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{sp},fps=30,format=yuv420p,setsar=1[v{i}]")
    ms = int(round(starts[i] * 1000))
    af.append(f"[{i}:a]atempo={sp},afade=t=in:d={XF},afade=t=out:st={ln - XF:.3f}:d={XF},adelay={ms}|{ms}[a{i}]")
cur, run = "v0", lens[0]
for i in range(1, len(SEGS)):
    vf.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XF}:offset={run - XF:.3f}[x{i}]"); cur, run = f"x{i}", run + lens[i] - XF
vf.append(f"[{cur}]tpad=stop_mode=clone:stop_duration={TOTAL - run + 1:.2f},trim=duration={TOTAL}[vout]")
af.append("".join(f"[a{i}]" for i in range(len(SEGS))) + f"amix=inputs={len(SEGS)}:normalize=0,apad,atrim=duration={TOTAL}[aout]")
print("starts", [round(s, 2) for s in starts], "footage ends", round(run, 2))
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium",
                "-crf", "14", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/walk_footage.mp4", "-map", "[aout]", "-ar", "48000", "-ac", "2", "-t", str(TOTAL), "build/walk_ambience.wav"], check=True)
