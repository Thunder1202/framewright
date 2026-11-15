"""Kadr engine: plain Python functions for transcribing and captioning videos.

Nothing in this package knows about the web server. A Telegram bot (or any
other program) can import it and call engine.pipeline.caption_video(...).
"""
import os as _os
from pathlib import Path as _Path

# Downloaded speech models are kept inside the project (models/hf), next to the
# translation models, instead of in the user's home folder on the system drive.
# Set HF_HUB_CACHE yourself before starting to keep them somewhere else.
_os.environ.setdefault("HF_HUB_CACHE", str(_Path(__file__).resolve().parent.parent / "models" / "hf" / "hub"))
