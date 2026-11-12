"""Offline translation of caption lines (English <-> Russian).

Uses the free Argos Translate models (MIT licence). We load the model files
directly with CTranslate2 and SentencePiece instead of installing the full
Argos app, which would pull in PyTorch (2 GB+).

The model for a language pair is downloaded once (about 200 MB) into
models/ and works offline after that.

    lines_ru = translate_lines(lines_en, "en", "ru")

Translated captions are rough: read them before exporting. Word timings
inside a translated line are estimated (the translation has different
words), but each sentence keeps its original start and end time.
"""
import shutil
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

from . import config
from .captions import SENTENCE_END, spread_words, split_into_lines
from .errors import KadrError

MODELS_DIR = config.ROOT / "models"
PACKAGES = {
    ("en", "ru"): "https://argos-net.com/v1/translate-en_ru-1_9.argosmodel",
    ("ru", "en"): "https://argos-net.com/v1/translate-ru_en-1_9.argosmodel",
}
LANGUAGE_NAMES = {"en": "English", "ru": "Russian", "uz": "Uzbek"}
MAX_GROUP_LINES = 4       # a "sentence" longer than this many lines is translated in parts
MAX_GROUP_GAP = 1.0       # a pause longer than this (seconds) ends a sentence

_loaded = {}              # (source, target) -> (translator, sentencepiece processor)
_lock = threading.Lock()


def available_pairs():
    """Language pairs we can translate, e.g. [("en", "ru"), ("ru", "en")]."""
    return list(PACKAGES)


def _model_dir(source, target):
    """Folder where the model of one language pair is unpacked."""
    return MODELS_DIR / f"translate-{source}_{target}"


def _download(url, dest, attempts=6):
    """Download a file, resuming after a broken connection."""
    part = Path(str(dest) + ".part")
    for attempt in range(attempts):
        have = part.stat().st_size if part.exists() else 0
        request = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if have and response.status != 206:
                    have = 0                       # server ignored the resume: start again
                with open(part, "ab" if have else "wb") as f:
                    shutil.copyfileobj(response, f, length=1024 * 1024)
            part.replace(dest)
            return dest
        except OSError as e:
            last = e
            time.sleep(3)
    raise KadrError("Could not download the translation model. The first translation needs "
                    f"internet (about 200 MB, once). Details: {last}")


def ensure_model(source, target):
    """Make sure the model for this pair is on disk. Returns its folder."""
    if (source, target) not in PACKAGES:
        names = ", ".join(f"{LANGUAGE_NAMES[a]} → {LANGUAGE_NAMES[b]}" for a, b in PACKAGES)
        raise KadrError(f"Translation from {LANGUAGE_NAMES.get(source, source)} to "
                        f"{LANGUAGE_NAMES.get(target, target)} is not available. Available: {names}.")
    folder = _model_dir(source, target)
    if (folder / "ready").exists():
        return folder
    MODELS_DIR.mkdir(exist_ok=True)
    archive = MODELS_DIR / f"translate-{source}_{target}.zip"
    if not archive.exists():
        print(f"[Kadr] Downloading the {source}→{target} translation model (about 200 MB, only once)...")
        _download(PACKAGES[(source, target)], archive)
    try:
        if folder.exists():
            shutil.rmtree(folder)
        with zipfile.ZipFile(archive) as z:
            # Only the translation model and the word splitter; the package's
            # "stanza" folder (PyTorch files) is not needed and not unpacked.
            wanted = [m for m in z.namelist() if "/stanza/" not in m and not m.endswith("/stanza")]
            z.extractall(folder, members=wanted)
    except zipfile.BadZipFile:
        archive.unlink()
        raise KadrError("The downloaded translation model was damaged. Try again.")
    (folder / "ready").write_text("ok", encoding="utf-8")
    archive.unlink()
    return folder


def _load(source, target):
    """Load (once) the translator and the word splitter for a language pair."""
    with _lock:
        if (source, target) not in _loaded:
            try:
                import ctranslate2
                import sentencepiece
            except ImportError:
                raise KadrError("Translation needs extra packages. Run: pip install -r requirements.txt")
            folder = ensure_model(source, target)
            model_bin = next(folder.rglob("model.bin"), None)
            sp_model = next(folder.rglob("sentencepiece.model"), None)
            if not model_bin or not sp_model:
                raise KadrError("The translation model folder is incomplete. Delete the models/ folder and try again.")
            translator = ctranslate2.Translator(str(model_bin.parent), device="cpu", compute_type="int8")
            _loaded[(source, target)] = (translator, sentencepiece.SentencePieceProcessor(model_file=str(sp_model)))
        return _loaded[(source, target)]


def translate_texts(texts, source, target):
    """Translate a list of strings. Returns a list of strings (same order)."""
    texts = [t.strip() for t in texts]
    if not any(texts):
        return texts
    translator, sp = _load(source, target)
    pieces = [sp.encode(t, out_type=str) for t in texts]
    results = translator.translate_batch(pieces, beam_size=4, max_decoding_length=256)
    return [sp.decode(r.hypotheses[0]).strip() if t else "" for r, t in zip(results, texts)]


def _sentence_groups(lines):
    """Join caption lines into sentences, so the translator sees whole thoughts.

    Returns a list of lists of line indexes.
    """
    groups, current = [], []
    for i, line in enumerate(lines):
        if current:
            gap = line["start"] - lines[current[-1]]["end"]
            previous_ended = lines[current[-1]]["text"].rstrip().endswith(SENTENCE_END)
            if previous_ended or gap > MAX_GROUP_GAP or len(current) >= MAX_GROUP_LINES:
                groups.append(current)
                current = []
        current.append(i)
    if current:
        groups.append(current)
    return groups


def translate_lines(lines, source, target):
    """Translate caption lines. Each sentence keeps its start and end time;
    the translated words are spread over that time and split into new lines."""
    if not lines:
        return []
    groups = _sentence_groups(lines)
    texts = [" ".join(lines[i]["text"] for i in group) for group in groups]
    translated = translate_texts(texts, source, target)
    result = []
    for group, text in zip(groups, translated):
        start, end = lines[group[0]]["start"], lines[group[-1]]["end"]
        words = spread_words(text, start, end)
        if words:
            result.extend(split_into_lines([{"words": words}], max_pause=999))
    return result
