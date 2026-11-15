"""Tests for offline translation of caption lines."""
import pytest

from engine import captions, translate
from engine.errors import KadrError


def lines_from(text, start=0.0, step=0.4):
    words, t = [], start
    for token in text.split():
        words.append({"word": token, "start": round(t, 3), "end": round(t + step - 0.05, 3)})
        t += step
    return captions.split_into_lines([{"words": words}])


def test_sentences_are_grouped_across_lines():
    lines = lines_from("Lie out like a starfish on a mission. Crunch in, touch your heels.")
    groups = translate._sentence_groups(lines)
    joined = [" ".join(lines[i]["text"] for i in g) for g in groups]
    assert joined == ["Lie out like a starfish on a mission.", "Crunch in, touch your heels."]


def test_long_pause_splits_a_group():
    lines = lines_from("hold and breathe") + lines_from("then relax slowly", start=10)
    assert len(translate._sentence_groups(lines)) == 2


def test_unknown_pair_gives_friendly_error():
    with pytest.raises(KadrError, match="not available"):
        translate.ensure_model("uz", "ru")


@pytest.fixture(scope="module")
def en_ru():
    if not (translate._model_dir("en", "ru") / "ready").exists():
        pytest.skip("English→Russian model not downloaded yet")
    return True


def test_real_translation_keeps_sentence_times(en_ru):
    lines = lines_from("First, crucifix crunch. Now the fun one.")
    out = translate.translate_lines(lines, "en", "ru")
    text = " ".join(l["text"] for l in out)
    assert any("а" <= ch <= "я" for ch in text.lower())          # it is Russian now
    assert out[0]["start"] == lines[0]["start"]
    assert out[-1]["end"] == pytest.approx(lines[-1]["end"])
    for line in out:
        assert line["text"] == " ".join(w["word"] for w in line["words"])
        assert len(line["words"]) <= captions.MAX_WORDS
