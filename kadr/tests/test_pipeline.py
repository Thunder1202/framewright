"""End-to-end tests on real video files (made with FFmpeg) and bad-input handling.

These use the "tiny" speech model so they are fast. The first run downloads
that model (about 75 MB). Without internet and without the model the
speech tests are skipped; everything else still runs.
"""
import subprocess

import pytest

from engine import config, ffmpeg_tools, jobs, pipeline, transcribe
from engine.errors import KadrError

SAMPLE = config.ROOT / "samples" / "test_ru.mp4"


def ffmpeg(*args):
    """Run FFmpeg quietly to build a test file."""
    subprocess.run([ffmpeg_tools.find_ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


@pytest.fixture(scope="session")
def tiny_model():
    """Load the tiny model once, or skip the speech tests if it is unavailable."""
    try:
        transcribe.load_model("tiny")
    except KadrError as e:
        pytest.skip(f"tiny model not available: {e}")
    return "tiny"


def test_probe_reads_the_sample():
    info = ffmpeg_tools.probe(SAMPLE)
    assert info["has_video"] and info["has_audio"]
    assert (info["width"], info["height"]) == (540, 960)
    assert 20 < info["duration"] < 22


def test_video_without_audio_is_rejected(tmp_path):
    video = tmp_path / "mute.mp4"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x240:rate=10:duration=1", "-pix_fmt", "yuv420p", video)
    with pytest.raises(KadrError, match="no audio"):
        ffmpeg_tools.check_video(video, 300)


def test_too_long_video_is_rejected(tmp_path):
    video = tmp_path / "long.mp4"
    ffmpeg("-f", "lavfi", "-i", "color=c=black:size=160x120:rate=2:duration=12",
           "-f", "lavfi", "-i", "sine=frequency=300:duration=12", "-shortest", "-pix_fmt", "yuv420p", video)
    with pytest.raises(KadrError, match="limit"):
        ffmpeg_tools.check_video(video, max_seconds=10)
    assert ffmpeg_tools.check_video(video, max_seconds=60)["duration"] > 11


def test_corrupt_and_non_video_files_are_rejected(tmp_path):
    garbage = tmp_path / "broken.mp4"
    garbage.write_bytes(b"this is not a video at all" * 50)
    with pytest.raises(KadrError, match="could not be opened"):
        ffmpeg_tools.probe(garbage)
    empty = tmp_path / "empty.mp4"
    empty.write_bytes(b"")
    with pytest.raises(KadrError, match="empty"):
        ffmpeg_tools.probe(empty)
    with pytest.raises(KadrError, match="not found"):
        ffmpeg_tools.probe(tmp_path / "missing.mp4")


def test_audio_only_file_is_rejected(tmp_path):
    audio = tmp_path / "sound.mp4"
    ffmpeg("-f", "lavfi", "-i", "sine=frequency=300:duration=1", "-c:a", "aac", audio)
    with pytest.raises(KadrError, match="no video"):
        ffmpeg_tools.check_video(audio, 300)


def test_silent_video_fails_with_friendly_message(tmp_path):
    video = tmp_path / "silent.mp4"
    ffmpeg("-f", "lavfi", "-i", "color=c=blue:size=160x120:rate=5:duration=2",
           "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-shortest", "-pix_fmt", "yuv420p", video)
    job = pipeline.add_video(video, {"language": "ru", "model": "tiny"}, jobs_dir=tmp_path / "jobs")
    with pytest.raises(KadrError, match="silent"):
        pipeline.process_job(job["id"], tmp_path / "jobs")
    saved = jobs.load_job(job["id"], tmp_path / "jobs")
    assert saved["status"] == "error" and "silent" in saved["error"]


def test_rotated_phone_video_reports_upright_size(tmp_path):
    video = tmp_path / "rotated.mp4"
    ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10:duration=1", "-pix_fmt", "yuv420p", tmp_path / "flat.mp4")
    ffmpeg("-display_rotation", "90", "-i", tmp_path / "flat.mp4", "-c", "copy", video)
    info = ffmpeg_tools.probe(video)
    assert (info["width"], info["height"]) == (180, 320)


def test_full_pipeline_transcribe_and_export(tmp_path, tiny_model):
    jobs_dir = tmp_path / "jobs"
    result = pipeline.caption_video(SAMPLE, language="ru", style="boxed", model=tiny_model, jobs_dir=jobs_dir)
    folder = jobs_dir / result["job_id"]

    # transcript: words with increasing times, inside the video
    lines = result["lines"]
    assert len(lines) >= 4
    text = " ".join(l["text"] for l in lines).lower()
    assert "субтитры" in text and "видео" in text
    previous = 0.0
    for line in lines:
        for word in line["words"]:
            assert previous - 0.001 <= word["start"] <= word["end"] <= 22
            previous = word["start"]

    # every file the job folder should have
    for name in ("job.json", "audio.wav", "preview.mp4", "transcript.json", "captions.json",
                 "captions.ass", "output.srt", "output.mp4"):
        assert (folder / name).is_file(), name
    assert jobs.load_job(result["job_id"], jobs_dir)["status"] == "ready"

    # exported video: same size and length as the source, still has sound
    out = ffmpeg_tools.probe(result["video"])
    assert (out["width"], out["height"]) == (540, 960)
    assert abs(out["duration"] - 21) < 1.0
    assert out["has_audio"]
    assert "-->" in (folder / "output.srt").read_text(encoding="utf-8")


def test_captions_are_really_burned_into_the_picture(tmp_path, tiny_model):
    """Compare a frame with captions against the same frame without: the caption area must differ."""
    import numpy as np
    jobs_dir = tmp_path / "jobs"
    result = pipeline.caption_video(SAMPLE, language="ru", style="boxed", model=tiny_model, jobs_dir=jobs_dir)
    line = result["lines"][1]
    moment = (line["start"] + line["end"]) / 2

    def frame(video, t):
        """Grab one frame as a grey numpy array."""
        raw = subprocess.run([ffmpeg_tools.find_ffmpeg(), "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(video),
                              "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
        return np.frombuffer(raw, dtype=np.uint8).reshape(960, 540).astype(int)

    diff = np.abs(frame(result["video"], moment) - frame(SAMPLE, moment))
    caption_band = diff[int(960 * 0.72):int(960 * 0.86), :]     # where the "boxed" style sits
    top_band = diff[:int(960 * 0.5), :]
    assert caption_band.mean() > 8          # clearly changed: the box and text are there
    assert top_band.mean() < 4              # the rest of the picture is untouched

    # and in a silent gap after the last line there is no caption
    quiet = result["lines"][-1]["end"] + 1.0
    diff = np.abs(frame(result["video"], quiet) - frame(SAMPLE, quiet))
    assert diff[int(960 * 0.72):int(960 * 0.86), :].mean() < 4


def test_vertical_export_is_1080x1920(tmp_path, tiny_model):
    wide = tmp_path / "wide.mp4"
    ffmpeg("-i", SAMPLE, "-t", "4", "-vf", "scale=640:360,setsar=1", "-c:a", "copy", wide)
    result = pipeline.caption_video(wide, language="ru", style="yellow_pop", model=tiny_model,
                                    vertical=True, jobs_dir=tmp_path / "jobs")
    out = ffmpeg_tools.probe(result["video"])
    assert (out["width"], out["height"]) == (1080, 1920)


def test_auto_language_mode(tmp_path, tiny_model):
    audio = ffmpeg_tools.extract_audio(SAMPLE, tmp_path / "a.wav")
    result = transcribe.transcribe(audio, language="auto", model_name=tiny_model)
    assert result["segments"]
    assert {s["language"] for s in result["segments"]} <= {"uz", "ru"}
    assert result["language"] == "ru"
