"""Everything that talks to FFmpeg: finding it, reading video info, extracting audio."""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .errors import KadrError

FFMPEG_HELP = """
FFmpeg was not found. Kadr needs it to read and write videos.

  Windows:  winget install Gyan.FFmpeg      (then close and reopen the terminal)
  macOS:    brew install ffmpeg
  Linux:    sudo apt install ffmpeg         (Ubuntu / Debian)

Or simply run:  pip install imageio-ffmpeg  (it ships its own copy of FFmpeg)
"""

_ffmpeg_path = None  # remembered after the first successful search


def _can_burn_subtitles(exe):
    """True if this FFmpeg build runs and includes the 'ass' subtitle filter."""
    try:
        out = subprocess.run([exe, "-hide_banner", "-filters"], capture_output=True,
                             text=True, errors="replace", timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return re.search(r"^\s*\S+\s+ass\s", out, re.M) is not None


def find_ffmpeg():
    """Return the path of a working FFmpeg, or raise KadrError with install help.

    We try the system FFmpeg first, then the copy shipped by imageio-ffmpeg.
    """
    global _ffmpeg_path
    if _ffmpeg_path:
        return _ffmpeg_path
    candidates = []
    system = shutil.which("ffmpeg")
    if system:
        candidates.append(system)
    try:
        import imageio_ffmpeg
        candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        pass  # not installed or no binary for this platform
    for exe in candidates:
        if _can_burn_subtitles(exe):
            _ffmpeg_path = exe
            return exe
    raise KadrError(FFMPEG_HELP.strip())


def run_ffmpeg(args, cwd=None, what="process the video", progress=None, duration=None):
    """Run FFmpeg with the given arguments. Raise a friendly error if it fails.

    If `progress` (a function) and `duration` (seconds) are given, progress
    is called with 0..1 while FFmpeg works.
    """
    cmd = [find_ffmpeg(), "-hide_banner", "-nostdin", "-y"]
    if progress and duration:
        cmd += ["-progress", "pipe:1", "-nostats"]
    cmd += [str(a) for a in args]
    # FFmpeg's messages go to a temporary file so a chatty FFmpeg can never block us.
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as log:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=log, cwd=cwd,
                                   text=True, errors="replace")
        for line in process.stdout:
            if progress and duration and line.startswith("out_time_ms="):
                try:
                    progress(min(int(line.split("=")[1]) / 1_000_000 / duration, 1.0))
                except ValueError:
                    pass  # FFmpeg prints "N/A" before the first frame
        process.wait()
        log.seek(0)
        messages = log.read()
    if process.returncode != 0:
        lines = [l for l in messages.strip().splitlines() if l.strip()]
        reason = lines[-1] if lines else "unknown error"
        raise KadrError(f"FFmpeg could not {what}. Reason: {reason}")
    return messages


def probe(video_path):
    """Read basic facts about a video file.

    Returns a dict: duration (seconds), width, height (after rotation),
    has_video, has_audio. Raises KadrError for missing/corrupt files.
    We parse the text FFmpeg prints, so we do not need ffprobe.
    """
    video_path = Path(video_path)
    if not video_path.is_file():
        raise KadrError(f"File not found: {video_path.name}")
    if video_path.stat().st_size == 0:
        raise KadrError("The file is empty (0 bytes).")
    result = subprocess.run([find_ffmpeg(), "-hide_banner", "-nostdin", "-i", str(video_path)],
                            capture_output=True, text=True, errors="replace")
    text = result.stderr
    if "Input #0" not in text:
        raise KadrError("This file could not be opened. It is either corrupt or "
                             "not a video format FFmpeg understands. Try an .mp4 or .mov file.")
    info = {"duration": 0.0, "width": 0, "height": 0, "has_video": False, "has_audio": False}
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Stream #.*Video:.*?[,\s](\d{2,5})x(\d{2,5})[\s,\[]", text)
    if m:
        info["has_video"] = True
        info["width"], info["height"] = int(m.group(1)), int(m.group(2))
        # Phone videos are often stored sideways with a "rotate me" note.
        rot = re.search(r"rotation of (-?\d+(?:\.\d+)?) degrees", text)
        if rot and round(abs(float(rot.group(1)))) % 180 == 90:
            info["width"], info["height"] = info["height"], info["width"]
    info["has_audio"] = re.search(r"Stream #.*Audio:", text) is not None
    return info


def check_video(video_path, max_seconds):
    """Probe a video and reject inputs we cannot caption. Returns the probe dict."""
    info = probe(video_path)
    if not info["has_video"]:
        raise KadrError("This file has no video picture in it (maybe it is audio only).")
    if not info["has_audio"]:
        raise KadrError("This video has no audio track, so there is nothing to transcribe.")
    if info["duration"] <= 0:
        raise KadrError("Could not read the video length. The file may be damaged.")
    if info["duration"] > max_seconds:
        raise KadrError(
            f"This video is {info['duration'] / 60:.1f} minutes long. The limit is "
            f"{max_seconds / 60:.0f} minutes (change max_video_seconds in settings.json).")
    return info


def extract_audio(video_path, wav_path):
    """Save the video's sound as a 16 kHz mono WAV file (what Whisper expects)."""
    run_ffmpeg(["-i", video_path, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav_path],
               what="extract the audio")
    return wav_path


def audio_is_silent(wav_path, threshold=0.003):
    """True if the WAV file is (almost) pure silence. threshold is 0..1 loudness."""
    import wave
    import numpy as np
    with wave.open(str(wav_path), "rb") as w:
        frames = w.readframes(w.getnframes())
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if samples.size == 0:
        return True
    return float(np.sqrt(np.mean(samples ** 2))) < threshold


def make_preview(video_path, out_path):
    """Make a small H.264 copy that every browser can play (used by the editor)."""
    run_ffmpeg(["-i", video_path, "-vf", "scale=-2:min(480\\,ih)", "-c:v", "libx264",
                "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out_path],
               what="create the preview video")
    return out_path
