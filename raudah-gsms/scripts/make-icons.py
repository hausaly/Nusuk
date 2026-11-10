"""Generate favicon + PWA icons from the airplane/swoosh part of the Raudah logo."""
from PIL import Image
import os
src = Image.open("public/brand/logo.png").convert("RGBA")
mark = src.crop((250, 370, 760, 604))
mark = mark.crop(mark.getbbox())

def compose(size, scale, bg=(255, 255, 255, 255)):
    canvas = Image.new("RGBA", (size, size), bg)
    target = int(size * scale)
    ratio = min(target / mark.width, target / mark.height)
    m = mark.resize((int(mark.width * ratio), int(mark.height * ratio)), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas.convert("RGB")

os.makedirs("public/icons", exist_ok=True)
compose(192, 0.78).save("public/icons/icon-192.png")
compose(512, 0.78).save("public/icons/icon-512.png")
compose(512, 0.56).save("public/icons/maskable-512.png")   # maskable: content inside the 80% safe zone
compose(180, 0.78).save("public/icons/apple-touch-icon.png")
compose(64, 0.86).save("public/icons/favicon-64.png")
compose(48, 0.86).save("src/app/icon.png")
compose(180, 0.78).save("src/app/apple-icon.png")
print("icons written")
