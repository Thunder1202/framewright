"""Tests for splitting words into caption lines and for the editing functions."""
import pytest

from engine import captions


def make_words(text, start=0.0, step=0.4, gap=0.0):
    """Helper: evenly spaced word dicts for a sentence."""
    words = []
    t = start
    for token in text.split():
        words.append({"word": token, "start": round(t, 3), "end": round(t + step, 3)})
        t += step + gap
    return words


def segment(text, **kw):
    words = make_words(text, **kw)
    return {"start": words[0]["start"], "end": words[-1]["end"], "text": text, "words": words}


LONG = ("Bugun men sizlarga juda qiziqarli bir voqeani aytib bermoqchiman chunki bu "
        "voqea mening hayotimni butunlay o‘zgartirib yubordi va hozir ham eslayman")


def test_lines_respect_limits():
    lines = captions.split_into_lines([segment(LONG)])
    assert len(lines) > 3
    for line in lines:
        assert 2 <= len(line["words"]) <= captions.MAX_WORDS
        assert len(line["text"]) <= captions.MAX_CHARS
        assert line["text"] == " ".join(w["word"] for w in line["words"])
        assert line["start"] == line["words"][0]["start"]
        assert line["end"] == line["words"][-1]["end"]


def test_no_words_lost_or_reordered():
    lines = captions.split_into_lines([segment(LONG)])
    assert " ".join(l["text"] for l in lines) == LONG


@pytest.mark.parametrize("count", range(2, 30))
def test_never_a_one_word_orphan_at_segment_end(count):
    text = " ".join(["soz"] * count)
    lines = captions.split_into_lines([segment(text)])
    assert len(lines[-1]["words"]) >= 2
    assert sum(len(l["words"]) for l in lines) == count


def test_orphan_fixed_with_long_words():
    # The greedy split would leave "tugadi." alone on the last line.
    text = "birinchidan ikkinchidan uchinchidan to‘rtinchidan tugadi."
    lines = captions.split_into_lines([segment(text)])
    assert len(lines[-1]["words"]) >= 2
    assert " ".join(l["text"] for l in lines) == text


def test_single_word_segment_is_kept():
    lines = captions.split_into_lines([segment("Salom!")])
    assert [l["text"] for l in lines] == ["Salom!"]


def test_pause_starts_new_line():
    words = make_words("bir ikki uch") + make_words("to‘rt besh olti", start=5.0)
    lines = captions.split_into_lines([{"words": words}])
    assert [l["text"] for l in lines] == ["bir ikki uch", "to‘rt besh olti"]


def test_sentence_end_starts_new_line():
    lines = captions.split_into_lines([segment("Bu birinchi gap. Bu esa ikkinchi gap.")])
    assert lines[0]["text"] == "Bu birinchi gap."


def test_empty_input():
    assert captions.split_into_lines([]) == []
    assert captions.split_into_lines([{"words": []}]) == []


def test_set_text_same_word_count_keeps_timings():
    line = captions.split_into_lines([segment("salom dunyo yaxshi")])[0]
    new = captions.set_line_text(line, "Salom Dunyo zo‘r")
    assert [w["start"] for w in new["words"]] == [w["start"] for w in line["words"]]
    assert new["text"] == "Salom Dunyo zo‘r"


def test_set_text_different_word_count_spreads_timings():
    line = captions.split_into_lines([segment("salom dunyo yaxshi")])[0]
    new = captions.set_line_text(line, "salom go‘zal katta dunyo yaxshi")
    assert len(new["words"]) == 5
    assert new["words"][0]["start"] == line["start"]
    assert new["words"][-1]["end"] == line["end"]
    starts = [w["start"] for w in new["words"]]
    assert starts == sorted(starts)


def test_split_and_merge_are_opposites():
    lines = captions.split_into_lines([segment("bir ikki uch to‘rt")])
    parts = captions.split_line(lines, 0, 2)
    assert [l["text"] for l in parts] == ["bir ikki", "uch to‘rt"]
    assert parts[0]["end"] <= parts[1]["start"]
    merged = captions.merge_lines(parts, 0)
    assert merged[0]["text"] == "bir ikki uch to‘rt"
    assert merged[0]["start"] == lines[0]["start"] and merged[0]["end"] == lines[0]["end"]


def test_split_at_edge_is_refused():
    lines = captions.split_into_lines([segment("bir ikki uch")])
    with pytest.raises(ValueError):
        captions.split_line(lines, 0, 0)
    with pytest.raises(ValueError):
        captions.merge_lines(lines, 0)       # no next line


def test_nudge_moves_times_and_words():
    lines = captions.split_into_lines([segment("bir ikki uch", start=1.0)])
    moved = captions.nudge_line(lines, 0, start_delta=-0.2, end_delta=0.3)
    assert moved[0]["start"] == pytest.approx(0.8)
    assert moved[0]["end"] == pytest.approx(lines[0]["end"] + 0.3)
    assert moved[0]["words"][0]["start"] == pytest.approx(0.8)
    assert moved[0]["words"][-1]["end"] == pytest.approx(moved[0]["end"])
    assert lines[0]["start"] == 1.0      # the original list is not changed


def test_nudge_cannot_overlap_neighbours_or_go_negative():
    words = make_words("bir ikki") + make_words("uch to‘rt", start=2.0)
    lines = captions.split_into_lines([{"words": words}])
    moved = captions.nudge_line(lines, 1, start_delta=-5.0)
    assert moved[1]["start"] >= moved[0]["end"]
    moved = captions.nudge_line(lines, 0, start_delta=-5.0)
    assert moved[0]["start"] == 0.0
    moved = captions.nudge_line(lines, 0, end_delta=50.0)
    assert moved[0]["end"] <= lines[1]["start"]


def test_clean_lines_repairs_editor_input():
    raw = [{"start": 2, "end": 3, "text": "  ikkinchi   qator "},
           {"start": 0, "end": 1, "text": ""},
           {"start": 0.5, "end": 1.5, "text": "birinchi qator"}]
    cleaned = captions.clean_lines(raw)
    assert [l["text"] for l in cleaned] == ["birinchi qator", "ikkinchi qator"]
    assert len(cleaned[0]["words"]) == 2


def test_srt_format():
    lines = captions.split_into_lines([segment("bir ikki uch", start=1.0), segment("to‘rt besh", start=3661.5)])
    srt = captions.to_srt(lines)
    blocks = srt.strip().split("\n\n")
    assert blocks[0].splitlines()[0] == "1"
    assert blocks[0].splitlines()[1].startswith("00:00:01,000 --> 00:00:02,")
    assert blocks[0].splitlines()[2] == "bir ikki uch"
    assert blocks[1].splitlines()[1].startswith("01:01:01,500 --> ")


def test_display_times_do_not_overlap():
    words = make_words("bir ikki") + make_words("uch to‘rt", start=0.85)
    lines = captions.split_into_lines([{"words": words}], max_pause=0.01)
    times = captions.display_times(lines)
    assert times[0][1] <= times[1][0]
