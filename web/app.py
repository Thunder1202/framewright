"""The local web app. It only translates browser requests into engine calls.

All the real work lives in the engine/ package.
"""
import shutil
import threading
import traceback
from pathlib import Path
from typing import List

from fastapi import Body, FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from engine import captions, config, jobs, pipeline, render, styles, transcribe, translate, translit, worker
from engine.errors import KadrError

WEB_DIR = Path(__file__).resolve().parent
app = FastAPI(title="Kadr", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
app.mount("/fonts", StaticFiles(directory=config.FONTS_DIR), name="fonts")

_preview_lock = threading.Lock()   # one preview picture at a time


# ---------- errors: always a short friendly JSON message, never a stack trace ----------

@app.exception_handler(KadrError)
def friendly_error(request, exc):
    """Problems we understand: show the message as it is."""
    return JSONResponse({"error": str(exc)}, status_code=400)


@app.exception_handler(Exception)
def unexpected_error(request, exc):
    """Anything else: details go to the terminal, the browser gets a short note."""
    traceback.print_exception(type(exc), exc, exc.__traceback__)
    return JSONResponse({"error": "Something unexpected went wrong. Look at the terminal "
                                  "window where Kadr is running for details."}, status_code=500)


@app.on_event("startup")
def on_startup():
    """Continue any work that was interrupted when the app was closed."""
    worker.start()
    worker.resume_unfinished()


# ---------- pages ----------

@app.get("/")
def page_home():
    """Upload page + list of all videos (the batch status page)."""
    return FileResponse(WEB_DIR / "static" / "index.html")


@app.get("/editor")
def page_editor():
    """Caption editor for one video (?id=<job id>)."""
    return FileResponse(WEB_DIR / "static" / "editor.html")


# ---------- general info ----------

def _default_model_label(device):
    """Short text for the model menu, e.g. "medium, Uzbek: whisper-small-uz-v1-ct2"."""
    label = transcribe.default_model(device)
    for lang, name in (("Uzbek", "uz"), ("Russian", "ru")):
        special = transcribe.model_for(name, device)
        if special != transcribe.default_model(device):
            label += f", {lang}: {special.split('/')[-1]}"
    return label


@app.get("/api/info")
def api_info():
    """Facts the pages need: styles, device, default model, limits."""
    settings = config.load_settings()
    device = transcribe.detect_device()
    all_styles = styles.load_styles()
    for style in all_styles.values():
        # The browser preview needs this to show the same text size as the export.
        style["em_ratio"] = styles.load_font(style["font"]).em_ratio
    return {
        "device": device,
        "default_model": _default_model_label(device),
        "models": ["tiny", "small", "medium", "large-v3"],
        "styles": all_styles,
        "max_video_seconds": settings["max_video_seconds"],
        "max_upload_mb": settings["max_upload_mb"],
        "extensions": list(config.VIDEO_EXTENSIONS),
        "sizes": styles.SIZES,
        "words_choices": list(captions.WORDS_CHOICES),
        "translation_pairs": [list(p) for p in translate.available_pairs()],
    }


# ---------- jobs ----------

@app.post("/api/jobs")
def api_upload(files: List[UploadFile] = File(...), language: str = Form("auto"), model: str = Form(""),
               max_words: str = Form(""), translate_to: str = Form("")):
    """Receive one or more videos and put them in the queue.

    translate_to empty = normal subtitles; "ru"/"en" = translated subtitles.
    """
    if language not in config.LANGUAGES:
        raise KadrError("Unknown language. Choose Uzbek, Russian, English or Auto.")
    translate_to = translate_to.strip() or None
    if translate_to:
        if language == "auto":
            raise KadrError("For translated subtitles, choose the language that is spoken in the video.")
        if not translate.can_translate(language, translate_to):
            raise KadrError("This translation is not available. Only English → Russian and "
                            "Russian → English can be translated offline.")
    options = {"language": language, "model": model.strip() or None,
               "max_words": captions.clean_max_words(max_words), "translate_to": translate_to}
    max_bytes = config.load_settings()["max_upload_mb"] * 1024 * 1024
    created, problems = [], []
    for upload in files:
        name = Path(upload.filename or "video.mp4").name
        if Path(name).suffix.lower() not in config.VIDEO_EXTENSIONS:
            problems.append(f"{name}: not a supported video type "
                            f"({', '.join(config.VIDEO_EXTENSIONS)}).")
            continue
        job = jobs.create_job(name, options)
        target = jobs.job_dir(job["id"]) / job["video_file"]
        with open(target, "wb") as f:
            shutil.copyfileobj(upload.file, f, length=1024 * 1024)
        if target.stat().st_size > max_bytes:
            jobs.delete_job(job["id"])
            problems.append(f"{name}: larger than {max_bytes // (1024 * 1024)} MB.")
            continue
        worker.enqueue_process(job["id"])
        created.append(job["id"])
    if not created and problems:
        raise KadrError(" ".join(problems))
    return {"jobs": created, "problems": problems}


@app.get("/api/jobs")
def api_list_jobs():
    """All jobs, newest first."""
    result = []
    for job in jobs.list_jobs():
        job["has_output"] = (config.JOBS_DIR / job["id"] / "output.mp4").is_file()
        result.append(job)
    return {"jobs": result, "disk_bytes": jobs.folder_size()}


@app.get("/api/jobs/{job_id}")
def api_get_job(job_id: str):
    """One job's status."""
    job = jobs.load_job(job_id)
    job["has_output"] = (jobs.job_dir(job_id) / "output.mp4").is_file()
    return job


@app.delete("/api/jobs/{job_id}")
def api_delete_job(job_id: str):
    """Delete a job and its files."""
    if jobs.load_job(job_id).get("status") in ("processing", "exporting"):
        raise KadrError("This video is being worked on right now. Wait until it finishes.")
    jobs.delete_job(job_id)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/retry")
def api_retry_job(job_id: str):
    """Put a failed job back in the queue."""
    jobs.load_job(job_id)
    worker.enqueue_process(job_id)
    return {"ok": True}


# ---------- captions ----------

def _answer(job_id, lines):
    """What the editor gets back after loading or changing captions."""
    return {"lines": lines, "history": jobs.history_counts(job_id)}


@app.get("/api/jobs/{job_id}/captions")
def api_get_captions(job_id: str):
    """The caption lines of a job, and how many Undo/Redo steps there are."""
    return _answer(job_id, jobs.load_captions(job_id))


def _save_with_undo(job_id, new_lines):
    """Save new lines; the previous version goes onto the Undo history."""
    jobs.save_captions_with_history(job_id, new_lines)
    return _answer(job_id, new_lines)


@app.post("/api/jobs/{job_id}/edit")
def api_edit(job_id: str, payload: dict = Body(...)):
    """Apply one editing action and return the new lines.

    payload["op"] is one of: text, nudge, split, merge, delete, insert,
    words, translit, translate, reset, undo, redo. The other keys depend on the action.
    """
    op = payload.get("op")
    lines = jobs.load_captions(job_id)

    if op == "undo":
        return _answer(job_id, jobs.undo_captions(job_id))
    if op == "redo":
        return _answer(job_id, jobs.redo_captions(job_id))

    if op == "words":
        # Re-cut all lines with a new number of words per line (text edits are kept).
        max_words = captions.clean_max_words(payload.get("max_words"))
        job = jobs.load_job(job_id)
        jobs.update_job(job_id, options=dict(job.get("options", {}), max_words=max_words))
        return _save_with_undo(job_id, captions.reflow(lines, max_words))

    if op == "insert":
        try:
            after = int(payload.get("line", -1))
        except (TypeError, ValueError):
            after = -1
        after = max(-1, min(after, len(lines) - 1))
        text = " ".join(str(payload.get("text") or "New line").split()) or "New line"
        return _save_with_undo(job_id, captions.insert_line(lines, after, text))

    if op == "reset":
        transcript = jobs.load_json(job_id, "transcript.json")
        if not transcript:
            raise KadrError("The original transcript is not available.")
        options = jobs.load_job(job_id).get("options", {})
        new = pipeline.build_lines(transcript, options)
        if options.get("translate_to"):
            new = pipeline.translate_transcript_lines(new, transcript["language"], options["translate_to"], options)
        return _save_with_undo(job_id, new)

    if op == "translit":
        direction = payload.get("direction")
        if direction not in ("to_cyrillic", "to_latin"):
            raise KadrError("Unknown conversion direction.")
        new = [captions.set_line_text(l, translit.convert(l["text"], direction)) for l in lines]
        return _save_with_undo(job_id, new)

    if op == "translate":
        source, target = payload.get("source"), payload.get("target")
        max_words = captions.clean_max_words(jobs.load_job(job_id).get("options", {}).get("max_words"))
        return _save_with_undo(job_id, translate.translate_lines(lines, source, target, max_words))

    try:
        index = int(payload.get("line", -1))
    except (TypeError, ValueError):
        index = -1
    if not 0 <= index < len(lines):
        raise KadrError("That line no longer exists. Reload the page.")

    try:
        if op == "text":
            text = " ".join(str(payload.get("text", "")).split())
            if not text:
                new = lines[:index] + lines[index + 1:]          # emptied line = delete it
            else:
                new = lines[:index] + [captions.set_line_text(lines[index], text)] + lines[index + 1:]
        elif op == "nudge":
            new = captions.nudge_line(lines, index, float(payload.get("start", 0)), float(payload.get("end", 0)))
        elif op == "split":
            new = captions.split_line(lines, index, int(payload.get("word", 0)))
        elif op == "merge":
            new = captions.merge_lines(lines, index)
        elif op == "delete":
            new = lines[:index] + lines[index + 1:]
        else:
            raise KadrError("Unknown editing action.")
    except (ValueError, TypeError) as e:
        raise KadrError(str(e))
    return _save_with_undo(job_id, new)


# ---------- export + files ----------

def _clean_look(payload):
    """The editor's look settings, checked: style, size, vertical, title, title_seconds."""
    try:
        seconds = max(0.0, min(float(payload.get("title_seconds") or 0), 3600.0))
    except (TypeError, ValueError):
        seconds = 0.0
    return {
        "style": str(payload.get("style") or ""),
        "size": payload.get("size") if payload.get("size") in styles.SIZES else "medium",
        "vertical": bool(payload.get("vertical")),
        "title": " ".join(str(payload.get("title") or "").split())[:200],
        "title_seconds": seconds,
    }


@app.post("/api/jobs/{job_id}/look")
def api_save_look(job_id: str, payload: dict = Body(...)):
    """Remember the editor's look settings for this video."""
    look = _clean_look(payload)
    jobs.update_job(job_id, look=look)
    return {"look": look}


@app.post("/api/jobs/{job_id}/export")
def api_export(job_id: str, payload: dict = Body(...)):
    """Queue the final render."""
    job = jobs.load_job(job_id)
    if job.get("status") != "ready":
        raise KadrError("This video is busy or not ready yet.")
    look = _clean_look(payload)
    style = styles.get_style(look["style"] or None)      # checks the style exists
    jobs.load_captions(job_id)
    jobs.update_job(job_id, look=look)
    worker.enqueue_export(job_id, style["id"], look["vertical"], size=look["size"],
                          title={"text": look["title"], "seconds": look["title_seconds"]})
    return {"ok": True}


@app.get("/api/jobs/{job_id}/video")
def api_video(job_id: str):
    """The small preview video for the editor's player."""
    path = jobs.job_dir(job_id) / "preview.mp4"
    if not path.is_file():
        raise KadrError("The preview video is not ready yet.")
    return FileResponse(path, media_type="video/mp4")


@app.get("/api/jobs/{job_id}/frame")
def api_frame(job_id: str, t: float = 0.0, style: str = "", vertical: bool = False, size: str = "medium",
              title: str = "", title_seconds: float = 0.0):
    """One picture of the video at time t with captions, exactly like the export."""
    job = jobs.load_job(job_id)
    folder = jobs.job_dir(job_id)
    lines = jobs.load_captions(job_id)
    with _preview_lock:
        out = render.render_frame(folder / job["video_file"], lines, styles.get_style(style or None, size),
                                  t, folder / "frame.jpg", folder, info=job.get("info") or None,
                                  vertical=vertical, title={"text": title, "seconds": title_seconds})
        data = Path(out).read_bytes()
    from fastapi.responses import Response
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/jobs/{job_id}/download/{kind}")
def api_download(job_id: str, kind: str):
    """Download the exported video (mp4), subtitles (srt) or transcript (json)."""
    job = jobs.load_job(job_id)
    folder = jobs.job_dir(job_id)
    stem = Path(job.get("name", "video")).stem
    if kind == "srt":
        # SRT does not need a render: always make it from the current lines.
        (folder / "output.srt").write_text(captions.to_srt(jobs.load_captions(job_id)), encoding="utf-8")
    if kind == "original_srt":
        original = jobs.load_json(job_id, "captions.original.json")
        if not original:
            raise KadrError("This video has no original-language subtitles (it was not translated).")
        (folder / "original.srt").write_text(captions.to_srt(original), encoding="utf-8")
    files = {
        "mp4": ("output.mp4", f"{stem}.captioned.mp4", "video/mp4"),
        "srt": ("output.srt", f"{stem}.srt", "application/x-subrip"),
        "original_srt": ("original.srt", f"{stem}.original.srt", "application/x-subrip"),
        "json": ("transcript.json", f"{stem}.transcript.json", "application/json"),
    }
    if kind not in files:
        raise KadrError("Unknown download type.")
    file_name, download_name, media_type = files[kind]
    path = folder / file_name
    if not path.is_file():
        raise KadrError("This file does not exist yet. Export the video first.")
    return FileResponse(path, media_type=media_type, filename=download_name)
