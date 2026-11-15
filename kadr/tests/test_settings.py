"""Tests for settings.json handling and the model choice."""
import json

from engine import config, transcribe


def use_settings(monkeypatch, tmp_path, data):
    """Point the engine at a temporary settings.json."""
    path = tmp_path / "settings.json"
    path.write_text(data if isinstance(data, str) else json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(config, "SETTINGS_FILE", path)
    monkeypatch.delenv("KADR_MODEL", raising=False)


def test_defaults_when_file_is_missing_or_broken(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "SETTINGS_FILE", tmp_path / "nope.json")
    assert config.load_settings()["max_video_seconds"] == 300
    use_settings(monkeypatch, tmp_path, "{ this is not json")
    assert config.load_settings()["port"] == 8000


def test_user_values_win_and_unknown_keys_are_ignored(monkeypatch, tmp_path):
    use_settings(monkeypatch, tmp_path, {"max_video_seconds": 60, "something_else": 1})
    settings = config.load_settings()
    assert settings["max_video_seconds"] == 60
    assert "something_else" not in settings


def test_auto_model_depends_on_device(monkeypatch, tmp_path):
    use_settings(monkeypatch, tmp_path, {"model": "auto"})
    assert transcribe.default_model("cpu") == "small"
    assert transcribe.default_model("cuda") == "medium"


def test_named_model_and_per_language_models(monkeypatch, tmp_path):
    use_settings(monkeypatch, tmp_path, {"model": "medium", "model_uz": "someone/uzbek-model"})
    assert transcribe.default_model("cpu") == "medium"
    assert transcribe.model_for("uz", "cpu") == "someone/uzbek-model"
    assert transcribe.model_for("ru", "cpu") == "medium"


def test_device_detection_never_crashes():
    assert transcribe.detect_device() in ("cpu", "cuda")


def test_auto_language_choice_prefers_uzbek_unless_confident():
    allowed = ["uz", "ru"]
    # real scores measured on Uzbek speech: Whisper never says "uz"
    assert transcribe.choose_language({"tr": 0.57, "az": 0.17, "ru": 0.014, "uz": 0.004}, allowed) == "uz"
    assert transcribe.choose_language({"az": 0.5, "kk": 0.25, "ru": 0.004}, allowed) == "uz"
    # Russian is detected confidently
    assert transcribe.choose_language({"ru": 0.93, "uz": 0.0}, allowed) == "ru"
    # without Uzbek in the list, the best allowed language wins
    assert transcribe.choose_language({"ru": 0.2, "en": 0.3}, ["ru", "en"]) == "en"


def test_hallucinated_segments_are_dropped():
    from types import SimpleNamespace as Seg
    two_words = [{"word": "a"}, {"word": "b"}]
    # measured: 2 words in 0.08 s, avg_logprob -1.02  -> invented
    assert not transcribe.looks_like_real_speech(Seg(start=13.82, end=13.90, avg_logprob=-1.02, no_speech_prob=0.0), two_words)
    assert not transcribe.looks_like_real_speech(Seg(start=0, end=2, avg_logprob=-1.5, no_speech_prob=0.9), two_words)
    assert transcribe.looks_like_real_speech(Seg(start=0, end=0.8, avg_logprob=-0.1, no_speech_prob=0.0), two_words)


def test_english_is_chosen_when_confident():
    allowed = ["uz", "ru", "en"]
    assert transcribe.choose_language({"en": 0.95}, allowed) == "en"
    assert transcribe.choose_language({"tr": 0.57, "en": 0.1}, allowed) == "uz"


def test_known_hallucinations_are_recognised():
    assert transcribe.is_known_hallucination("o 'zbek tilida o 'zbek tilida.")
    assert transcribe.is_known_hallucination("o‘zbekistonda o‘tmoqda.")
    assert not transcribe.is_known_hallucination("o‘zbek tilida gaplashamiz")
    assert not transcribe.is_known_hallucination("legs up, looks simple")


def test_models_are_kept_inside_the_project():
    """Speech models download to models/hf in the project, not the home folder."""
    import os
    import engine  # noqa: F401
    from engine import config
    assert os.environ["HF_HUB_CACHE"].startswith(str(config.ROOT))


def test_translate_endpoint_refuses_unknown_pairs():
    from fastapi.testclient import TestClient
    from web.app import app
    client = TestClient(app)
    r = client.post("/api/translate", json={"source": "uz", "target": "ru", "texts": ["salom"]})
    assert r.status_code == 400 and "not available" in r.json()["error"]


def test_the_editor_may_call_in_but_other_pages_may_not():
    from fastapi.testclient import TestClient
    from web.app import app
    client = TestClient(app)
    ok = client.get("/api/jobs", headers={"Origin": "app://editor"})
    assert ok.headers.get("access-control-allow-origin") == "app://editor"
    other = client.get("/api/jobs", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in other.headers
