"""Loading caption style presets from styles.json and measuring text with the fonts."""
import functools
import json

from . import config
from .errors import KadrError

# Used for any key a preset in styles.json leaves out.
STYLE_DEFAULTS = {
    "label": "Style", "font": "NotoSans-Bold.ttf", "font_size": 60, "uppercase": False,
    "text_color": "#FFFFFF", "active_color": "#FFE100", "outline_color": "#000000",
    "outline_width": 4, "shadow": 0, "box": "none", "box_color": "#000000",
    "box_opacity": 80, "box_padding_x": 24, "box_padding_y": 10, "box_radius": 20,
    "position": "bottom", "margin": 14, "max_width": 86,
}
# "Text size" choice in the editor: multiplies the style's font_size.
SIZES = {"small": 0.8, "medium": 1.0, "large": 1.25, "xl": 1.5}
# Letters every caption font must contain (Uzbek Latin + Cyrillic + Russian).
REQUIRED_CHARS = "o‘g‘ʻʼ’ўқғҳЎҚҒҲёъэюяшчцщыьжй"


def load_styles(path=None):
    """Return {style_id: style_dict} from styles.json, with defaults filled in."""
    path = path or config.STYLES_FILE
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        raise KadrError("styles.json is missing from the project folder.")
    except ValueError as e:
        raise KadrError(f"styles.json has a typo and could not be read: {e}")
    styles = {}
    for style_id, preset in raw.items():
        if style_id.startswith("_") or not isinstance(preset, dict):
            continue  # "_help" and other notes
        style = dict(STYLE_DEFAULTS)
        style.update(preset)
        style["id"] = style_id
        styles[style_id] = style
    if not styles:
        raise KadrError("styles.json contains no styles.")
    return styles


def get_style(style_id=None, size=None):
    """Return one style by id (the first style in the file if id is empty).

    size: "small", "medium", "large" or "xl" makes the text smaller or bigger.
    """
    styles = load_styles()
    if not style_id:
        style = next(iter(styles.values()))
    elif style_id not in styles:
        raise KadrError(f"Unknown style '{style_id}'. Available: {', '.join(styles)}")
    else:
        style = styles[style_id]
    style = dict(style)
    style["size"] = size if size in SIZES else "medium"
    style["font_size"] = style["font_size"] * SIZES[style["size"]]
    return style


class Font:
    """Reads a .ttf file so we can measure how wide a text will be on screen."""

    def __init__(self, path):
        from fontTools.ttLib import TTFont
        self.path = path
        tt = TTFont(str(path), lazy=True)
        self.cmap = tt.getBestCmap()
        self.advances = {name: adv for name, (adv, _) in tt["hmtx"].metrics.items()}
        names = tt["name"]
        self.family = names.getDebugName(1) or path.stem     # name used in the ASS file
        self.bold = "bold" in (names.getDebugName(2) or "").lower()
        os2, hhea = tt["OS/2"], tt["hhea"]
        # libass sizes fonts so that (winAscent + winDescent) equals the font size.
        self.cell_height = (os2.usWinAscent + os2.usWinDescent) or (hhea.ascent - hhea.descent)
        self.units_per_em = tt["head"].unitsPerEm
        self.fallback_advance = self.units_per_em * 0.6
        # CSS font-size is the "em"; ASS font size is the taller "cell". Their ratio:
        self.em_ratio = self.units_per_em / self.cell_height

    def text_width(self, text, font_size):
        """Width in pixels of `text` drawn at `font_size` (the ASS font size)."""
        units = sum(self.advances.get(self.cmap.get(ord(ch)), self.fallback_advance) for ch in text)
        return units * font_size / self.cell_height

    def missing_chars(self, text):
        """Characters of `text` this font cannot draw."""
        return [ch for ch in text if not ch.isspace() and ord(ch) not in self.cmap]


@functools.lru_cache(maxsize=16)
def load_font(font_file):
    """Load a font from engine/fonts/ (cached)."""
    path = config.FONTS_DIR / font_file
    if not path.is_file():
        raise KadrError(f"Font file '{font_file}' was not found in engine/fonts/.")
    try:
        return Font(path)
    except Exception as e:
        raise KadrError(f"Font file '{font_file}' could not be read: {e}")
