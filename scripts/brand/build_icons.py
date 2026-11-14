#!/usr/bin/env python3
"""
Genera el ícono de marca de Tanda (rebrand "B · Programa") desde la fuente Big Shoulders Display Black
(OFL), con la letra convertida a TRAZOS: papel, marco de tinta, una "T" de cartel y el punto penal rojo.

Salidas: app/icon.svg (favicon vectorial), app/apple-icon.png (180), app/favicon.ico (16/32/48),
public/icon-192.png, public/icon-512.png.

Uso:  python3 scripts/brand/build_icons.py assets/fonts/BigShouldersDisplay-Black.ttf
Requiere: fonttools, y `rsvg-convert` + `magick` (ImageMagick) en el PATH para los rasters.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
PAPER, INK, RED = "#EDE9DF", "#141414", "#D7261E"


def glyph_path(font_path: str, ch: str, box: tuple[float, float, float, float]) -> str:
    """Path SVG de `ch` escalado para entrar en `box` (x, y, w, h), centrado."""
    font = TTFont(font_path)
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(ch)]
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    bx, by, bw, bh = box
    k = min(bw / (x1 - x0), bh / (y1 - y0))
    tx = bx + (bw - (x1 - x0) * k) / 2 - x0 * k
    ty = by + (bh - (y1 - y0) * k) / 2 + y1 * k
    pen = SVGPathPen(gs)
    gs[name].draw(TransformPen(pen, (k, 0, 0, -k, tx, ty)))
    return pen.getCommands()


def icon_svg(font_path: str) -> str:
    t = glyph_path(font_path, "T", (14, 9, 32, 44))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect x="2" y="2" width="60" height="60" rx="6" fill="{PAPER}" stroke="{INK}" stroke-width="4"/>'
        f'<path d="{t}" fill="{INK}"/>'
        f'<circle cx="47" cy="49" r="6" fill="{RED}"/>'
        "</svg>\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: build_icons.py <font.ttf>")
    svg = icon_svg(sys.argv[1])
    (ROOT / "app" / "icon.svg").write_text(svg)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "icon.svg"
        src.write_text(svg)

        def png(size: int, out: Path) -> None:
            subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(out), str(src)], check=True)

        png(180, ROOT / "app" / "apple-icon.png")
        png(192, ROOT / "public" / "icon-192.png")
        png(512, ROOT / "public" / "icon-512.png")
        sizes = []
        for s in (16, 32, 48):
            p = Path(tmp) / f"f{s}.png"
            png(s, p)
            sizes.append(str(p))
        subprocess.run(["magick", *sizes, str(ROOT / "app" / "favicon.ico")], check=True)
    print("✓ íconos")


if __name__ == "__main__":
    main()
