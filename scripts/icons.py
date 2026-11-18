"""Draws the toolbar and store icons (static/icons/icon-*.png) from the Sudoo.sh mark (web/public/favicon.svg of the
panel: a white tile, a plum ring, a dot and a bar on a 64-unit grid). Run once after the mark changes:
python3 scripts/icons.py (needs Pillow). The PNGs are committed, so building needs no Python."""

from pathlib import Path

from PIL import Image, ImageDraw

PLUM = (113, 75, 103, 255)
TILE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "static" / "icons"


def draw(size: int) -> Image.Image:
    scale = 8  # drawn large, then reduced: smooth edges at every size
    s = size * scale / 64
    image = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle((0, 0, 64 * s - 1, 64 * s - 1), radius=14 * s, fill=TILE, outline=(23, 23, 23, 30), width=max(1, round(s * 0.6)))
    cx, cy, r, stroke = 27.4, 35.6, 10.6, 5.3
    pen.ellipse(((cx - r - stroke / 2) * s, (cy - r - stroke / 2) * s, (cx + r + stroke / 2) * s, (cy + r + stroke / 2) * s), fill=PLUM)
    pen.ellipse(((cx - r + stroke / 2) * s, (cy - r + stroke / 2) * s, (cx + r - stroke / 2) * s, (cy + r - stroke / 2) * s), fill=TILE)
    pen.ellipse(((38.8 - 2.65) * s, (21.3 - 2.65) * s, (38.8 + 2.65) * s, (21.3 + 2.65) * s), fill=PLUM)
    pen.rounded_rectangle((45.1 * s, 18.8 * s, (45.1 + 3.3) * s, (18.8 + 29.7) * s), radius=0.4 * s, fill=PLUM)
    return image.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        draw(size).save(OUT / f"icon-{size}.png", optimize=True)
    print("icons written to", OUT)
