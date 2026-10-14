"""Footage for the 'group moments' video: three clips (slightly slowed), cross-faded, held after the last one.
Writes build/moments_footage.mp4 and build/moments_ambience.wav (the clips' own sound, timed to match)."""
import subprocess
XF, TOTAL = 0.4, 21.4
# (proxy, speed, natural length in seconds)
SEGS = [("assets/client/clip_4169n.mp4", 1.0, 4.433), ("assets/client/clip_4108.mp4", 0.85, 3.25), ("assets/client/clip_4163.mp4", 0.85, 3.70)]
inputs, vf, af, t, starts, lens = [], [], [], 0.0, [], []
for i, (src, sp, nat) in enumerate(SEGS):
    ln = nat / sp; lens.append(ln); starts.append(t); t += ln - XF
    inputs += ["-i", src]
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
                "-crf", "14", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/moments_footage.mp4", "-map", "[aout]", "-ar", "48000", "-ac", "2", "-t", str(TOTAL), "build/moments_ambience.wav"], check=True)
