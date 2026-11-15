"""Tests for: words per line, multi-step undo/redo, text size, title text, adding lines."""
import pytest

from engine import ass, captions, jobs, render, styles
from engine.errors import KadrError


def make_words(text, start=0.0, step=0.4):
    words, t = [], start
    for token in text.split():
        words.append({"word": token, "start": round(t, 3), "end": round(t + step, 3)})
        t += step
    return words


TEXT = ("Bugun men sizlarga juda qiziqarli bir voqeani aytib bermoqchiman chunki bu "
        "voqea mening hayotimni butunlay o‘zgartirib yubordi va hozir ham eslayman")


# ---------- words per line ----------

@pytest.mark.parametrize("n", captions.WORDS_CHOICES)
def test_exact_words_per_line_is_never_exceeded(n):
    lines = captions.split_into_lines([{"words": make_words(TEXT)}], max_words=n)
    assert all(1 <= len(l["words"]) <= n for l in lines)
    assert " ".join(l["text"] for l in lines) == TEXT


def test_three_words_gives_mostly_three_word_lines():
    lines = captions.split_into_lines([{"words": make_words(TEXT)}], max_words=3)
    assert sum(len(l["words"]) == 3 for l in lines) >= len(lines) - 2


def test_reflow_keeps_edited_text_and_timing():
    lines = captions.split_into_lines([{"words": make_words(TEXT)}])
    lines[0] = captions.set_line_text(lines[0], "EDITED " + " ".join(lines[0]["text"].split()[1:]))
    new = captions.reflow(lines, 2)
    assert new[0]["words"][0]["word"] == "EDITED"
    assert all(len(l["words"]) <= 2 for l in new)
    assert new[0]["start"] == lines[0]["start"] and new[-1]["end"] == lines[-1]["end"]
    back = captions.reflow(new, None)            # back to automatic
    assert all(len(l["words"]) <= captions.MAX_WORDS for l in back)


@pytest.mark.parametrize("value,expected", [("3", 3), (3, 3), ("", None), (None, None), ("auto", None), (9, None)])
def test_clean_max_words(value, expected):
    assert captions.clean_max_words(value) == expected


# ---------- adding a line ----------

def test_insert_line_at_start_and_after():
    lines = captions.split_into_lines([{"words": make_words(TEXT, start=2.0)}], max_words=3)
    first = captions.insert_line(lines, -1, "Hello there")
    assert first[0]["text"] == "Hello there" and first[0]["start"] == 0.0
    assert len(first) == len(lines) + 1
    last = captions.insert_line(lines, len(lines) - 1, "The end")
    assert last[-1]["text"] == "The end" and last[-1]["start"] >= lines[-1]["end"]


# ---------- undo / redo ----------

def test_many_undo_and_redo_steps(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    versions = [[{"start": i, "end": i + 1, "text": f"v{i}", "words": []}] for i in range(5)]
    jobs.save_captions(job["id"], versions[0], tmp_path)
    for v in versions[1:]:
        jobs.save_captions_with_history(job["id"], v, tmp_path)
    assert jobs.history_counts(job["id"], tmp_path) == {"undo": 4, "redo": 0}
    assert jobs.undo_captions(job["id"], tmp_path) == versions[3]
    assert jobs.undo_captions(job["id"], tmp_path) == versions[2]
    assert jobs.undo_captions(job["id"], tmp_path) == versions[1]
    assert jobs.history_counts(job["id"], tmp_path) == {"undo": 1, "redo": 3}
    assert jobs.redo_captions(job["id"], tmp_path) == versions[2]
    assert jobs.load_captions(job["id"], tmp_path) == versions[2]
    # A new edit after Undo throws the Redo steps away, like in any editor.
    jobs.save_captions_with_history(job["id"], versions[4], tmp_path)
    assert jobs.history_counts(job["id"], tmp_path) == {"undo": 3, "redo": 0}
    with pytest.raises(KadrError):
        jobs.redo_captions(job["id"], tmp_path)


def test_history_is_limited(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    jobs.save_captions(job["id"], [], tmp_path)
    for i in range(jobs.HISTORY_LIMIT + 10):
        jobs.save_captions_with_history(job["id"], [{"text": str(i)}], tmp_path)
    assert jobs.history_counts(job["id"], tmp_path)["undo"] == jobs.HISTORY_LIMIT


def test_nothing_to_undo(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    jobs.save_captions(job["id"], [], tmp_path)
    with pytest.raises(KadrError):
        jobs.undo_captions(job["id"], tmp_path)


# ---------- size and title ----------

def test_size_changes_font_size():
    medium = styles.get_style("bold_white")
    small = styles.get_style("bold_white", "small")
    large = styles.get_style("bold_white", "large")
    assert small["font_size"] < medium["font_size"] < large["font_size"]
    assert styles.get_style("bold_white", "nonsense")["font_size"] == medium["font_size"]
    # The preset itself must not be changed by asking for a size.
    assert styles.get_style("bold_white")["font_size"] == medium["font_size"]


def test_title_is_written_into_the_ass_file():
    lines = captions.split_into_lines([{"words": make_words("Salom dunyo bu test")}])
    style = styles.get_style("boxed")
    text = ass.build_ass(lines, style, 1080, 1920, title=render.title_times({"text": "Part 1", "seconds": 3}, 20))
    title_events = [l for l in text.splitlines() if l.startswith("Dialogue: 3,")]
    assert title_events and "Part 1" in title_events[0]
    assert "0:00:00.00,0:00:03.00" in title_events[0]
    assert any(l.startswith("Dialogue: 2,") for l in text.splitlines())   # its box


def test_title_whole_video_and_empty_title():
    assert render.title_times({"text": "Hi", "seconds": 0}, 42.5)["end"] == 42.5
    assert render.title_times({"text": "  ", "seconds": 3}, 10) is None
    assert render.title_times(None, 10) is None
