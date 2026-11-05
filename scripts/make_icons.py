"""Рисует иконки приложения: красная опорная буква «е» на бежевом фоне."""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1]
OUT = sys.argv[2]
BG = (0xF4, 0xEB, 0xDD)
RED = (0xB3, 0x26, 0x1E)
TICK = (0xC9, 0xB8, 0x9C)


def icon(size, safe=1.0):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    s = size * safe
    font = ImageFont.truetype(FONT, int(s * 0.82))
    text = "е"
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    x = (size - w) / 2 - box[0]
    y = (size - h) / 2 - box[1]
    d.text((x, y), text, font=font, fill=RED)
    tw, th = max(2, round(s * 0.022)), round(s * 0.09)
    cx = size / 2
    gap = s * 0.05
    top = (size - h) / 2 - gap - th
    bottom = (size + h) / 2 + gap
    for ty in (top, bottom):
        d.rounded_rectangle([cx - tw / 2, ty, cx + tw / 2, ty + th], radius=tw / 2, fill=TICK)
    return img


icon(192).save(f"{OUT}/icon-192.png")
icon(512).save(f"{OUT}/icon-512.png")
icon(512, safe=0.72).save(f"{OUT}/icon-maskable-512.png")
icon(180).save(f"{OUT}/apple-touch-icon.png")
icon(64).save(f"{OUT}/favicon.png")
print("ok")
