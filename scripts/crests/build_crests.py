#!/usr/bin/env python3
"""
Genera los escudos de los clubes (public/crests/<crest_asset>.svg) desde una FICHA por club (`CRESTS`).

Decisión de Gino (18/11, ver CLAUDE.md "Assets"): los escudos pueden PARECERSE a los reales —forma, colores,
franjas/bandas, iniciales y algún elemento característico— sin ser copias. Cada ficha se armó mirando el escudo
real; el script es el normalizador: viewBox 64×72, borde de tinta uniforme, letras convertidas a TRAZOS con Big
Shoulders (OFL) para no depender de fuentes en el navegador.

Uso:  python3 scripts/crests/build_crests.py assets/fonts/BigShouldersDisplay-Black.ttf
Requiere: fonttools.
"""
import json
import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
INK = "#111111"
W, H = 64, 72

# Siluetas (viewBox 64×72), todas con ~4 px de aire para el borde.
SHAPES = {
    # escudo clásico: arriba recto, punta abajo
    "heater": "M6 6 H58 V30 C58 50 46 62 32 68 C18 62 6 50 6 30 Z",
    # suizo: hombros redondeados y punta suave
    "swiss": "M6 10 Q6 6 10 6 H54 Q58 6 58 10 V44 C58 58 46 66 32 68 C18 66 6 58 6 44 Z",
    # francés: base recta con pico chico al medio
    "french": "M6 6 H58 V48 C58 54 54 58 48 58 H40 L32 68 L24 58 H16 C10 58 6 54 6 48 Z",
    # óvalo vertical (Boca, Gimnasia)
    "oval": "M32 5 C50 5 59 19 59 36 C59 53 50 67 32 67 C14 67 5 53 5 36 C5 19 14 5 32 5 Z",
    # círculo (Instituto)
    "round": "M32 8 A27 27 0 1 1 31.99 8 Z",
    # escudo con hombros en punta (River, Lanús)
    "pointed": "M6 6 L32 10 L58 6 V34 C58 52 46 63 32 68 C18 63 6 52 6 34 Z",
}


class Lettering:
    def __init__(self, font_path: str):
        self.font = TTFont(font_path)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        cap = getattr(self.font["OS/2"], "sCapHeight", 0)
        self.cap = cap or int(self.font["head"].unitsPerEm * 0.7)
        self.upm = self.font["head"].unitsPerEm

    def path(self, text: str, cx: float, baseline: float, cap_px: float, max_w: float) -> str:
        """Texto centrado en `cx` con la base en `baseline`; se achica si no entra en `max_w`."""
        scale = cap_px / self.cap
        names = [self.cmap[ord(ch)] for ch in text]
        tracking = 0.05 * self.upm
        width = sum(self.gs[n].width for n in names) + tracking * (len(names) - 1)
        if width * scale > max_w:
            scale = max_w / width
        x = cx - width * scale / 2
        d = []
        for n in names:
            pen = SVGPathPen(self.gs)
            self.gs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
            d.append(pen.getCommands())
            x += (self.gs[n].width + tracking) * scale
        return " ".join(d)


# ─────────────────────────── piezas del campo ───────────────────────────
def rect(x, y, w, h, fill):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>'


def vstripes(a, b, n=5):
    """`n` franjas verticales alternadas empezando por `a` (centradas: la del medio es `a` si n es impar)."""
    w = W / n
    return "".join(rect(round(i * w, 2), 0, round(w + 0.05, 2), H, a if i % 2 == 0 else b) for i in range(n))


def hoops(a, b, n=6):
    h = H / n
    return "".join(rect(0, round(i * h, 2), W, round(h + 0.05, 2), a if i % 2 == 0 else b) for i in range(n))


def chevron(color, dy=0):
    pts = [(4, 14), (32, 46), (60, 14), (60, 28), (32, 60), (4, 28)]
    return f'<polygon points="{" ".join(f"{x},{y + dy}" for x, y in pts)}" fill="{color}"/>'


def star(cx, cy, r, fill):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append(f"{cx + rr * math.cos(a):.2f},{cy + rr * math.sin(a):.2f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"/>'


# ─────────────────────────── fichas por club ───────────────────────────
# Cada ficha: shape, field (lista de piezas SVG), text = (letras, color, baseline, alto de mayúscula, ancho máx)
# y opcional `over` (piezas encima del texto) y `text_rot` (grados, para el texto sobre una banda).
NAVY = "#0B2C6B"


def crests() -> dict[str, dict]:
    return {
        # Boca: óvalo azul, franja amarilla horizontal con las siglas, estrellas arriba.
        "BOC": dict(
            shape="oval",
            field=[rect(0, 0, W, H, "#0B3B8C"), rect(0, 28, W, 17, "#F5C400")]
            + [star(14 + i * 9, 18 - (2 if i in (1, 3) else 0) - (3 if i == 2 else 0), 2.6, "#F5C400") for i in range(5)],
            text=("CABJ", "#0B3B8C", 41.5, 10, 40),
        ),
        # River: escudo blanco con la banda roja en diagonal y las siglas sobre la banda.
        "RIV": dict(
            shape="pointed",
            field=[rect(0, 0, W, H, "#FFFFFF"), '<polygon points="0,10 12,0 64,52 64,66 56,72" fill="#D50032"/>'],
            text=("CARP", "#FFFFFF", 40, 8, 26),
            text_rot=(41, 32, 36),
        ),
        # Rosario Central: franjas azules y amarillas con jefe azul y las siglas.
        "RCE": dict(
            shape="swiss",
            field=[vstripes("#003DA5", "#FFD100", 7), rect(0, 0, W, 24, "#003DA5")],
            text=("CARC", "#FFD100", 20, 8.5, 38),
        ),
        # Argentinos Juniors: rojo con aro blanco y las cuatro iniciales.
        "AAJ": dict(
            shape="french",
            field=[rect(0, 0, W, H, "#D7141A"), '<path d="M12 12 H52 V46 C52 50 50 52 46 52 H18 C14 52 12 50 12 46 Z" fill="none" stroke="#FFFFFF" stroke-width="3"/>'],
            text=("AAAJ", "#FFFFFF", 38, 13, 34),
        ),
        # Vélez: blanco con la V azul y las siglas arriba.
        "VEL": dict(
            shape="heater",
            field=[rect(0, 0, W, H, "#FFFFFF"), chevron("#003DA5", 6)],
            text=("CAVS", "#003DA5", 15, 7, 30),
        ),
        # Lanús: granate con las siglas grandes en blanco.
        "LAN": dict(
            shape="pointed",
            field=[rect(0, 0, W, H, "#6C1D2F")],
            text=("CAL", "#FFFFFF", 44, 22, 40),
        ),
        # Racing: franjas celestes y blancas, jefe blanco con las iniciales.
        "RAC": dict(
            shape="swiss",
            field=[vstripes("#6CACE4", "#FFFFFF", 7), rect(0, 0, W, 24, "#FFFFFF"), rect(0, 24, W, 2.5, INK)],
            text=("RC", "#6CACE4", 20.5, 10, 30),
        ),
        # Independiente: rojo con las siglas en blanco.
        "IND": dict(
            shape="heater",
            field=[rect(0, 0, W, H, "#E2001A")],
            text=("CAI", "#FFFFFF", 42, 22, 40),
        ),
        # Huracán: blanco con el globo rojo y las siglas.
        "HUR": dict(
            shape="heater",
            field=[
                rect(0, 0, W, H, "#FFFFFF"),
                '<path d="M32 9 C40 9 45 15 45 22 C45 29 37 33 34 38 H30 C27 33 19 29 19 22 C19 15 24 9 32 9 Z" fill="#E30613"/>',
                rect(29, 39, 6, 4, "#E30613"),
            ],
            text=("CAH", "#E30613", 59, 11, 26),
        ),
        # Estudiantes: franjas rojas y blancas con jefe blanco.
        "EST": dict(
            shape="french",
            field=[vstripes("#E30613", "#FFFFFF", 7), rect(0, 0, W, 23, "#FFFFFF"), rect(0, 23, W, 2.5, "#E30613")],
            text=("EDLP", "#E30613", 20, 8.5, 38),
        ),
        # Independiente Rivadavia: azul con filete blanco y las siglas.
        "IRI": dict(
            shape="swiss",
            field=[rect(0, 0, W, H, "#0A2A66"), '<path d="M12 12 H52 V42 C52 52 43 58 32 61 C21 58 12 52 12 42 Z" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>'],
            text=("CSIR", "#FFFFFF", 40, 13, 32),
        ),
        # Barracas Central: franjas rojas y blancas, jefe blanco con las siglas.
        "BAR": dict(
            shape="heater",
            field=[vstripes("#D71920", "#FFFFFF", 7), rect(0, 0, W, 23, "#FFFFFF"), rect(0, 23, W, 2.5, "#D71920")],
            text=("CABC", "#D71920", 20, 8.5, 38),
        ),
        # Talleres: franjas azules y blancas, jefe azul con las siglas.
        "TAL": dict(
            shape="swiss",
            field=[vstripes(NAVY, "#FFFFFF", 7), rect(0, 0, W, 24, NAVY)],
            text=("CAT", "#FFFFFF", 20, 8.5, 30),
        ),
        # Gimnasia La Plata: óvalo blanco con la banda azul y las siglas.
        "GLP": dict(
            shape="oval",
            field=[rect(0, 0, W, H, "#FFFFFF"), rect(0, 27, W, 18, NAVY)],
            text=("GELP", "#FFFFFF", 41.5, 10, 40),
        ),
        # Defensa y Justicia: mitades amarilla y verde, iniciales en franja verde.
        "DYJ": dict(
            shape="french",
            field=[rect(0, 0, 32, H, "#FFD200"), rect(32, 0, 32, H, "#00843D"), rect(0, 25, W, 16, INK)],
            text=("DYJ", "#FFD200", 37.5, 10, 30),
        ),
        # Instituto: redondo, franjas rojas y blancas con banda blanca y las siglas.
        "INS": dict(
            shape="round",
            field=[vstripes("#E30613", "#FFFFFF", 7), rect(0, 27, W, 17, "#FFFFFF"), rect(0, 27, W, 2, "#E30613"), rect(0, 42, W, 2, "#E30613")],
            text=("IACC", "#E30613", 40, 9, 36),
        ),
        # Unión: franjas rojas y blancas con jefe blanco.
        "UNI": dict(
            shape="heater",
            field=[vstripes("#E30613", "#FFFFFF", 7), rect(0, 0, W, 23, "#FFFFFF"), rect(0, 23, W, 2.5, "#E30613")],
            text=("CAU", "#E30613", 20, 8.5, 30),
        ),
        # San Lorenzo: franjas azulgranas y las siglas en blanco al centro.
        "SLO": dict(
            shape="swiss",
            field=[vstripes("#002F6C", "#D7141A", 7), rect(6, 27, 52, 16, "#002F6C")],
            text=("CASLA", "#FFFFFF", 39.5, 10, 46),
        ),
        # Belgrano: celeste con las siglas grandes en blanco.
        "BEL": dict(
            shape="swiss",
            field=[rect(0, 0, W, H, "#4FA3DF")],
            text=("CAB", "#FFFFFF", 44, 22, 40),
        ),
        # Gimnasia Mendoza: rayas horizontales blancas y negras, jefe negro.
        "GMZ": dict(
            shape="heater",
            field=[hoops("#FFFFFF", "#111111", 7), rect(0, 0, W, 24, "#111111")],
            text=("GYEM", "#FFFFFF", 20, 8.5, 38),
        ),
        # Platense: blanco con la banda marrón y las siglas.
        "PLA": dict(
            shape="heater",
            field=[rect(0, 0, W, H, "#FFFFFF"), rect(0, 26, W, 16, "#5B3A1E")],
            text=("CAP", "#FFFFFF", 38.5, 10, 30),
        ),
        # Tigre: azul con la banda roja y las siglas.
        "TIG": dict(
            shape="heater",
            field=[rect(0, 0, W, H, NAVY), rect(0, 25, W, 17, "#D7141A")],
            text=("CAT", "#FFFFFF", 38, 11, 30),
        ),
        # Deportivo Riestra: negro con filete blanco y las siglas.
        "RIE": dict(
            shape="heater",
            field=[rect(0, 0, W, H, "#111111"), '<path d="M12 12 H52 V30 C52 45 43 54 32 59 C21 54 12 45 12 30 Z" fill="none" stroke="#FFFFFF" stroke-width="2.5"/>'],
            text=("CDR", "#FFFFFF", 39, 14, 30),
        ),
        # Newell's: mitades roja y negra, jefe blanco con las siglas.
        "NOB": dict(
            shape="heater",
            field=[rect(0, 0, 32, H, "#D7141A"), rect(32, 0, 32, H, "#111111"), rect(0, 0, W, 23, "#FFFFFF")],
            text=("CANOB", "#111111", 20, 8.5, 44),
        ),
        # Atlético Tucumán: franjas celestes y blancas, jefe celeste con las siglas.
        "ATU": dict(
            shape="french",
            field=[vstripes("#6CACE4", "#FFFFFF", 7), rect(0, 0, W, 24, "#6CACE4")],
            text=("CAT", "#FFFFFF", 20, 8.5, 30),
        ),
        # Central Córdoba: franjas negras y blancas, jefe blanco con las siglas.
        "CCO": dict(
            shape="swiss",
            field=[vstripes("#111111", "#FFFFFF", 7), rect(0, 0, W, 23, "#FFFFFF"), rect(0, 23, W, 2.5, "#111111")],
            text=("CACC", "#111111", 20, 8.5, 38),
        ),
        # Sarmiento (Junín): verde con banda blanca y las siglas.
        "SAR": dict(
            shape="heater",
            field=[rect(0, 0, W, H, "#00843D"), rect(0, 25, W, 17, "#FFFFFF")],
            text=("CAS", "#00843D", 38, 11, 30),
        ),
        # Banfield: franjas verdes y blancas, jefe verde con las siglas.
        "BAN": dict(
            shape="heater",
            field=[vstripes("#00843D", "#FFFFFF", 7), rect(0, 0, W, 24, "#00843D")],
            text=("CAB", "#FFFFFF", 20, 8.5, 30),
        ),
        # Godoy Cruz: franjas azules y blancas, jefe blanco con las siglas.
        "GOD": dict(
            shape="french",
            field=[vstripes("#0B3B8C", "#FFFFFF", 7), rect(0, 0, W, 23, "#FFFFFF"), rect(0, 23, W, 2.5, "#0B3B8C")],
            text=("CDGC", "#0B3B8C", 20, 8.5, 38),
        ),
        # Tristán Suárez: celeste con la banda marrón y las siglas.
        "TSU": dict(
            shape="swiss",
            field=[rect(0, 0, W, H, "#7BB6E8"), rect(0, 25, W, 17, "#5B3A1E")],
            text=("CSDTS", "#FFFFFF", 38, 10, 40),
        ),
    }


def crest_svg(team: dict, spec: dict, letters: Lettering) -> str:
    clip = SHAPES[spec["shape"]]
    txt, color, base, cap, maxw = spec["text"]
    d = letters.path(txt, 32, base, cap, maxw)
    rot = spec.get("text_rot")
    text = f'<path d="{d}" fill="{color}"' + (f' transform="rotate({rot[0]} {rot[1]} {rot[2]})"' if rot else "") + "/>"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{team["name"]}">'
        f'<defs><clipPath id="c"><path d="{clip}"/></clipPath></defs>'
        f'<g clip-path="url(#c)">{"".join(spec["field"])}{text}{"".join(spec.get("over", []))}</g>'
        f'<path d="{clip}" fill="none" stroke="{INK}" stroke-width="3.5" stroke-linejoin="round"/>'
        "</svg>\n"
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("uso: build_crests.py <font.ttf>")
    letters = Lettering(sys.argv[1])
    specs = crests()
    n = 0
    for f in sorted((ROOT / "data" / "teams").glob("*.json")):
        for team in json.loads(f.read_text()):
            if not team.get("crest_asset"):
                continue
            spec = specs.get(team["code"])
            if spec is None:
                sys.exit(f"✗ falta la ficha del escudo de {team['code']} ({team['name']})")
            out = ROOT / "public" / "crests" / f'{team["crest_asset"]}.svg'
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(crest_svg(team, spec, letters))
            n += 1
    print(f"✓ {n} escudos")


if __name__ == "__main__":
    main()
