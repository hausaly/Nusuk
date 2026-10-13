"""Usage: python3 -I prep_client.py <dir with the raw IMG_*.MOV / IMG_4134.HEIC files>
Makes 1080x1920 proxies of the raw 4K clips (kept in git) and a JPEG of the HEIC photo."""
import glob, subprocess, sys, os
raw = sys.argv[1]
for n in ("4119", "4128", "4116", "4117"):
    src = glob.glob(os.path.join(raw, f"*IMG_{n}.MOV"))[0]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", "scale=1080:1920:flags=lanczos,fps=60,format=yuv420p",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                    f"assets/client/clip_{n}.mp4"], check=True)
import pillow_heif
from PIL import Image, ImageOps
pillow_heif.register_heif_opener()
im = ImageOps.exif_transpose(Image.open(glob.glob(os.path.join(raw, "*IMG_4134.HEIC"))[0])).convert("RGB")
im.thumbnail((1800, 2400), Image.LANCZOS)
im.save("assets/client/photo_4134.jpg", quality=90)
print("ok", im.size)
