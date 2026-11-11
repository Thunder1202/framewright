"""A simple queue: videos are processed one after another in a background thread.

One at a time on purpose: two transcriptions at once would only fight for the
same CPU/GPU and both would be slower.
"""
import queue
import threading
import traceback

from . import jobs, pipeline
from .errors import KadrError

_tasks = queue.Queue()
_thread = None
_start_lock = threading.Lock()


def _run_forever():
    """Worker loop: take the next task, run it, never die."""
    while True:
        kind, job_id, args = _tasks.get()
        try:
            if kind == "process":
                pipeline.process_job(job_id)
            elif kind == "export":
                pipeline.export_job(job_id, args.get("style"), args.get("vertical", False))
        except KadrError:
            pass  # already saved into job.json with a friendly message
        except Exception:
            traceback.print_exc()  # full details go to the terminal, not the browser
        finally:
            _tasks.task_done()


def start():
    """Start the worker thread (safe to call more than once)."""
    global _thread
    with _start_lock:
        if _thread is None or not _thread.is_alive():
            _thread = threading.Thread(target=_run_forever, name="kadr-worker", daemon=True)
            _thread.start()


def enqueue_process(job_id):
    """Put a job in line for transcription."""
    jobs.update_job(job_id, status="queued", stage="Waiting in the queue", progress=0.0, error="")
    _tasks.put(("process", job_id, {}))
    start()


def enqueue_export(job_id, style, vertical):
    """Put a job in line for rendering."""
    jobs.update_job(job_id, status="exporting", stage="Waiting to render", progress=0.0, error="")
    _tasks.put(("export", job_id, {"style": style, "vertical": vertical}))
    start()


def resume_unfinished():
    """After a restart: continue jobs that were queued or interrupted mid-way."""
    for job in reversed(jobs.list_jobs()):          # oldest first
        if job.get("status") in ("queued", "processing"):
            enqueue_process(job["id"])
        elif job.get("status") == "exporting":
            jobs.update_job(job["id"], status="ready", stage="Export was interrupted, please export again")
