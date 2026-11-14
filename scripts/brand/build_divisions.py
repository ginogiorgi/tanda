#!/usr/bin/env python3
"""
Genera los escudos ORIGINALES de las divisiones ranked (public/crests/div/<id>.svg) y las copas del
perfil (public/cups/<metal>.svg), en el lenguaje "B · Programa": tinta dura, colores planos, sin
gradientes ni brillos. Los escudos de división viven bajo /crests para reusar <TeamMark crest=…>.

Cada división sube un escalón visual: silueta más noble, más estrellas y un campo más cargado.
Las siglas van convertidas a TRAZOS (Big Shoulders Black, OFL) igual que los escudos de clubes.

Uso:  python3 scripts/brand/build_divisions.py assets/fonts/BigShouldersDisplay-Black.ttf
Requiere: fonttools.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "crests"))
from build_crests import SHAPES, Lettering  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
INK = "#141414"
PAPER = "#EDE9DF"
RED = "#D7261E"
BLUE = "#1F3FA8"
GREEN = "#1D7A3E"
OCHRE = "#C98A12"
EARTH = "#8B6A43"
W, H = 64, 72

# id, sigla, silueta, campo (lista de capas), estrellas
DIVISIONS = [
    ("potrero", "POT", "round", [f'<rect width="{W}" height="{H}" fill="{EARTH}"/>',
                                f'<rect y="22" width="{W}" height="3" fill="{PAPER}" opacity=".55"/>'], 0),
    ("barrio", "BAR", "heater", [f'<rect width="{W}" height="{H}" fill="{PAPER}"/>'] +
     [f'<rect x="{x}" width="8" height="{H}" fill="{BLUE}"/>' for x in range(4, W, 16)], 1),
    ("ascenso", "ASC", "swiss", [f'<rect width="{W}" height="{H}" fill="{GREEN}"/>',
                                 f'<polygon points="0,30 32,8 64,30 64,42 32,20 0,42" fill="{PAPER}"/>'], 2),
    ("primera", "1RA", "french", [f'<rect width="{W}" height="{H}" fill="{RED}"/>',
                                  f'<rect y="20" width="{W}" height="12" fill="{PAPER}"/>'], 3),
    ("libertadores", "LIB", "heater", [f'<rect width="{W}" height="{H}" fill="{INK}"/>',
                                       f'<rect x="26" width="12" height="{H}" fill="{OCHRE}"/>',
                                       f'<rect y="20" width="{W}" height="6" fill="{OCHRE}"/>'], 4),
    ("leyenda", "LEY", "swiss", [f'<rect width="{W}" height="{H}" fill="{RED}"/>',
                                 f'<rect x="32" width="32" height="{H}" fill="{INK}"/>',
                                 f'<rect y="14" width="{W}" height="3" fill="{OCHRE}"/>'], 5),
]


def star(cx: float, cy: float, r: float, fill: str) -> str:
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append(f"{cx + rr * math.cos(a):.2f},{cy + rr * math.sin(a):.2f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" stroke="{INK}" stroke-width=".8" stroke-linejoin="round"/>'


def division_svg(div: tuple, letters: Lettering) -> str:
    did, code, shape, layers, stars = div
    clip = SHAPES[shape]
    plate_y, plate_h = 38, 14
    text = letters.paths(code, 32, plate_y + plate_h - 3.5, plate_h - 7, 28)
    row = "".join(star(32 + (i - (stars - 1) / 2) * 9, 7.5 if stars else 0, 3.6, OCHRE if did != "libertadores" else PAPER)
                  for i in range(stars))
    # Las estrellas van ARRIBA del escudo (fuera del clip): el viewBox suma 10px de cabecera.
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 {W} {H + 6}" role="img" aria-label="División {did.capitalize()}">'
        f'<defs><clipPath id="c"><path d="{clip}"/></clipPath></defs>'
        f'<g clip-path="url(#c)">{"".join(layers)}</g>'
        f'<path d="{clip}" fill="none" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
        f'<rect x="15" y="{plate_y}" width="34" height="{plate_h}" fill="{INK}"/>'
        f'<path d="{text}" fill="{PAPER}"/>'
        f'<g transform="translate(0 -6)">{row}</g>'
        "</svg>\n"
    )


CUP = (
    # copa: cuenco + asas + pie + base (silueta propia, 48x56)
    '<path d="M12 6 H36 V18 C36 28 31 33 24 34 C17 33 12 28 12 18 Z" fill="{c}" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>'
    '<path d="M12 10 H6 V15 C6 21 9 24 13 24" fill="none" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>'
    '<path d="M36 10 H42 V15 C42 21 39 24 35 24" fill="none" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>'
    '<path d="M21 34 H27 V41 H21 Z" fill="{c}" stroke="{ink}" stroke-width="2.5" stroke-linejoin="round"/>'
    '<path d="M14 41 H34 V48 H14 Z" fill="{ink}"/>'
    '<path d="M10 48 H38 V52 H10 Z" fill="{ink}"/>'
    '<path d="M17 10 V18 C17 23 19 26 21 27" fill="none" stroke="{paper}" stroke-width="2" stroke-linecap="round" opacity=".7"/>'
)
METALS = {"gold": "#D9A21B", "silver": "#B9B6AE", "bronze": "#B0683A"}


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: build_divisions.py <font.ttf>")
    letters = Lettering(sys.argv[1])
    out = ROOT / "public" / "crests" / "div"
    out.mkdir(parents=True, exist_ok=True)
    for d in DIVISIONS:
        (out / f"{d[0]}.svg").write_text(division_svg(d, letters))
    cups = ROOT / "public" / "cups"
    cups.mkdir(parents=True, exist_ok=True)
    for metal, color in METALS.items():
        body = CUP.format(c=color, ink=INK, paper=PAPER)
        (cups / f"{metal}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56" role="img" aria-label="Copa">{body}</svg>\n'
        )
    print(f"✓ {len(DIVISIONS)} divisiones · {len(METALS)} copas")


if __name__ == "__main__":
    main()
