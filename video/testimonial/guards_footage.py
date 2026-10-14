"""Hard-cut footage for the 'call of the Haramain' ad: five moments from our own pilgrim clips (assets/client proxies).
Writes build/guards_footage.mp4 (video only, 1080x1920@30). Cut times mirror T.cuts in guards_promo.html."""
import subprocess
TOTAL = 22.0
C = "assets/client/clip_"
SHOTS = [(C + "4178.mp4", 0.3, 2.6), (C + "4128.mp4", 0.8, 2.4), (C + "4119.mp4", 0.4, 2.6), (C + "4108.mp4", 0.2, 2.6), (C + "4163.mp4", 0.6, 2.4)]
inputs, fl = [], []
for i, (src, ss, d) in enumerate(SHOTS):
    inputs += ["-ss", str(ss), "-t", str(d), "-i", src]
    fl.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,scale=w='trunc(1080*(1+0.07*t/{d})/2)*2':h=-2:eval=frame:flags=lanczos,crop=1080:1920,"
              f"format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
fl.append("".join(f"[v{i}]" for i in range(len(SHOTS))) + f"concat=n={len(SHOTS)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={TOTAL},trim=duration={TOTAL}[v]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fl), "-map", "[v]", "-c:v", "libx264", "-preset", "medium",
                "-crf", "14", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/guards_footage.mp4"], check=True)
print("ok; cuts at", [round(sum(d for _, _, d in SHOTS[:i]), 1) for i in range(1, len(SHOTS) + 1)])
