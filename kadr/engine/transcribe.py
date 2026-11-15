"""Speech-to-text with faster-whisper: device detection, model loading, transcription.

The main function is transcribe(). It returns a plain dict (the "transcript")
that can be saved as JSON:

    {"language": "uz", "model": "small", "device": "cpu", "duration": 12.3,
     "segments": [{"start": 0.5, "end": 2.1, "language": "uz", "text": "...",
                   "words": [{"word": "Salom", "start": 0.5, "end": 0.9}, ...]}]}
"""
import os
import re
import subprocess
import sys
import threading
from pathlib import Path

from . import config
from .errors import KadrError

SAMPLE_RATE = 16000
MAX_CHUNK_SECONDS = 15.0     # "auto" mode: longest piece sent to Whisper at once
MERGE_GAP_SECONDS = 0.8      # "auto" mode: pauses shorter than this do not split a chunk
CONFIDENT_LANGUAGE = 0.5    # "auto" mode: score needed to pick a language other than Uzbek
MIN_WORD_SECONDS = 0.1      # nobody says a word faster than this; faster = invented text
MIN_DETECT_SECONDS = 1.5     # chunks shorter than this reuse the previous language

_models = {}                 # cache: (model name) -> (WhisperModel, device, compute_type)
_model_lock = threading.Lock()
_gpu_checks = {}             # cache: (model path, compute type) -> True/False
GPU_TEST_TIMEOUT = 180       # seconds allowed for the GPU self-test


def _add_nvidia_dll_folders():
    """Help Python find the CUDA libraries installed by pip (requirements-gpu.txt)."""
    for base in map(Path, sys.path):
        nvidia = base / "nvidia"
        if not nvidia.is_dir():
            continue
        if sys.platform == "win32":
            for bin_dir in nvidia.glob("*/bin"):
                try:
                    os.add_dll_directory(str(bin_dir))
                except OSError:
                    pass
                if str(bin_dir) not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
        else:
            # Linux: load the libraries by full path so CTranslate2 finds them later.
            import ctypes
            for pattern in ("cublas/lib/libcublas.so.*", "cudnn/lib/libcudnn*.so.*"):
                for lib in sorted(nvidia.glob(pattern)):
                    try:
                        ctypes.CDLL(str(lib), mode=ctypes.RTLD_GLOBAL)
                    except OSError:
                        pass


def _cuda_libraries_found():
    """True if the cuBLAS library (needed for GPU maths) can be loaded."""
    import ctypes
    _add_nvidia_dll_folders()
    names = (["cublas64_12.dll", "cublas64_11.dll"] if sys.platform == "win32"
             else ["libcublas.so.12", "libcublas.so.11"])
    for name in names:
        try:
            ctypes.CDLL(name)
            return True
        except OSError:
            continue
    return False


_device = None   # remembered answer of detect_device()


def detect_device():
    """Return "cuda" if an NVIDIA GPU and its libraries are available, otherwise "cpu"."""
    global _device
    if _device is None:
        _device = "cpu"
        if os.environ.get("KADR_DEVICE", "").lower() == "cpu":
            return _device          # the user asked for CPU only
        try:
            import ctranslate2
            if ctranslate2.get_cuda_device_count() > 0:
                if _cuda_libraries_found():
                    _device = "cuda"
                else:
                    print("[Kadr] An NVIDIA GPU was found but its CUDA libraries are not installed, "
                          "so the CPU is used. To use the GPU run:  pip install -r requirements-gpu.txt")
        except Exception:
            pass
    return _device


def default_model(device=None):
    """Pick the model name: settings.json wins, otherwise small (CPU) / medium (GPU)."""
    name = str(config.load_settings().get("model") or "auto")
    if name != "auto":
        return name
    device = device or detect_device()
    return config.DEFAULT_MODEL_GPU if device == "cuda" else config.DEFAULT_MODEL_CPU


def model_for(language, device=None):
    """Model used for one language: "model_uz" / "model_ru" from settings.json if set,
    otherwise the general model. This lets Uzbek use a model trained for Uzbek
    while Russian keeps the standard one."""
    special = str(config.load_settings().get("model_" + language) or "").strip()
    return special or default_model(device)


def _gpu_self_test_main(model_path, compute_type):
    """Runs in a separate process: transcribe one second of noise on the GPU."""
    import numpy as np
    from faster_whisper import WhisperModel
    _add_nvidia_dll_folders()
    model = WhisperModel(model_path, device="cuda", compute_type=compute_type)
    noise = (np.random.RandomState(0).randn(SAMPLE_RATE) * 0.01).astype("float32")
    segments, _ = model.transcribe(noise, language="en", beam_size=1)
    list(segments)
    print("GPU_OK")


def _gpu_works(model_path, compute_type):
    """Check in a throw-away process that the GPU can really run this model.

    A broken CUDA setup can crash or freeze Python instead of raising an
    error, so we test it in a child process with a time limit.
    """
    key = (str(model_path), compute_type)
    if _gpu_checks.get("libraries_missing"):
        return False
    if key not in _gpu_checks:
        code = ("import sys; from engine.transcribe import _gpu_self_test_main; "
                "_gpu_self_test_main(sys.argv[1], sys.argv[2])")
        try:
            result = subprocess.run([sys.executable, "-c", code, str(model_path), compute_type],
                                    cwd=str(config.ROOT), capture_output=True, text=True,
                                    errors="replace", timeout=GPU_TEST_TIMEOUT)
            ok = result.returncode == 0 and "GPU_OK" in result.stdout
            reason = (result.stderr.strip().splitlines() or ["unknown error"])[-1]
        except subprocess.TimeoutExpired:
            ok, reason = False, "the GPU test did not finish in time"
        except OSError as e:
            ok, reason = False, str(e)
        if not ok:
            print(f"[Kadr] GPU ({compute_type}) not usable: {reason[:200]}")
            if "cublas" in reason.lower() or "cudnn" in reason.lower():
                # The CUDA libraries are missing: no other GPU mode can work either.
                print("[Kadr] Using the CPU instead. To use your NVIDIA GPU run:  "
                      "pip install -r requirements-gpu.txt")
                _gpu_checks["libraries_missing"] = True
        _gpu_checks[key] = ok
    return _gpu_checks[key]


def load_model(model_name=None):
    """Load a Whisper model (cached). Returns (model, device, compute_type).

    Tries the GPU first when one exists. If anything about the GPU fails
    (missing CUDA libraries, not enough memory...) it quietly uses the CPU.
    """
    try:
        from faster_whisper import WhisperModel, download_model
    except ImportError:
        raise KadrError("faster-whisper is not installed. Run: pip install -r requirements.txt")

    model_name = model_name or default_model()
    with _model_lock:
        if model_name in _models:
            return _models[model_name]

        # Step 1: make sure the model files are on disk (downloaded once, then offline).
        try:
            model_path = model_name if os.path.isdir(model_name) else download_model(model_name)
        except Exception as e:
            raise KadrError(
                f"Could not get the speech model '{model_name}'. The first run needs internet "
                f"to download it once. Check the name and your connection. Details: {str(e)[:200]}")

        # Step 2: choose GPU or CPU.
        wanted = str(config.load_settings().get("compute_type") or "auto")
        attempts = []
        if detect_device() == "cuda":
            _add_nvidia_dll_folders()
            gpu_types = [wanted] if wanted != "auto" else ["int8_float16", "int8"]
            attempts += [("cuda", t) for t in gpu_types]
        attempts.append(("cpu", wanted if wanted in ("int8", "float32") else "int8"))

        last_error = None
        for device, compute_type in attempts:
            if device == "cuda" and not _gpu_works(model_path, compute_type):
                continue
            try:
                model = WhisperModel(model_path, device=device, compute_type=compute_type)
                _models[model_name] = (model, device, compute_type)
                print(f"[Kadr] Model '{model_name}' loaded on {device} ({compute_type}).")
                return _models[model_name]
            except Exception as e:
                last_error = e
        raise KadrError(f"Could not load the speech model '{model_name}'. Details: {last_error}")


def _clean_words(raw_words, offset=0.0):
    """Turn faster-whisper word objects into simple dicts with tidy, increasing times."""
    words = []
    last_end = 0.0
    for w in raw_words or []:
        text = w.word.strip()
        if not any(ch.isalnum() for ch in text):
            continue  # only punctuation, e.g. a stray ” the model produced
        start = max(float(w.start) + offset, last_end)
        end = max(float(w.end) + offset, start + 0.02)
        words.append({"word": text, "start": round(start, 3), "end": round(end, 3)})
        last_end = end
    return words


def looks_like_real_speech(seg, words):
    """False for text the model invented ("hallucinated") instead of hearing.

    Signs, all seen on real failures while testing:
    - the words are spoken impossibly fast (under MIN_WORD_SECONDS each);
    - the text repeats itself a lot (high compression ratio, Whisper's own test);
    - the model was unsure about the text AND thought there was no speech.
    """
    if seg.end - seg.start < MIN_WORD_SECONDS * len(words):
        return False
    if getattr(seg, "compression_ratio", 0) > 2.4:
        return False
    if seg.avg_logprob < -1.0 and seg.no_speech_prob > 0.5:
        return False
    if is_known_hallucination(" ".join(w["word"] for w in words)):
        return False
    return True


# Phrases the Uzbek model writes during music or silence although nobody says them
# (seen in testing, often repeated). Written without apostrophes, spaces or punctuation.
KNOWN_HALLUCINATIONS = ("ozbektilida", "ozbekistondaotmoqda", "ozbekistondaotkaziladi",
                        "subtitrlarmuallifi", "obunaboling")


def is_known_hallucination(text):
    """True if the text is only one of KNOWN_HALLUCINATIONS (possibly repeated)."""
    squeezed = re.sub(r"[\W_]+", "", text.lower())
    if not squeezed:
        return False
    return any(re.fullmatch("(?:" + phrase + ")+", squeezed) for phrase in KNOWN_HALLUCINATIONS)


def _segment_dict(words, language):
    """Build one transcript segment from a list of word dicts."""
    return {"start": words[0]["start"], "end": words[-1]["end"], "language": language,
            "text": " ".join(w["word"] for w in words), "words": words}


def _whisper_options():
    """Options shared by every transcribe call."""
    return dict(word_timestamps=True, beam_size=5, condition_on_previous_text=False,
                no_speech_threshold=0.6, hallucination_silence_threshold=1.0)


def _speech_chunks(audio):
    """Find where people speak and group that into chunks of at most MAX_CHUNK_SECONDS.

    Returns a list of (start_sample, end_sample).
    """
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    pieces = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=250, speech_pad_ms=80))
    chunks = []
    for p in pieces:
        start, end = int(p["start"]), int(p["end"])
        if chunks:
            prev_start, prev_end = chunks[-1]
            close = (start - prev_end) / SAMPLE_RATE <= MERGE_GAP_SECONDS
            fits = (end - prev_start) / SAMPLE_RATE <= MAX_CHUNK_SECONDS
            if close and fits:
                chunks[-1] = (prev_start, end)
                continue
        chunks.append((start, end))
    return chunks


def choose_language(probs, allowed, fallback=None):
    """Pick a language from Whisper's language scores ({"ru": 0.93, "tr": 0.02, ...}).

    Whisper recognises Russian very reliably but almost never says "uz" for
    Uzbek: it guesses Turkish, Azerbaijani, Kazakh, Persian... (measured, see
    DECISIONS.md). So: another language is only chosen when Whisper is
    confident about it; everything else is treated as Uzbek.
    """
    confident = [lang for lang in allowed if lang != "uz" and probs.get(lang, 0.0) >= CONFIDENT_LANGUAGE]
    if confident:
        return max(confident, key=lambda lang: probs.get(lang, 0.0))
    if "uz" in allowed:
        return "uz"
    return max(allowed, key=lambda lang: probs.get(lang, 0.0)) if probs else (fallback or allowed[0])


def _pick_language(model, chunk, allowed, fallback):
    """Ask Whisper which of the allowed languages this chunk is in."""
    if len(chunk) / SAMPLE_RATE < MIN_DETECT_SECONDS and fallback:
        return fallback  # too short to judge, keep the language we were in
    try:
        _, _, all_probs = model.detect_language(audio=chunk)
    except Exception:
        return fallback or allowed[0]
    return choose_language(dict(all_probs or []), allowed, fallback)


def _transcribe_auto(detector, models, audio, progress):
    """"auto" mode: detect the language separately for each short chunk of speech.

    detector: model that guesses the language. models: {language: model that
    transcribes it} (they may all be the same model).
    """
    segments = []
    chunks = _speech_chunks(audio)
    allowed = list(models)
    language = None
    for i, (start, end) in enumerate(chunks):
        chunk = audio[start:end]
        language = _pick_language(detector, chunk, allowed, language)
        offset = start / SAMPLE_RATE
        result, _ = models[language].transcribe(chunk, language=language, vad_filter=False, **_whisper_options())
        for seg in result:
            words = _clean_words(seg.words, offset)
            if words and looks_like_real_speech(seg, words):
                segments.append(_segment_dict(words, language))
        if progress:
            progress((i + 1) / len(chunks))
    return segments


def _transcribe_fixed(model, audio, language, progress):
    """Fixed-language mode: one pass over the whole file with that language."""
    segments = []
    total = max(len(audio) / SAMPLE_RATE, 0.001)
    result, _ = model.transcribe(audio, language=language, vad_filter=True, **_whisper_options())
    for seg in result:
        words = _clean_words(seg.words)
        if words and looks_like_real_speech(seg, words):
            segments.append(_segment_dict(words, language))
        if progress:
            progress(min(seg.end / total, 1.0))
    return segments


def transcribe(audio_path, language="auto", model_name=None, progress=None):
    """Transcribe a 16 kHz WAV file. Returns the transcript dict described above.

    language: "uz", "ru" or "auto". progress: optional function called with 0..1.
    model_name: use exactly this model. If empty, settings.json decides
    (and may give Uzbek and Russian different models).
    """
    if language not in config.LANGUAGES:
        raise KadrError(f"Unknown language '{language}'. Use one of: uz, ru, en, auto.")

    from faster_whisper.audio import decode_audio
    try:
        audio = decode_audio(str(audio_path), sampling_rate=SAMPLE_RATE)
    except Exception as e:
        raise KadrError(f"Could not read the audio: {e}")

    if language == "auto":
        allowed = [l for l in config.load_settings().get("auto_languages", []) if isinstance(l, str)] or ["uz", "ru"]
        names = {lang: model_name or model_for(lang) for lang in allowed}
        # The general (multilingual) model is the fairest judge of which language is spoken.
        detector, device, compute_type = load_model(model_name or default_model())
        models = {lang: load_model(name)[0] for lang, name in names.items()}
        segments = _transcribe_auto(detector, models, audio, progress)
        used = sorted(set(names.values()))
    else:
        name = model_name or model_for(language)
        model, device, compute_type = load_model(name)
        segments = _transcribe_fixed(model, audio, language, progress)
        used = [name]

    found = sorted({s["language"] for s in segments})
    return {
        "language": found[0] if len(found) == 1 else ("mixed" if found else language),
        "requested_language": language,
        "model": " + ".join(used),
        "device": device,
        "compute_type": compute_type,
        "duration": round(len(audio) / SAMPLE_RATE, 3),
        "segments": segments,
    }
