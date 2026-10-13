"""Assembles the raw-footage track for the client-experience video.

Writes build/footage.mp4 (video only, 1080x1920@30) and build/ambience.wav (the clips' own sound, timed to match).
Timings here are mirrored in client_experience.html (T.*) - keep them in sync.
"""
import subprocess

XF = 0.4                       # cross-fade between segments
# (kind, source, speed, natural length of the source in seconds)
SEGS = [("clip", "assets/client/clip_4119.mp4", 1.0, 3.367),
        ("photo", "assets/client/photo_4134.jpg", 1.0, 2.6),
        ("clip", "assets/client/clip_4128.mp4", 0.9, 4.552),
        ("clip", "assets/client/clip_4116.mp4", 0.8, 1.917),
        ("clip", "assets/client/clip_4117.mp4", 0.8, 2.200)]
TOTAL = 20.4                   # final video length; footage is held on its last frame after the cross-fades

inputs, vf, af, starts, lens = [], [], [], [], []
t = 0.0
for i, (kind, src, speed, nat) in enumerate(SEGS):
    ln = nat / speed
    lens.append(ln)
    starts.append(t)
    t += ln - XF
    if kind == "photo":
        inputs += ["-loop", "1", "-framerate", "30", "-t", f"{ln:.3f}", "-i", src]
        # scale up a little and pan left -> right so both minarets pass through the 9:16 window
        vf.append(f"[{i}:v]scale=-2:2060:flags=lanczos,crop=1080:1920:x='(iw-1080)*t/{ln:.3f}':y='(ih-1920)/2',"
                  f"fps=30,format=yuv420p,setpts=PTS-STARTPTS[v{i}]")
    else:
        inputs += ["-i", src]
        vf.append(f"[{i}:v]setpts=(PTS-STARTPTS)/{speed},fps=30,format=yuv420p[v{i}]")
        # natural sound: slowed with the picture, softened at the edges, shifted to the segment start
        ms = int(round(starts[i] * 1000))
        af.append(f"[{i}:a]atempo={speed},afade=t=in:d={XF},afade=t=out:st={ln - XF:.3f}:d={XF},"
                  f"adelay={ms}|{ms},volume=1.0[a{i}]")

# chain the cross-fades
cur, run = "v0", lens[0]
for i in range(1, len(SEGS)):
    off = run - XF
    vf.append(f"[{cur}][v{i}]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]")
    cur, run = f"x{i}", run + lens[i] - XF
vf.append(f"[{cur}]tpad=stop_mode=clone:stop_duration={TOTAL - run + 1:.2f},trim=duration={TOTAL}[vout]")
amix_in = "".join(f"[a{i}]" for i, s in enumerate(SEGS) if s[0] == "clip")
af.append(f"{amix_in}amix=inputs={sum(1 for s in SEGS if s[0] == 'clip')}:normalize=0,apad,atrim=duration={TOTAL}[aout]")

print("segment starts:", [round(s, 2) for s in starts], "footage ends at", round(run, 2))
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(vf + af),
                "-map", "[vout]", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "build/footage.mp4",
                "-map", "[aout]", "-ar", "48000", "-ac", "2", "build/ambience.wav"], check=True)
