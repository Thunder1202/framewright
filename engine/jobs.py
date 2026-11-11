"""Job storage: every video gets its own folder, jobs/<id>/, so nothing is lost.

Inside a job folder:
    job.json         status, options, video facts
    source.<ext>     the uploaded video
    audio.wav        extracted sound
    preview.mp4      small copy for the browser player
    transcript.json  raw result from the speech model
    captions.json    the caption lines (this is what the editor changes)
    output.mp4 / output.srt   exports
"""
import json
import os
import re
import secrets
import shutil
import threading
import time
from pathlib import Path

from . import config
from .errors import KadrError

_lock = threading.RLock()   # job.json is touched by the web server and the worker thread
_ID_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$")


def _root(jobs_dir=None):
    """The folder that holds all jobs (created if needed)."""
    root = Path(jobs_dir or config.JOBS_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def job_dir(job_id, jobs_dir=None):
    """Folder of one job. Rejects ids that are not ours (protects against ../ tricks)."""
    if not _ID_RE.match(str(job_id)):
        raise KadrError("Unknown job.")
    path = _root(jobs_dir) / job_id
    if not path.is_dir():
        raise KadrError("This job does not exist (maybe it was deleted).")
    return path


def _write_json(path, data):
    """Write JSON safely: first to a temp file, then swap it in, so a crash never leaves half a file."""
    tmp = Path(str(path) + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _read_json(path):
    """Read a JSON file."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def create_job(original_name, options=None, jobs_dir=None):
    """Create a new job folder and job.json. Returns the job dict."""
    with _lock:
        job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + secrets.token_hex(3)
        path = _root(jobs_dir) / job_id
        path.mkdir()
        ext = Path(original_name).suffix.lower()
        job = {
            "id": job_id,
            "name": Path(original_name).name,
            "video_file": "source" + (ext if re.match(r"^\.[a-z0-9]{1,5}$", ext) else ".mp4"),
            "created": time.time(),
            "status": "queued",        # queued, processing, ready, exporting, error
            "stage": "Waiting in the queue",
            "progress": 0.0,
            "error": "",
            "options": dict(options or {}),
            "info": {},
            "export": {},              # facts about the last export
        }
        _write_json(path / "job.json", job)
        return job


def load_job(job_id, jobs_dir=None):
    """Read job.json."""
    with _lock:
        try:
            return _read_json(job_dir(job_id, jobs_dir) / "job.json")
        except (OSError, ValueError):
            raise KadrError("This job's data could not be read.")


def update_job(job_id, jobs_dir=None, **changes):
    """Change some fields of job.json and save. Returns the job dict."""
    with _lock:
        job = load_job(job_id, jobs_dir)
        job.update(changes)
        _write_json(job_dir(job_id, jobs_dir) / "job.json", job)
        return job


def list_jobs(jobs_dir=None):
    """All jobs, newest first. Broken folders are skipped."""
    jobs = []
    for path in _root(jobs_dir).iterdir():
        if path.is_dir() and _ID_RE.match(path.name):
            try:
                jobs.append(_read_json(path / "job.json"))
            except (OSError, ValueError):
                continue
    return sorted(jobs, key=lambda j: j.get("created", 0), reverse=True)


def delete_job(job_id, jobs_dir=None):
    """Delete a job folder and everything in it."""
    with _lock:
        shutil.rmtree(job_dir(job_id, jobs_dir), ignore_errors=True)


def save_captions(job_id, lines, jobs_dir=None):
    """Save the caption lines of a job."""
    with _lock:
        _write_json(job_dir(job_id, jobs_dir) / "captions.json", lines)


def load_captions(job_id, jobs_dir=None):
    """Load the caption lines of a job."""
    with _lock:
        try:
            return _read_json(job_dir(job_id, jobs_dir) / "captions.json")
        except FileNotFoundError:
            raise KadrError("This video has no captions yet. Wait until processing finishes.")
        except ValueError:
            raise KadrError("The saved captions are damaged and could not be read.")


def save_transcript(job_id, transcript, jobs_dir=None):
    """Save the raw transcript of a job."""
    with _lock:
        _write_json(job_dir(job_id, jobs_dir) / "transcript.json", transcript)
