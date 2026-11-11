"""Burning captions into the video with FFmpeg."""
import shutil
from pathlib import Path

from . import ass, ffmpeg_tools
from .styles import load_font

VERTICAL_SIZE = (1080, 1920)     # 9:16 output size


def output_size(info, vertical):
    """Size of the exported video: the original size, or 1080x1920 for 9:16."""
    if vertical:
        return VERTICAL_SIZE
    # H.264 needs even numbers.
    return info["width"] - info["width"] % 2, info["height"] - info["height"] % 2


def _filter_graph(info, vertical, ass_name):
    """The FFmpeg filter text: resize if needed, then draw the subtitles."""
    subs = f"ass={ass_name}:fontsdir=fonts"
    if not vertical:
        return f"[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,{subs}[out]"
    w, h = VERTICAL_SIZE
    already_vertical = abs(info["width"] / max(info["height"], 1) - w / h) < 0.01
    if already_vertical:
        return f"[0:v]scale={w}:{h},setsar=1,{subs}[out]"
    # Not 9:16: put the video in the middle of a blurred, zoomed copy of itself.
    return (
        f"[0:v]split[a][b];"
        f"[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=24:2[bg];"
        f"[b]scale={w}:{h}:force_original_aspect_ratio=decrease[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,{subs}[out]"
    )


def write_ass(lines, style, info, vertical, work_dir, ass_name="captions.ass"):
    """Write the .ass file and copy the font next to it. Returns the .ass path."""
    work_dir = Path(work_dir)
    width, height = output_size(info, vertical)
    (work_dir / ass_name).write_text(ass.build_ass(lines, style, width, height), encoding="utf-8")
    fonts = work_dir / "fonts"
    fonts.mkdir(exist_ok=True)
    font_path = load_font(style["font"]).path
    if not (fonts / font_path.name).exists():
        shutil.copy(font_path, fonts / font_path.name)
    return work_dir / ass_name


def render_video(video_path, lines, style, out_path, work_dir, info=None, vertical=False, progress=None):
    """Export an .mp4 with the captions burned into the picture.

    work_dir is a folder where captions.ass and the font are written. We run
    FFmpeg from inside it and use short relative names for the subtitle
    file, because FFmpeg's filter syntax breaks on Windows paths like C:\\...
    """
    video_path, out_path, work_dir = Path(video_path).resolve(), Path(out_path).resolve(), Path(work_dir).resolve()
    info = info or ffmpeg_tools.probe(video_path)
    write_ass(lines, style, info, vertical, work_dir)
    args = ["-i", video_path, "-filter_complex", _filter_graph(info, vertical, "captions.ass"),
            "-map", "[out]", "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out_path]
    ffmpeg_tools.run_ffmpeg(args, cwd=work_dir, what="burn the captions into the video",
                            progress=progress, duration=info.get("duration"))
    return out_path


def render_frame(video_path, lines, style, time_sec, out_path, work_dir, info=None, vertical=False):
    """Save one frame (PNG/JPG) with captions, exactly as the export will look."""
    video_path, out_path, work_dir = Path(video_path).resolve(), Path(out_path).resolve(), Path(work_dir).resolve()
    info = info or ffmpeg_tools.probe(video_path)
    write_ass(lines, style, info, vertical, work_dir, ass_name="preview.ass")
    time_sec = max(0.0, min(float(time_sec), max(info.get("duration", 0) - 0.1, 0)))
    # -copyts keeps the original clock, so the subtitle for this moment is drawn.
    args = ["-ss", f"{time_sec:.3f}", "-copyts", "-i", video_path,
            "-filter_complex", _filter_graph(info, vertical, "preview.ass"),
            "-map", "[out]", "-frames:v", "1", "-q:v", "3", out_path]
    ffmpeg_tools.run_ffmpeg(args, cwd=work_dir, what="create the preview picture")
    return out_path
