"""The whole workflow in a few plain functions. This is what a bot or script should call.

    from engine import pipeline
    result = pipeline.caption_video("clip.mp4", language="uz", style="bold_white")
    print(result["video"], result["srt"])

Or step by step (what the web app does):
    job = pipeline.add_video("clip.mp4", {"language": "auto"})
    pipeline.process_job(job["id"])            # transcribe -> captions.json
    pipeline.export_job(job["id"], "boxed")    # -> output.mp4 + output.srt
"""
import shutil
import time
from pathlib import Path

from . import captions, config, dictionary, ffmpeg_tools, jobs, render, styles, transcribe
from .errors import KadrError


def add_video(video_path, options=None, jobs_dir=None, original_name=None):
    """Create a job for a video file (the file is copied into the job folder)."""
    video_path = Path(video_path)
    if not video_path.is_file():
        raise KadrError(f"File not found: {video_path}")
    job = jobs.create_job(original_name or video_path.name, options, jobs_dir)
    shutil.copy(video_path, jobs.job_dir(job["id"], jobs_dir) / job["video_file"])
    return job


def _progress_writer(job_id, jobs_dir, stage, low, high):
    """Make a progress(0..1) function that saves overall progress into job.json.

    low/high: the share of the whole job this stage covers (e.g. 0.2 to 0.9).
    Saves at most twice a second so we do not hammer the disk.
    """
    last = [0.0]

    def progress(fraction):
        now = time.time()
        if now - last[0] >= 0.5 or fraction >= 1:
            last[0] = now
            jobs.update_job(job_id, jobs_dir, stage=stage,
                            progress=round(low + (high - low) * max(0.0, min(fraction, 1.0)), 3))
    return progress


def build_lines(transcript, options):
    """Caption lines from a transcript, using the job's "words per line" choice."""
    return captions.split_into_lines(transcript["segments"],
                                     max_words=captions.clean_max_words(options.get("max_words")))


def translate_transcript_lines(lines, source, target, options):
    """Translate caption lines for a "translated subtitles" job."""
    from . import translate
    if source == target:
        return lines
    if not translate.can_translate(source, target):
        names = translate.LANGUAGE_NAMES
        raise KadrError(f"The speech was recognised as {names.get(source, source)}, but translation from "
                        f"{names.get(source, source)} to {names.get(target, target)} is not available. "
                        "Only English to Russian and Russian to English can be translated.")
    return translate.translate_lines(lines, source, target,
                                     max_words=captions.clean_max_words(options.get("max_words")))


def process_job(job_id, jobs_dir=None):
    """Run a job from uploaded video to editable captions. Returns the caption lines.

    On a problem the job is marked "error" with a friendly message and the
    error is raised again.
    """
    folder = jobs.job_dir(job_id, jobs_dir)
    job = jobs.load_job(job_id, jobs_dir)
    options = job.get("options", {})
    video = folder / job["video_file"]
    settings = config.load_settings()
    try:
        jobs.update_job(job_id, jobs_dir, status="processing", stage="Checking the video", progress=0.02, error="")
        info = ffmpeg_tools.check_video(video, settings["max_video_seconds"])
        jobs.update_job(job_id, jobs_dir, info=info, stage="Extracting audio", progress=0.05)

        audio = ffmpeg_tools.extract_audio(video, folder / "audio.wav")
        if ffmpeg_tools.audio_is_silent(audio):
            raise KadrError("This video is silent, so there is nothing to transcribe.")

        jobs.update_job(job_id, jobs_dir, stage="Preparing the preview", progress=0.08)
        ffmpeg_tools.make_preview(video, folder / "preview.mp4")

        model_name = options.get("model") or None      # None = let settings.json decide
        jobs.update_job(job_id, jobs_dir, progress=0.12,
                        stage="Loading the speech model (the first time it is downloaded, this can take a while)")
        transcript = transcribe.transcribe(
            audio, language=options.get("language", "auto"), model_name=model_name,
            progress=_progress_writer(job_id, jobs_dir, "Transcribing speech", 0.15, 0.95))
        transcript["segments"] = dictionary.apply_to_segments(transcript["segments"])
        jobs.save_transcript(job_id, transcript, jobs_dir)

        lines = build_lines(transcript, options)
        if not lines:
            raise KadrError("No speech was found in this video. If people do speak in it, "
                                 "try choosing the language by hand or a bigger model.")
        target = options.get("translate_to")
        if target:
            jobs.save_json(job_id, "captions.original.json", lines, jobs_dir)
            jobs.update_job(job_id, jobs_dir, progress=0.96,
                            stage="Translating (the first time this downloads a model, about 200 MB)")
            lines = translate_transcript_lines(lines, transcript["language"], target, options)
        jobs.save_captions(job_id, lines, jobs_dir)
        jobs.update_job(job_id, jobs_dir, status="ready", stage="Ready to edit", progress=1.0,
                        language=transcript["language"], model=transcript["model"], device=transcript["device"])
        return lines
    except KadrError as e:
        jobs.update_job(job_id, jobs_dir, status="error", stage="Failed", error=str(e))
        raise
    except Exception as e:
        jobs.update_job(job_id, jobs_dir, status="error", stage="Failed",
                        error=f"Unexpected problem: {type(e).__name__}: {str(e)[:300]}")
        raise


def export_job(job_id, style_id=None, vertical=False, jobs_dir=None, size=None, title=None):
    """Burn the job's captions into the video. Returns {"video": path, "srt": path}.

    size: "small", "medium", "large" or "xl". title: {"text", "seconds"} or None.
    """
    folder = jobs.job_dir(job_id, jobs_dir)
    job = jobs.load_job(job_id, jobs_dir)
    try:
        style = styles.get_style(style_id, size)
        lines = jobs.load_captions(job_id, jobs_dir)
        if not lines:
            raise KadrError("There are no caption lines to export.")
        jobs.update_job(job_id, jobs_dir, status="exporting", stage="Rendering the video", progress=0.0, error="")
        info = job.get("info") or ffmpeg_tools.probe(folder / job["video_file"])
        srt_path = folder / "output.srt"
        srt_path.write_text(captions.to_srt(lines), encoding="utf-8")
        out_path = render.render_video(
            folder / job["video_file"], lines, style, folder / "output.mp4", folder, info=info,
            vertical=vertical, progress=_progress_writer(job_id, jobs_dir, "Rendering the video", 0.0, 1.0),
            title=title)
        jobs.update_job(job_id, jobs_dir, status="ready", stage="Export finished", progress=1.0,
                        export={"style": style["id"], "vertical": bool(vertical), "size": style["size"],
                                "time": time.time()})
        return {"video": str(out_path), "srt": str(srt_path)}
    except KadrError as e:
        jobs.update_job(job_id, jobs_dir, status="ready", stage="Export failed", error=str(e))
        raise
    except Exception as e:
        jobs.update_job(job_id, jobs_dir, status="ready", stage="Export failed",
                        error=f"Unexpected problem: {type(e).__name__}: {str(e)[:300]}")
        raise


def caption_video(video_path, language="auto", style=None, model=None, vertical=False, jobs_dir=None,
                  max_words=None, translate_to=None, size=None, title=None):
    """One call that does everything: transcribe, build captions, burn them in.

    max_words: words per line (None = automatic). translate_to: "ru"/"en" for
    translated subtitles. Returns {"job_id", "video", "srt", "lines"}.
    """
    options = {"language": language, "model": model, "max_words": max_words, "translate_to": translate_to}
    job = add_video(video_path, options, jobs_dir)
    lines = process_job(job["id"], jobs_dir)
    result = export_job(job["id"], style, vertical, jobs_dir, size=size, title=title)
    result.update(job_id=job["id"], lines=lines)
    return result
