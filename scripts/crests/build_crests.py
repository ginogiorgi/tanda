#!/usr/bin/env python3
"""
Genera los escudos ORIGINALES de los clubes (public/crests/<crest_asset>.svg) desde data/teams/*.json.

No reproducen escudos reales: es un sistema propio y uniforme —silueta (4 variantes, elegida por hash
del código), campo con el patrón de camiseta del club (kit_pattern + colores) y una placa con las siglas
del equipo (`code`) convertidas a TRAZOS (sin depender de fuentes en el navegador).

Uso:  python3 scripts/crests/build_crests.py assets/fonts/BigShouldersDisplay-Black.ttf
      (Big Shoulders Display Black, OFL — licencia en assets/fonts/OFL-BigShoulders.txt)
Requiere: fonttools.
"""
import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
INK = "#111111"
PAPER = "#F5F1E8"
W, H = 64, 72

# Siluetas (viewBox 64x72). Todas dejan ~4px de aire para el borde.
SHAPES = {
    "heater": "M6 6 H58 V30 C58 50 46 62 32 68 C18 62 6 50 6 30 Z",
    "round": "M32 6 A28 28 0 1 1 31.99 6 Z M32 6",
    "french": "M6 6 H58 V48 C58 54 54 58 48 58 H40 L32 68 L24 58 H16 C10 58 6 54 6 48 Z",
    "swiss": "M6 10 Q6 6 10 6 H54 Q58 6 58 10 V44 C58 58 46 66 32 68 C18 66 6 58 6 44 Z",
}
SHAPE_ORDER = ["heater", "swiss", "french", "round"]


def pick_shape(code: str) -> str:
    return SHAPE_ORDER[int(hashlib.md5(code.encode()).hexdigest(), 16) % len(SHAPE_ORDER)]


def field(pattern: str, p: str, s: str, t: str | None) -> str:
    """Rectángulos del campo según el patrón de camiseta (se recortan con la silueta)."""
    s = s or PAPER
    out = [f'<rect width="{W}" height="{H}" fill="{p}"/>']
    if pattern == "solid" and s.lower() != p.lower():
        # «Jefe» heráldico: franja superior con el segundo color, para que los lisos no queden planos.
        out.append(f'<rect width="{W}" height="18" fill="{s}"/>')
    if pattern == "vstripes":
        for x in range(0, W, 16):
            out.append(f'<rect x="{x + 8}" width="8" height="{H}" fill="{s}"/>')
    elif pattern == "hstripes" or pattern == "hoops":
        for y in range(0, H, 14):
            out.append(f'<rect y="{y + 7}" width="{W}" height="7" fill="{s}"/>')
    elif pattern == "band":
        out.append(f'<rect y="20" width="{W}" height="16" fill="{s}"/>')
    elif pattern == "sash":
        out.append(f'<polygon points="0,14 14,0 64,50 64,64 50,64 0,14" fill="{s}" transform="translate(0 4)"/>')
    elif pattern == "halves":
        out.append(f'<rect x="32" width="32" height="{H}" fill="{s}"/>')
    elif pattern == "chevron":
        out.append(f'<polygon points="0,10 32,40 64,10 64,24 32,54 0,24" fill="{s}"/>')
    elif pattern == "checks":
        for y in range(0, H, 8):
            for x in range(0, W, 8):
                if (x // 8 + y // 8) % 2:
                    out.append(f'<rect x="{x}" y="{y}" width="8" height="8" fill="{s}"/>')
    if t:
        out.append(f'<rect y="36" width="{W}" height="4" fill="{t}"/>')
    return "".join(out)


class Lettering:
    def __init__(self, font_path: str):
        self.font = TTFont(font_path)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font["head"].unitsPerEm
        os2 = self.font["OS/2"]
        self.cap = getattr(os2, "sCapHeight", 0) or int(self.upm * 0.7)

    def paths(self, text: str, cx: float, baseline: float, cap_px: float, max_w: float) -> str:
        scale = cap_px / self.cap
        names = [self.cmap[ord(ch)] for ch in text]
        tracking = 0.04 * self.upm
        width = sum(self.gs[n].width for n in names) + tracking * (len(names) - 1)
        if width * scale > max_w:
            scale = max_w / width
        x = cx - width * scale / 2
        d = []
        for n in names:
            pen = SVGPathPen(self.gs)
            # y del font crece hacia arriba → espejar.
            tp = TransformPen(pen, (scale, 0, 0, -scale, x, baseline))
            self.gs[n].draw(tp)
            d.append(pen.getCommands())
            x += (self.gs[n].width + tracking) * scale
        return " ".join(d)


def crest_svg(team: dict, letters: Lettering) -> str:
    shape = pick_shape(team["code"])
    clip = SHAPES[shape]
    p, s, t = team["kit_primary"], team["kit_secondary"], team["kit_tertiary"]
    plate_y, plate_h = 41, 14
    text = letters.paths(team["code"], 32, plate_y + plate_h - 3.5, plate_h - 7, 28)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{team["name"]}">'
        f'<defs><clipPath id="c"><path d="{clip}"/></clipPath></defs>'
        f'<g clip-path="url(#c)">{field(team["kit_pattern"], p, s, t)}</g>'
        f'<path d="{clip}" fill="none" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
        f'<rect x="15" y="{plate_y}" width="34" height="{plate_h}" fill="{INK}"/>'
        f'<path d="{text}" fill="{PAPER}"/>'
        "</svg>\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: build_crests.py <font.ttf>")
    letters = Lettering(sys.argv[1])
    n = 0
    for f in sorted((ROOT / "data" / "teams").glob("*.json")):
        for team in json.loads(f.read_text()):
            if not team.get("crest_asset"):
                continue
            out = ROOT / "public" / "crests" / f'{team["crest_asset"]}.svg'
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(crest_svg(team, letters))
            n += 1
    print(f"✓ {n} escudos")


if __name__ == "__main__":
    main()
