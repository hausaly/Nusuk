"""Hard-cut montage for the Nov/Dec 2026 promo hook (0.8 s per shot, each with a slight punch-in), held after the last cut.
Writes build/promo_footage.mp4 (video only, 1080x1920@30)."""
import subprocess
CUT, TOTAL = 0.8, 29.0
SHOTS = [("clip", "assets/client/clip_4128.mp4", 1.0), ("clip", "assets/client/clip_4119.mp4", 0.8),
         ("photo", "assets/client/photo_4134.jpg", 0), ("clip", "assets/client/clip_4116.mp4", 0.4),
         ("clip", "assets/client/clip_4117.mp4", 0.6), ("clip", "assets/client/clip_4111.mp4", 0.9)]
inputs, fl = [], []
for i, (kind, src, ss) in enumerate(SHOTS):
    zoom = f"scale=w='trunc(1080*(1+0.09*t/{CUT})/2)*2':h=-2:eval=frame:flags=bilinear,crop=1080:1920"
    if kind == "photo":
        inputs += ["-loop", "1", "-framerate", "30", "-t", f"{CUT}", "-i", src]
        fl.append(f"[{i}:v]scale=-2:2060:flags=lanczos,crop=1080:1920:x='(iw-1080)*t/{CUT}':y='(ih-1920)/2',fps=30,format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
    else:
        inputs += ["-ss", str(ss), "-t", f"{CUT}", "-i", src]
        fl.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,{zoom},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
cat = "".join(f"[v{i}]" for i in range(len(SHOTS)))
fl.append(f"{cat}concat=n={len(SHOTS)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={TOTAL},trim=duration={TOTAL}[v]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fl), "-map", "[v]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "build/promo_footage.mp4"], check=True)
print("ok; montage length", CUT * len(SHOTS))
