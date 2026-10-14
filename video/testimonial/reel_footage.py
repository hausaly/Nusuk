"""Footage track for the reel video: the 4.4 s courtyard pan slowed to 0.6x (60 fps source stays smooth),
held on its last frame. Writes build/reel_footage.mp4 and build/reel_ambience.wav."""
import subprocess
SPEED, TOTAL = 0.6, 16.6
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "assets/client/clip_4120.mp4", "-filter_complex",
    f"[0:v]setpts=(PTS-STARTPTS)/{SPEED},fps=30,format=yuv420p,tpad=stop_mode=clone:stop_duration={TOTAL},trim=duration={TOTAL}[v];"
    f"[0:a]atempo={SPEED},afade=t=in:d=0.4,afade=t=out:st={4.435/SPEED-0.6:.2f}:d=0.6,apad,atrim=duration={TOTAL}[a]",
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p", "build/reel_footage.mp4",
    "-map", "[a]", "-ar", "48000", "-ac", "2", "build/reel_ambience.wav"], check=True)
print("ok")
