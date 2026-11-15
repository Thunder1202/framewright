"""Command line use of the engine.

    python -m engine.cli video.mp4                      transcribe + export with defaults
    python -m engine.cli video.mp4 --lang uz --style boxed --vertical
    python -m engine.cli video.mp4 --json-only          only write the transcript JSON
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

from . import config, jobs, pipeline, styles
from .errors import KadrError


def setup_console():
    """Make printing Uzbek/Russian text safe on Windows terminals."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def main(argv=None):
    """Parse the arguments and run the pipeline on one video."""
    setup_console()
    parser = argparse.ArgumentParser(description="Kadr: auto-subtitles for Uzbek and Russian videos")
    parser.add_argument("video", help="path to the video file")
    parser.add_argument("--lang", default="auto", choices=config.LANGUAGES, help="speech language (default: auto)")
    parser.add_argument("--model", default=None, help="tiny, small, medium, large-v3 or a model path (default: from settings.json)")
    parser.add_argument("--style", default=None, help="style id from styles.json")
    parser.add_argument("--vertical", action="store_true", help="export as 9:16 (1080x1920)")
    parser.add_argument("--json-only", action="store_true", help="stop after writing the transcript JSON")
    parser.add_argument("--out", default=None, help="folder for the results (default: next to the video)")
    args = parser.parse_args(argv)

    try:
        if args.style:
            styles.get_style(args.style)   # fail early on a wrong style name
        video = Path(args.video)
        out_dir = Path(args.out) if args.out else video.parent
        out_dir.mkdir(parents=True, exist_ok=True)

        job = pipeline.add_video(video, {"language": args.lang, "model": args.model})
        folder = jobs.job_dir(job["id"])
        print(f"Job folder: {folder}")
        lines = pipeline.process_job(job["id"])
        transcript_out = out_dir / (video.stem + ".transcript.json")
        shutil.copy(folder / "transcript.json", transcript_out)
        print(f"Transcript: {transcript_out}")
        for line in lines:
            print(f"  {line['start']:7.2f} - {line['end']:7.2f}  {line['text']}")
        if args.json_only:
            return 0

        result = pipeline.export_job(job["id"], args.style, args.vertical)
        video_out = out_dir / (video.stem + ".captioned.mp4")
        srt_out = out_dir / (video.stem + ".srt")
        shutil.copy(result["video"], video_out)
        shutil.copy(result["srt"], srt_out)
        print(f"Video:      {video_out}")
        print(f"Subtitles:  {srt_out}")
        return 0
    except KadrError as e:
        print(f"\nProblem: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
