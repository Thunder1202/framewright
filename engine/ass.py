"""Builds .ass subtitle files with word-by-word highlighting.

How it works: for every spoken word we write one subtitle "event" that shows
the whole caption line with that word in the highlight colour. The event
lasts until the next word starts. We place every row of text ourselves
(\\pos), so boxes behind the text line up exactly.
"""
from . import styles as styles_mod
from .captions import display_times

REFERENCE_WIDTH = 1080        # font sizes in styles.json are meant for this video width
ROW_GAP = 0.14                # space between two rows of text, as a share of the font size
# On vertical videos, apps (TikTok, Reels, Shorts) draw buttons over the edges.
VERTICAL_SAFE_BOTTOM = 14     # % of height kept free at the bottom
VERTICAL_SAFE_TOP = 10        # % of height kept free at the top
VERTICAL_MAX_WIDTH = 84       # % of width a caption may use


def ass_color(hex_color, opacity=100):
    """Convert "#RRGGBB" (+ opacity in %) to the ASS format &HAABBGGRR."""
    h = str(hex_color).lstrip("#")
    if len(h) != 6:
        h = "FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    alpha = round(255 * (1 - max(0, min(100, opacity)) / 100))
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_time(seconds):
    """Format seconds as an ASS timestamp: 0:00:01.25"""
    cs = int(round(max(seconds, 0) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def escape_text(text):
    """Remove the characters that have a special meaning inside ASS text."""
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def rounded_box(x0, y0, x1, y1, radius):
    """ASS drawing commands for a rectangle with rounded corners."""
    r = max(0, min(radius, (x1 - x0) / 2, (y1 - y0) / 2))
    k = r * 0.5523  # how far the curve handles sit from the corner
    p = lambda v: f"{v:.1f}"
    return (
        f"m {p(x0 + r)} {p(y0)} l {p(x1 - r)} {p(y0)} "
        f"b {p(x1 - r + k)} {p(y0)} {p(x1)} {p(y0 + r - k)} {p(x1)} {p(y0 + r)} "
        f"l {p(x1)} {p(y1 - r)} "
        f"b {p(x1)} {p(y1 - r + k)} {p(x1 - r + k)} {p(y1)} {p(x1 - r)} {p(y1)} "
        f"l {p(x0 + r)} {p(y1)} "
        f"b {p(x0 + r - k)} {p(y1)} {p(x0)} {p(y1 - r + k)} {p(x0)} {p(y1 - r)} "
        f"l {p(x0)} {p(y0 + r)} "
        f"b {p(x0)} {p(y0 + r - k)} {p(x0 + r - k)} {p(y0)} {p(x0 + r)} {p(y0)}"
    )


def layout_rows(words, font, font_size, max_width):
    """Decide how a caption line is broken into rows so it fits the video width.

    Returns (rows, font_size): rows is a list of lists of word indexes (one
    or two rows). If even two rows are too wide, the font size is reduced.
    """
    def width(indexes):
        return font.text_width(" ".join(words[i] for i in indexes), font_size)

    everything = list(range(len(words)))
    if len(words) < 2 or width(everything) <= max_width:
        rows = [everything]
    else:
        # Try every break point and keep the most balanced one.
        best = min(range(1, len(words)), key=lambda cut: max(width(everything[:cut]), width(everything[cut:])))
        rows = [everything[:best], everything[best:]]
    widest = max(width(r) for r in rows)
    if widest > max_width:
        font_size = font_size * max_width / widest
    return rows, font_size


def build_ass(lines, style, width, height):
    """Return the full text of an .ass file for these caption lines.

    lines: caption lines (see captions.py). style: one preset from styles.json.
    width/height: size of the video the captions will be burned into.
    """
    font = styles_mod.load_font(style["font"])
    scale = min(width, height) / REFERENCE_WIDTH
    base_size = style["font_size"] * scale
    vertical = height > width
    max_width_pct = min(style["max_width"], VERTICAL_MAX_WIDTH) if vertical else style["max_width"]
    max_width = width * max_width_pct / 100
    box = style.get("box", "none")
    pad_x = style["box_padding_x"] * scale if box != "none" else 0
    pad_y = style["box_padding_y"] * scale if box != "none" else 0
    if box == "line":
        max_width -= 2 * pad_x

    def short(hex_color):
        """Colour for use inside a line of text: &HBBGGRR&"""
        return "&H" + ass_color(hex_color)[4:] + "&"

    text_color, active_color, box_color = (short(style[k]) for k in ("text_color", "active_color", "box_color"))
    box_alpha = ass_color("#000000", style["box_opacity"])[:4] + "&"                       # &HAA&

    header = [
        "[Script Info]",
        "; Made by Kadr",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,{font},{size:.1f},{primary},{primary},{outline},&H96000000,{bold},0,0,0,"
        "100,100,0,0,1,{ow:.1f},{sh:.1f},5,0,0,0,1".format(
            font=font.family, size=base_size, primary=ass_color(style["text_color"]),
            outline=ass_color(style["outline_color"]), bold=-1 if font.bold else 0,
            ow=style["outline_width"] * scale, sh=style["shadow"] * scale),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    events = []   # each: [layer, start, end, text]

    def add(layer, start, end, text):
        """Add an event, or stretch the previous identical one (keeps the file small)."""
        for ev in reversed(events[-8:]):
            if ev[0] == layer and ev[3] == text and abs(ev[2] - start) < 0.011:
                ev[2] = end
                return
        events.append([layer, start, end, text])

    for line, (show_start, show_end) in zip(lines, display_times(lines)):
        words = [escape_text(w["word"]) for w in line["words"]]
        if style["uppercase"]:
            words = [w.upper() for w in words]
        if not words:
            continue
        rows, size = layout_rows(words, font, base_size, max_width)
        space = font.text_width(" ", size)
        pitch = size + 2 * pad_y + size * ROW_GAP          # distance between row centres
        block = pitch * len(rows) - size * ROW_GAP          # height of all rows together

        # Vertical placement of the block of rows.
        margin = style["margin"]
        if style["position"] == "top":
            top = height * max(margin, VERTICAL_SAFE_TOP if vertical else 0) / 100
        elif style["position"] == "middle":
            top = (height - block) / 2
        else:
            top = height * (1 - max(margin, VERTICAL_SAFE_BOTTOM if vertical else 0) / 100) - block
        cx = width / 2
        size_tag = f"\\fs{size:.1f}" if abs(size - base_size) > 0.05 else ""

        # Where each row and each word sits.
        row_info = []          # (centre_y, left_x, row_width, word indexes)
        word_box = {}          # word index -> (x0, x1, centre_y)
        for r, indexes in enumerate(rows):
            cy = top + pad_y + size / 2 + r * pitch
            row_width = font.text_width(" ".join(words[i] for i in indexes), size)
            left = cx - row_width / 2
            row_info.append((cy, left, row_width, indexes))
            x = left
            for i in indexes:
                w = font.text_width(words[i], size)
                word_box[i] = (x, x + w, cy)
                x += w + space

        # Boxes behind whole rows (drawn once for the whole time the line is visible).
        draw_tag = f"{{\\an7\\pos(0,0)\\bord0\\shad0\\1c{box_color}\\1a{box_alpha}\\p1}}"
        if box == "line":
            for cy, left, row_width, _ in row_info:
                shape = rounded_box(left - pad_x, cy - size / 2 - pad_y, left + row_width + pad_x,
                                    cy + size / 2 + pad_y, style["box_radius"] * scale)
                add(0, show_start, show_end, draw_tag + shape)

        # One step per word: that word is highlighted until the next word starts.
        starts = [max(w["start"], show_start) for w in line["words"]]
        starts[0] = show_start
        for k in range(len(words)):
            step_start = starts[k]
            step_end = starts[k + 1] if k + 1 < len(words) else show_end
            if step_end - step_start < 0.005:
                continue
            if box == "word":
                x0, x1, cy = word_box[k]
                shape = rounded_box(x0 - pad_x, cy - size / 2 - pad_y, x1 + pad_x,
                                    cy + size / 2 + pad_y, style["box_radius"] * scale)
                add(0, step_start, step_end, draw_tag + shape)
            for cy, _, _, indexes in row_info:
                parts = []
                for i in indexes:
                    if i == k:
                        parts.append(f"{{\\1c{active_color}}}{words[i]}{{\\1c{text_color}}}")
                    else:
                        parts.append(words[i])
                text = f"{{\\an5\\pos({cx:.1f},{cy:.1f}){size_tag}}}" + " ".join(parts)
                add(1, step_start, step_end, text)

    events.sort(key=lambda ev: (ev[1], ev[0]))
    body = [f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{text}"
            for layer, start, end, text in events if ass_time(end) != ass_time(start)]
    return "\n".join(header + body) + "\n"
