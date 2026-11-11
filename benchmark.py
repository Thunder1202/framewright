"""Benchmark: how fast is this computer, and which model is most accurate on YOUR videos?

    python benchmark.py                               all videos in samples/, default model
    python benchmark.py samples --models tiny small medium
    python benchmark.py my_clip.mp4 --lang uz

Speed is printed as "seconds of work per minute of video" (lower is better;
60 means the stage runs exactly as fast as the video plays).

Accuracy: put a text file with the correct words next to a video, with the
same name (clip1.mp4 + clip1.txt). The script then prints the word error
rate (WER): the share of words the model got wrong. 0% is perfect.

Language: --lang sets it for all videos. A file name ending in _uz or _ru
(clip_uz.mp4) overrides it for that file.
"""
import argparse
import re
import sys
import tempfile
import time
from pathlib import Path

from engine import captions, config, ffmpeg_tools, render, styles, transcribe, translit
from engine.cli import setup_console
from engine.errors import KadrError


def normalize_for_wer(text):
    """Make two texts comparable: Latin script, lower case, no punctuation."""
    text = translit.to_latin(text.lower().replace("ё", "е"))
    text = re.sub("[" + re.escape(translit.APOSTROPHES) + "]", "'", text)
    text = re.sub(r"[^\w' ]+", " ", text, flags=re.UNICODE)
    return text.split()


def word_error_rate(reference, hypothesis):
    """WER = (wrong + missing + extra words) / words in the reference. Returns 0..1+."""
    ref, hyp = normalize_for_wer(reference), normalize_for_wer(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    # Classic edit distance, one row at a time.
    row = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, row[0] = row[0], i
        for j, h in enumerate(hyp, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (r != h))
    return row[-1] / len(ref)


def language_for(video, default):
    """Language from the file name (_uz / _ru at the end), else the default."""
    m = re.search(r"[_.\-](uz|ru)$", video.stem.lower())
    return m.group(1) if m else default


def find_videos(target):
    """A single file, or every video inside a folder."""
    target = Path(target)
    if target.is_file():
        return [target]
    if target.is_dir():
        return sorted(p for p in target.iterdir() if p.suffix.lower() in config.VIDEO_EXTENSIONS)
    raise KadrError(f"'{target}' is not a file or folder.")


def per_minute(seconds, duration):
    """Convert a stage time to seconds per minute of video."""
    return seconds / max(duration, 0.001) * 60


def main(argv=None):
    """Run the benchmark and print the tables."""
    setup_console()
    parser = argparse.ArgumentParser(description="Kadr benchmark")
    parser.add_argument("target", nargs="?", default=str(config.ROOT / "samples"), help="video file or folder (default: samples/)")
    parser.add_argument("--models", nargs="+", default=None,
                        help="models to compare, e.g. tiny small medium. Default: what settings.json says "
                             "(including model_uz / model_ru)")
    parser.add_argument("--lang", default="auto", choices=config.LANGUAGES)
    parser.add_argument("--show-text", action="store_true", help="print what each model wrote")
    args = parser.parse_args(argv)

    try:
        videos = find_videos(args.target)
        if not videos:
            print(f"No videos found in {args.target}. See samples/README.md for how to add some.")
            return 1
        # "settings" = no fixed model: settings.json decides, per language.
        models = args.models or ["settings"]
        style = styles.get_style(None)
        print(f"Device: {transcribe.detect_device()}   FFmpeg: {ffmpeg_tools.find_ffmpeg()}")
        print(f"Videos: {len(videos)}   Models: {', '.join(models)}\n")

        totals = {m: {"time": 0.0, "duration": 0.0, "errors": 0.0, "ref_words": 0} for m in models}
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            for video in videos:
                try:
                    info = ffmpeg_tools.check_video(video, config.load_settings()["max_video_seconds"])
                except KadrError as e:
                    print(f"{video.name}: skipped ({e})\n")
                    continue
                duration = info["duration"]
                lang = language_for(video, args.lang)
                ref_file = video.with_suffix(".txt")
                reference = ref_file.read_text(encoding="utf-8-sig") if ref_file.is_file() else None
                print(f"== {video.name}  ({duration:.1f} s, {info['width']}x{info['height']}, language: {lang})")

                t = time.perf_counter()
                audio = ffmpeg_tools.extract_audio(video, tmp / "audio.wav")
                t_audio = time.perf_counter() - t
                print(f"   audio extraction      {t_audio:6.1f} s   = {per_minute(t_audio, duration):6.1f} s per minute of video")

                first_lines = None
                for model_name in models:
                    try:
                        t = time.perf_counter()
                        fixed = None if model_name == "settings" else model_name
                        # Load the model(s) first so loading is not counted as transcription time.
                        needed = [fixed] if fixed else {transcribe.default_model(), *(
                            transcribe.model_for(l) for l in ([lang] if lang != "auto" else ["uz", "ru"]))}
                        for name in needed:
                            transcribe.load_model(name)
                        t_load = time.perf_counter() - t
                        t = time.perf_counter()
                        result = transcribe.transcribe(audio, language=lang, model_name=fixed)
                        device, compute = result["device"], result["compute_type"]
                        t_trans = time.perf_counter() - t
                    except KadrError as e:
                        print(f"   {model_name}: failed ({e})")
                        continue
                    text = " ".join(s["text"] for s in result["segments"])
                    label = model_name if fixed else f"settings ({result['model']})"
                    line = (f"   transcription {label:<10} {t_trans:6.1f} s   = {per_minute(t_trans, duration):6.1f} s per minute"
                            f"   [{device}/{compute}, model load {t_load:.1f} s]")
                    totals[model_name]["time"] += t_trans
                    totals[model_name]["duration"] += duration
                    if reference is not None:
                        wer = word_error_rate(reference, text)
                        n = len(normalize_for_wer(reference))
                        totals[model_name]["errors"] += wer * n
                        totals[model_name]["ref_words"] += n
                        line += f"   WER {wer * 100:5.1f}%"
                    print(line)
                    if args.show_text:
                        print(f"      > {text}")
                    if first_lines is None:
                        first_lines = captions.split_into_lines(result["segments"])

                if first_lines:
                    t = time.perf_counter()
                    render.render_video(video, first_lines, style, tmp / "out.mp4", tmp, info=info)
                    t_render = time.perf_counter() - t
                    print(f"   rendering             {t_render:6.1f} s   = {per_minute(t_render, duration):6.1f} s per minute of video")
                if reference is None:
                    print(f"   (no {ref_file.name} next to the video, so accuracy was not measured)")
                print()

        print("== Summary per model")
        for model_name, t in totals.items():
            if not t["duration"]:
                continue
            row = f"   {model_name:<12} {per_minute(t['time'], t['duration']):6.1f} s per minute of video"
            if t["ref_words"]:
                row += f"   WER {t['errors'] / t['ref_words'] * 100:5.1f}%  (on {t['ref_words']} reference words)"
            print(row)
        print("\nHow to read this: under 60 s per minute means faster than real time.")
        print("Pick the most accurate model (lowest WER) that is still fast enough for you.")
        return 0
    except KadrError as e:
        print(f"\nProblem: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
