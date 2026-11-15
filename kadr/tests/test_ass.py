"""Tests for the ASS subtitle generator, the styles file and the fonts."""
import re

import pytest

from engine import ass, captions, styles

UZBEK_SAMPLE = "Oʻzbekiston g‘isht ma’no Ўзбекистон қалам ғишт ҳафта Ёш Щётка"


def lines_for(text, start=1.0):
    words = []
    t = start
    for token in text.split():
        words.append({"word": token, "start": t, "end": t + 0.3})
        t += 0.4
    return captions.split_into_lines([{"words": words}])


def dialogues(text):
    """Parse 'Dialogue:' rows into (layer, start, end, text) tuples."""
    rows = []
    for row in text.splitlines():
        if row.startswith("Dialogue:"):
            parts = row[len("Dialogue: "):].split(",", 9)
            rows.append((int(parts[0]), parts[1], parts[2], parts[9]))
    return rows


def seconds(stamp):
    h, m, s = stamp.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def test_styles_file_has_the_required_presets():
    all_styles = styles.load_styles()
    assert len(all_styles) >= 4
    boxes = {s["box"] for s in all_styles.values()}
    assert "line" in boxes and "none" in boxes
    assert any(s["active_color"].upper().startswith("#FFE") for s in all_styles.values())   # a yellow one
    for s in all_styles.values():
        assert s["label"] and s["font_size"] > 0


def test_every_style_font_covers_uzbek_and_russian_letters():
    for s in styles.load_styles().values():
        font = styles.load_font(s["font"])
        assert font.missing_chars(styles.REQUIRED_CHARS + UZBEK_SAMPLE) == [], s["font"]


def test_time_and_colour_formats():
    assert ass.ass_time(0) == "0:00:00.00"
    assert ass.ass_time(3661.255) in ("1:01:01.25", "1:01:01.26")
    assert ass.ass_color("#FF8000") == "&H000080FF"          # ASS wants blue-green-red
    assert ass.ass_color("#000000", 50).startswith("&H80") or ass.ass_color("#000000", 50).startswith("&H7F")


def test_header_matches_video_size():
    text = ass.build_ass(lines_for("salom dunyo"), styles.get_style("bold_white"), 1080, 1920)
    assert "PlayResX: 1080" in text and "PlayResY: 1920" in text
    assert "Style: Default,Montserrat ExtraBold," in text
    assert "[Events]" in text


@pytest.mark.parametrize("style_id", list(styles.load_styles()))
def test_one_highlight_step_per_word(style_id):
    style = styles.get_style(style_id)
    lines = lines_for("bir ikki uch")
    rows = [r for r in dialogues(ass.build_ass(lines, style, 1080, 1920)) if r[0] == 1]
    assert len(rows) == 3
    active = ass.ass_color(style["active_color"])[4:]
    expected = [w.upper() if style["uppercase"] else w for w in ("bir", "ikki", "uch")]
    for row, word in zip(rows, expected):
        # the highlighted word follows the active colour tag
        assert re.search(r"\\1c&H" + active + r"&\}" + word + r"\{", row[3]), row[3]
    # steps follow each other without gaps or overlaps
    assert rows[0][2] == rows[1][1] and rows[1][2] == rows[2][1]
    assert seconds(rows[0][1]) == pytest.approx(1.0)
    assert seconds(rows[1][1]) == pytest.approx(1.4)


def test_events_never_overlap_within_text_layer():
    lines = lines_for("bir ikki uch to‘rt besh olti yetti sakkiz to‘qqiz o‘n o‘n bir o‘n ikki")
    rows = [r for r in dialogues(ass.build_ass(lines, styles.get_style("bold_white"), 1920, 1080)) if r[0] == 1]
    spans = sorted((seconds(r[1]), seconds(r[2])) for r in rows)
    for (s1, e1), (s2, e2) in zip(spans, spans[1:]):
        assert e1 <= s2 + 0.001


def test_box_styles_draw_shapes():
    lines = lines_for("bir ikki uch")
    boxed = dialogues(ass.build_ass(lines, styles.get_style("boxed"), 1080, 1920))
    assert sum(1 for r in boxed if r[0] == 0 and "\\p1" in r[3]) == 1        # one box for the line
    word_box = dialogues(ass.build_ass(lines, styles.get_style("word_box"), 1080, 1920))
    assert sum(1 for r in word_box if r[0] == 0 and "\\p1" in r[3]) == 3     # one box per word
    plain = dialogues(ass.build_ass(lines, styles.get_style("bold_white"), 1080, 1920))
    assert not any("\\p1" in r[3] for r in plain)


def test_long_line_wraps_into_two_rows_inside_safe_width():
    style = styles.get_style("yellow_pop")
    font = styles.load_font(style["font"])
    words = "birinchidan ikkinchidan uchinchidan".upper().split()
    rows, size = ass.layout_rows(words, font, style["font_size"], 1080 * 0.84)
    assert len(rows) == 2
    for row in rows:
        assert font.text_width(" ".join(words[i] for i in row), size) <= 1080 * 0.84 + 0.5


def test_huge_word_shrinks_font():
    font = styles.load_font("Montserrat-ExtraBold.ttf")
    rows, size = ass.layout_rows(["A" * 60], font, 70, 900)
    assert size < 70
    assert font.text_width("A" * 60, size) <= 900.5


def test_vertical_video_keeps_bottom_safe_margin():
    style = dict(styles.get_style("minimal"), margin=1)       # tries to sit at the very bottom
    text = ass.build_ass(lines_for("bir ikki"), style, 1080, 1920)
    y = float(re.search(r"\\pos\([\d.]+,([\d.]+)\)", [r for r in dialogues(text) if r[0] == 1][0][3]).group(1))
    assert y < 1920 * (1 - ass.VERTICAL_SAFE_BOTTOM / 100)


def test_special_characters_are_escaped():
    lines = lines_for("salom {\\b1}dunyo")
    text = ass.build_ass(lines, styles.get_style("bold_white"), 1080, 1920)
    assert "{\\b1}" not in text


def test_uzbek_letters_survive():
    text = ass.build_ass(lines_for("Oʻzbekiston g‘isht ўқув ҳафта"), styles.get_style("boxed"), 1080, 1920)
    for token in ("Oʻzbekiston", "g‘isht", "ўқув", "ҳафта"):
        assert token in text


def test_empty_lines_give_valid_file():
    text = ass.build_ass([], styles.get_style("bold_white"), 1080, 1920)
    assert "[Events]" in text and "Dialogue" not in text
