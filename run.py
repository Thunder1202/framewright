"""Start Kadr:  python run.py   then open http://localhost:8000"""
import sys
import threading
import webbrowser


def check_python():
    """Stop early with a clear message on a Python that is too old."""
    if sys.version_info < (3, 9):
        print("Kadr needs Python 3.9 or newer (3.10+ recommended). You have " + sys.version.split()[0] + ".")
        print("Download a newer one from https://www.python.org/downloads/")
        sys.exit(1)


def check_packages():
    """Stop early with a clear message if 'pip install' was not run."""
    missing = []
    for module, package in (("fastapi", "fastapi"), ("uvicorn", "uvicorn"), ("faster_whisper", "faster-whisper"),
                            ("multipart", "python-multipart"), ("fontTools", "fonttools")):
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    if missing:
        print("Some packages are not installed yet: " + ", ".join(missing))
        print("Run this first:\n\n    pip install -r requirements.txt\n")
        sys.exit(1)


def main():
    """Check everything, print a short status, start the web server."""
    check_python()
    check_packages()

    from engine import config, ffmpeg_tools, styles, transcribe
    from engine.cli import setup_console
    from engine.errors import KadrError
    setup_console()

    try:
        ffmpeg = ffmpeg_tools.find_ffmpeg()
        style_count = len(styles.load_styles())
    except KadrError as e:
        print("\n" + str(e) + "\n")
        sys.exit(1)

    settings = config.load_settings()
    device = transcribe.detect_device()
    port = int(settings["port"])
    url = f"http://localhost:{port}"
    print("=" * 60)
    print("  Kadr is starting")
    print(f"  FFmpeg:  {ffmpeg}")
    print(f"  Device:  {'NVIDIA GPU found (tested on first use)' if device == 'cuda' else 'CPU'}")
    print(f"  Model:   {transcribe.default_model(device)}   Styles: {style_count}")
    print(f"  Open:    {url}")
    print("  Stop:    press Ctrl+C in this window")
    print("=" * 60)

    if settings.get("open_browser") and "--no-browser" not in sys.argv:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    import uvicorn
    try:
        uvicorn.run("web.app:app", host="127.0.0.1", port=port, log_level="warning")
    except OSError as e:
        print(f"\nCould not start on port {port}: {e}")
        print('Another program may be using it. Change "port" in settings.json and try again.')
        sys.exit(1)


if __name__ == "__main__":
    main()
