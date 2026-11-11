"""Tests for job storage (jobs/<id>/ folders) and the custom dictionary."""
import json
import time

import pytest

from engine import dictionary, jobs
from engine.errors import KadrError

LINES = [{"start": 0.0, "end": 1.0, "text": "salom dunyo",
          "words": [{"word": "salom", "start": 0.0, "end": 0.5}, {"word": "dunyo", "start": 0.5, "end": 1.0}]}]


def test_create_makes_its_own_folder(tmp_path):
    job = jobs.create_job("My Clip.MOV", {"language": "uz"}, jobs_dir=tmp_path)
    folder = tmp_path / job["id"]
    assert folder.is_dir() and (folder / "job.json").is_file()
    assert job["status"] == "queued"
    assert job["video_file"] == "source.mov"
    assert job["options"] == {"language": "uz"}
    assert jobs.job_dir(job["id"], tmp_path) == folder


def test_ids_are_unique(tmp_path):
    ids = {jobs.create_job("a.mp4", jobs_dir=tmp_path)["id"] for _ in range(20)}
    assert len(ids) == 20


def test_update_is_saved_to_disk(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    jobs.update_job(job["id"], tmp_path, status="ready", progress=1.0)
    on_disk = json.loads((tmp_path / job["id"] / "job.json").read_text(encoding="utf-8"))
    assert on_disk["status"] == "ready" and on_disk["progress"] == 1.0
    assert jobs.load_job(job["id"], tmp_path)["name"] == "a.mp4"


def test_captions_survive_a_restart(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    jobs.save_captions(job["id"], LINES, tmp_path)
    # "Restart": nothing is kept in memory, everything is read from the folder again.
    assert jobs.load_captions(job["id"], tmp_path) == LINES
    assert "ў" not in (tmp_path / job["id"] / "captions.json").read_text(encoding="utf-8")


def test_non_ascii_text_is_stored_readably(tmp_path):
    job = jobs.create_job("видео.mp4", jobs_dir=tmp_path)
    lines = [dict(LINES[0], text="Ўзбекистон o‘zbek")]
    jobs.save_captions(job["id"], lines, tmp_path)
    raw = (tmp_path / job["id"] / "captions.json").read_text(encoding="utf-8")
    assert "Ўзбекистон o‘zbek" in raw
    assert jobs.load_job(job["id"], tmp_path)["name"] == "видео.mp4"


def test_list_is_newest_first_and_skips_broken_folders(tmp_path):
    first = jobs.create_job("first.mp4", jobs_dir=tmp_path)
    time.sleep(0.02)
    second = jobs.create_job("second.mp4", jobs_dir=tmp_path)
    (tmp_path / "20200101-000000-abcdef").mkdir()               # folder without job.json
    (tmp_path / "not-a-job").mkdir()
    assert [j["id"] for j in jobs.list_jobs(tmp_path)] == [second["id"], first["id"]]


def test_delete_removes_the_folder(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    jobs.delete_job(job["id"], tmp_path)
    assert not (tmp_path / job["id"]).exists()
    with pytest.raises(KadrError):
        jobs.load_job(job["id"], tmp_path)


@pytest.mark.parametrize("bad_id", ["../secret", "..", "abc", "20200101-000000-abcdef/../..", ""])
def test_bad_ids_are_rejected(tmp_path, bad_id):
    with pytest.raises(KadrError):
        jobs.job_dir(bad_id, tmp_path)


def test_missing_captions_give_friendly_error(tmp_path):
    job = jobs.create_job("a.mp4", jobs_dir=tmp_path)
    with pytest.raises(KadrError):
        jobs.load_captions(job["id"], tmp_path)


def test_strange_extension_falls_back_to_mp4(tmp_path):
    job = jobs.create_job("clip.<script>", jobs_dir=tmp_path)
    assert job["video_file"] == "source.mp4"


# ---------- dictionary ----------

def words(text):
    return [{"word": t, "start": float(i), "end": i + 0.5} for i, t in enumerate(text.split())]


def test_dictionary_replaces_single_words_and_keeps_punctuation():
    rules = dictionary.parse_dictionary("# note\ninstagramm => Instagram\nToshkent\n")
    out = dictionary.apply_to_words(words("men toshkent, shahrida Instagramm! ochdim"), rules)
    assert " ".join(w["word"] for w in out) == "men Toshkent, shahrida Instagram! ochdim"
    assert [w["start"] for w in out] == [0.0, 1.0, 2.0, 3.0, 4.0]      # timings untouched


def test_dictionary_phrase_to_one_word_keeps_time_span():
    rules = dictionary.parse_dictionary("ok tepa => Oqtepa")
    out = dictionary.apply_to_words(words("biz ok tepa lavashga bordik"), rules)
    assert [w["word"] for w in out] == ["biz", "Oqtepa", "lavashga", "bordik"]
    assert out[1]["start"] == 1.0 and out[1]["end"] == 2.5


def test_dictionary_ignores_apostrophe_style_and_case():
    rules = dictionary.parse_dictionary("O‘zbekiston")
    out = dictionary.apply_to_words(words("o'zbekiston OʻZBEKISTON"), rules)
    assert [w["word"] for w in out] == ["O‘zbekiston", "O‘zbekiston"]


def test_dictionary_segments_and_missing_file(tmp_path):
    assert dictionary.load_dictionary(tmp_path / "nope.txt") == []
    seg = [{"start": 0, "end": 2, "text": "salom toshkent", "words": words("salom toshkent")}]
    out = dictionary.apply_to_segments(seg, dictionary.parse_dictionary("Toshkent"))
    assert out[0]["text"] == "salom Toshkent"
    assert seg[0]["text"] == "salom toshkent"            # input not modified
