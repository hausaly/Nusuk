"""Hard-cut footage for the Madinah-led sales promo: five moments from the 101 s phone clip in assets/stock/ (git-ignored).
Writes build/fatko_footage.mp4 (video only, 1080x1920@30). Cut times mirror T.cuts in fatko_promo.html."""
import subprocess
TOTAL = 22.0
SRC = "assets/stock/fatko.mp4"
SHOTS = [(10.1, 2.6), (25.3, 2.4), (31.6, 2.6), (66.0, 2.6), (18.0, 2.4)]      # (start, duration); 3rd = empty courtyard (the selfie shot was removed)
inputs, fl = [], []
for i, (ss, d) in enumerate(SHOTS):
    inputs += ["-ss", str(ss), "-t", str(d), "-i", SRC]
    # 720x1280 source -> 1080x1920, with a slow push-in so the phone footage feels deliberate
    fl.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,scale=w='trunc(1080*(1+0.07*t/{d})/2)*2':h=-2:eval=frame:flags=lanczos,crop=1080:1920,"
              f"format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
fl.append("".join(f"[v{i}]" for i in range(len(SHOTS))) + f"concat=n={len(SHOTS)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={TOTAL},trim=duration={TOTAL}[v]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fl), "-map", "[v]", "-c:v", "libx264", "-preset", "medium",
                "-crf", "14", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/fatko_footage.mp4"], check=True)
print("ok; cuts at", [round(sum(d for _, d in SHOTS[:i]), 1) for i in range(1, len(SHOTS) + 1)])
