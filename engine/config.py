"""Paths and settings used by the whole project.

Settings come from settings.json in the project folder. Anything missing
there falls back to the defaults below, so a broken file never stops the app.
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # the project folder
JOBS_DIR = ROOT / "jobs"                           # one sub-folder per video
FONTS_DIR = ROOT / "engine" / "fonts"              # bundled free fonts
STYLES_FILE = ROOT / "styles.json"                 # caption style presets
DICTIONARY_FILE = ROOT / "dictionary.txt"          # user's names and terms
SETTINGS_FILE = ROOT / "settings.json"

DEFAULTS = {
    "model": "auto",              # auto = "small" on CPU, "medium" on GPU
    "model_uz": "",               # optional: a different model just for Uzbek
    "model_ru": "",               # optional: a different model just for Russian
    "compute_type": "auto",       # auto = int8 on CPU, picked by a self-test on GPU
    "auto_languages": ["uz", "ru"],  # languages considered in "auto" mode
    "max_video_seconds": 300,     # longer videos are rejected
    "max_upload_mb": 500,
    "port": 8000,
    "open_browser": True,
}

DEFAULT_MODEL_CPU = "small"
DEFAULT_MODEL_GPU = "medium"
LANGUAGES = ("uz", "ru", "auto")
VIDEO_EXTENSIONS = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".3gp")


def load_settings():
    """Read settings.json and fill in defaults for anything missing."""
    settings = dict(DEFAULTS)
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            user = json.load(f)
        if isinstance(user, dict):
            settings.update({k: v for k, v in user.items() if k in DEFAULTS})
    except FileNotFoundError:
        pass
    except (ValueError, OSError) as e:
        print(f"[Kadr] settings.json could not be read ({e}). Using defaults.")
    # An environment variable wins, handy for quick experiments.
    if os.environ.get("KADR_MODEL"):
        settings["model"] = os.environ["KADR_MODEL"]
    return settings
