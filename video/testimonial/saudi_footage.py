"""Hard-cut footage for the Saudi sales promo (third-party stock clips live in assets/stock/, which is git-ignored).
Writes build/saudi_footage.mp4 (video only, 1080x1920@30). Cut times mirror T.cuts in saudi_promo.html."""
import subprocess
TOTAL = 30.4
S = "assets/stock/"
def pan(c0, c1, d):        # landscape source: fill 9:16, panning the crop window from centre c0 to c1 (fractions of width)
    return (f"scale=-2:1920:flags=lanczos,crop=1080:1920:x='max(0,min(iw-1080,iw*({c0}+({c1}-{c0})*t/{d})-540))':y=0")
def blurfill(c, d):        # wide shot kept whole: sharp 1400px-wide copy over a blurred full-height copy
    return ("split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=24:3[bg];"
            f"[b]scale=1400:-2:flags=lanczos,crop=1080:ih:{round(1400*c-540)}:0[fg];[bg][fg]overlay=0:(H-h)/2")
# (source, start, duration, geometry filter)
SHOTS = [(S + "clock.mp4", 0.4, 2.2, "scale=1350:2400:flags=lanczos,crop=1080:1920:0:480"),     # crop drops the watermark corner
         (S + "clock.mp4", 6.2, 2.0, "scale=1350:2400:flags=lanczos,crop=1080:1920:0:480"),
         (S + "welcome.mp4", 2.0, 1.4, pan(.60, .64, 1.4)),
         (S + "welcome.mp4", 5.2, 1.4, pan(.50, .50, 1.4)),
         (S + "welcome.mp4", 7.6, 1.4, pan(.50, .54, 1.4)),
         (S + "madinah.mp4", 0.8, 3.6, pan(.30, .55, 3.6)),
         (S + "makkah.mp4", 2.3, 2.2, blurfill(.49, 2.2)),
         (S + "makkah.mp4", 48.4, 2.2, blurfill(.50, 2.2)),
         (S + "riyal.mp4", 1.5, 4.0, "scale=1080:1920:flags=lanczos")]
inputs, fl = [], []
for i, (src, ss, d, geo) in enumerate(SHOTS):
    inputs += ["-ss", str(ss), "-t", str(d), "-i", src]
    fl.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,{geo},format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v{i}]")
fl.append("".join(f"[v{i}]" for i in range(len(SHOTS))) + f"concat=n={len(SHOTS)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={TOTAL},trim=duration={TOTAL}[v]")
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fl), "-map", "[v]", "-c:v", "libx264", "-preset", "medium",
                "-crf", "14", "-pix_fmt", "yuv420p", "-t", str(TOTAL), "build/saudi_footage.mp4"], check=True)
print("ok; footage cuts at", [round(sum(s[2] for s in SHOTS[:i]), 1) for i in range(1, len(SHOTS) + 1)])
