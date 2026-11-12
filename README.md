# Kadr

1. Takes a short video (up to 5 minutes) with Uzbek, Russian or English speech, or a mix.
2. Writes down what is said, word by word, using a free speech model that runs on your computer.
3. Lets you fix the text and the timing in a simple web page.
4. Exports the video with styled captions burned in (the spoken word lights up), plus an `.srt` file.
5. Costs nothing: no paid APIs, no accounts, works offline after the first model download.

---

## 1. Install

You need **Python 3.10 or newer** (3.9 also works). FFmpeg is installed automatically as
part of step 3 (a private copy), so you do not have to install it yourself.

### Windows

1. Install Python from <https://www.python.org/downloads/>. On the first screen tick
   **"Add python.exe to PATH"**.
2. Open the Kadr folder, click the address bar, type `cmd`, press Enter.
3. Run:

   ```bash
   python -m venv .venv
   ```
   ```bash
   .venv\Scripts\activate
   ```
   ```bash
   pip install -r requirements.txt
   ```

### macOS

```bash
brew install python ffmpeg
```
```bash
python3 -m venv .venv && source .venv/bin/activate
```
```bash
pip install -r requirements.txt
```

### Linux (Ubuntu / Debian)

```bash
sudo apt install python3 python3-venv ffmpeg
```
```bash
python3 -m venv .venv && source .venv/bin/activate
```
```bash
pip install -r requirements.txt
```

### About FFmpeg

Kadr first looks for an FFmpeg installed on your system, then for the copy that
`pip install` brought along (the `imageio-ffmpeg` package). If neither is found it tells
you what to do. To install the system one yourself: Windows `winget install Gyan.FFmpeg`,
macOS `brew install ffmpeg`, Linux `sudo apt install ffmpeg`.

### NVIDIA graphics card (optional, much faster)

If your computer has an NVIDIA card, also run this once (about 1.2 GB download):

```bash
pip install -r requirements-gpu.txt
```

Without it, or if anything about the GPU fails, Kadr quietly uses the CPU.

---

## 2. Run and use

**Easiest on Windows:** double-click `StartKadr.bat` in the project folder. The first time it installs everything; after that it just starts Kadr and opens your browser. Close the black window to stop it.

Or, every time you want to use it (after activating `.venv` as above):

```bash
python run.py
```

Your browser opens <http://localhost:8000>. Then:

1. **Upload.** Drop one or several videos on the page. Choose the language: *Uzbek*,
   *Russian*, or *Auto* for mixed speech. If the whole video is in one language, choose it,
   it is more accurate than Auto.
2. **Wait.** The list shows the progress of every video. They are processed one after
   another. The first time a model is used it is downloaded (small ≈ 0.5 GB,
   medium ≈ 1.5 GB), so the first video takes longer.
3. **Open editor.** Video on the left, caption lines on the right.
   - Click a word → the video jumps there.
   - Click into a line and type → fix the text. Enter saves, Esc cancels.
   - **Split** → first click the word that should start a new line, then press Split.
   - **Merge ↓** → joins a line with the next one. **✕** deletes a line.
   - **− / +** next to the times → move a line's start or end by 0.1 s.
   - **Lotin → Кирилл / Кирилл → Lotin** → convert all Uzbek text between alphabets.
   - **EN → RU / RU → EN** → translate all captions between English and Russian,
     offline. The first time it downloads a translation model (about 200 MB). Machine
     translation is rough: read every line. Undo brings the original back.
   - **Undo** takes back the last change. **Reset** returns to the automatic transcript.
4. **Pick a style.** Click a style card; the caption on the video changes at once.
   "Exact preview" shows one real frame exactly as it will be exported.
5. **Export.** Tick "9:16 vertical" if you want a 1080×1920 result from a wide video,
   press **Export video**, then **Download**.

Your work is saved after every change in `jobs/<id>/`. You can close the browser or the
program and continue later; nothing is lost. Videos that were waiting in the queue
continue automatically on the next start.

### Without the browser (command line)

```bash
python -m engine.cli myvideo.mp4 --lang uz --style boxed
```

This writes `myvideo.captioned.mp4`, `myvideo.srt` and `myvideo.transcript.json` next to
the video. Add `--vertical` for 9:16, `--model medium` to pick a model,
`--json-only` to stop after the transcript.

---

## 3. Change the model, styles and dictionary

### Model — `settings.json`

```json
{
  "model": "auto",
  "model_uz": "yuldashev222/whisper-small-uz-v1-ct2",
  "model_ru": ""
}
```

- `"model"`: the general model, used for Russian and for language detection. `"auto"`
  means `small` on CPU and `medium` on a working NVIDIA GPU. You can write `tiny`,
  `small`, `medium`, `large-v3`, a Hugging Face name of a model in faster-whisper
  (CTranslate2) format, or a folder path.
- `"model_uz"` / `"model_ru"`: a different model just for that language (empty = use
  `"model"`). Uzbek is set to a free community model trained on Uzbek. In tests it got
  far fewer words wrong than standard Whisper; see `DECISIONS.md` for the numbers and
  their limits. In Auto mode each piece of speech goes to the model of its language.
  The first Uzbek video downloads this model once (about 1 GB).
- Choosing a model in the web page's menu overrides all of this for that upload.
- To force the CPU even when a GPU exists, start with the environment variable
  `KADR_DEVICE=cpu`.
- Other settings: `max_video_seconds` (default 300), `max_upload_mb`, `port`,
  `open_browser`, `auto_languages`, `compute_type`.

Restart `python run.py` after changing settings. See **Benchmark** below for how to
choose, and `DECISIONS.md` for what was measured.

### Styles — `styles.json`

Each block is one style: font, size, colours, outline, box, position. Change a number,
save, reload the page. Copy a block and give it a new name to make your own style.
Sizes are for a 1080-pixel-wide video and scale automatically. To use another font, put
its `.ttf` file into `engine/fonts/` and write its file name in `"font"`. The three
bundled fonts (Montserrat ExtraBold, Noto Sans Bold/Regular, all free under the OFL
licence) contain every Uzbek Latin and Cyrillic letter, including oʻ gʻ ў қ ғ ҳ. Check
your own font for these letters first; `python -m pytest tests/test_ass.py` tests every
font used in `styles.json`.

### Dictionary — `dictionary.txt`

For names and words the model keeps getting wrong. One rule per line:

```
ok tepa => Oqtepa
instagramm => Instagram
Toshkent
```

`wrong => right` replaces what was heard. A line with only a name fixes its spelling and
capital letters wherever it is heard. It is applied automatically after every
transcription (not to videos that are already transcribed).

---

## 4. Benchmark

```bash
python benchmark.py
```

runs every video in `samples/` and prints, for each stage, **seconds of work per minute of
video**. Under 60 means faster than real time. Example line:

```
transcription small   6.4 s  =  18.0 s per minute   [cpu/int8, model load 4.1 s]   WER 12.5%
```

- `18.0 s per minute`: a 1-minute video takes 18 seconds to transcribe on this computer.
- `WER` (word error rate): share of words that were wrong, compared with the `.txt` file
  next to the video. Lower is better. Only shown when that `.txt` exists.

Compare models on your own clips:

```bash
python benchmark.py samples --models small medium --show-text
```

`samples/README.md` explains how to add 5 of your own videos with correct texts. Do
this before trusting any model for paid work.

Tests:

```bash
python -m pytest tests
```

---

## 5. Known limits (please read)

- **Uzbek accuracy is not guaranteed.** The only Uzbek measurements made while building
  this were on computer-generated voices (1.5 % of words wrong with the default setup;
  see `DECISIONS.md`). Nothing was measured on real Uzbek speakers, who will be harder.
  Always read the transcript before exporting, and benchmark on your own clips.
- **The Uzbek model writes in lower case** and sometimes leaves out apostrophes
  ("koring" for "ko‘ring"). Fix capitals in the editor, or add frequent words to
  `dictionary.txt`.
- **Uzbek on CPU is slow:** about 1–3 minutes of work per minute of video on the test
  computer. An NVIDIA GPU with `requirements-gpu.txt` makes it 3–5× faster.
- **Mixed Uzbek/Russian.** Whisper decides the language once per piece of audio. Auto mode
  cuts the speech into pieces of up to 15 seconds at pauses and decides for each piece:
  Russian when Whisper is confident it is Russian, otherwise Uzbek. A sentence that
  switches language in the middle, or a single Russian word inside Uzbek speech, will
  be written in the wrong language or garbled. Speech in a third language (English,
  for example) is treated as Uzbek. Fix those spots by hand.
- **Names, brands, slang, numbers** are often wrong. Use `dictionary.txt` for the ones
  that repeat.
- **Background music and noise** make everything worse and can produce invented words
  during music-only parts. Delete those lines in the editor.
- **Uzbek script.** Whisper may write Uzbek in Latin or Cyrillic. Use the converter
  buttons. The converter has limits of its own: Latin `ts` (лицей vs айтса) and the
  Russian soft sign `ь` cannot always be guessed; a small exception list in
  `engine/translit.py` covers common words and you can add to it.
- **Word timing** comes from the model and is usually within about 0.1–0.2 s. Lines can be
  nudged by hand; single words inside a line cannot.
- **The preview in the editor is approximate** (drawn by the browser). The "Exact preview"
  button and the export use the real renderer.
- **Translation is only English ↔ Russian**, and rough. There is no free offline Uzbek
  translator that may be used commercially (see `DECISIONS.md`).
- **One video at a time**, on purpose. Long queues simply take longer.
- Tested on Windows 11. The code uses nothing Windows-specific, but macOS and Linux were
  not tested while building.

---

## 6. Folder map

```
run.py            start the web app
benchmark.py      speed and accuracy test
settings.json     model, limits, port
styles.json       caption styles
dictionary.txt    your names and terms
engine/           all the real work, no web code in here
  pipeline.py       caption_video(), process_job(), export_job()  <- start reading here
  transcribe.py     speech to text (faster-whisper), GPU/CPU choice
  captions.py       splitting into lines, editing, SRT
  ass.py            ASS subtitles with word highlighting
  render.py         burning captions in with FFmpeg
  translit.py       Uzbek Latin <-> Cyrillic
  dictionary.py     dictionary.txt rules
  jobs.py           jobs/<id>/ storage
  worker.py         the queue
  styles.py, ffmpeg_tools.py, config.py, errors.py, cli.py
web/              the local web page (FastAPI + plain HTML/CSS/JS)
tests/            pytest tests
samples/          test videos for the benchmark
jobs/             your work, one folder per video
```

---

## 7. Next steps: a Telegram bot in front of the engine

The engine does not know about the web page, so a bot only needs one function:

```python
from engine import pipeline
result = pipeline.caption_video("in.mp4", language="auto", style="bold_white", vertical=False)
# result["video"] -> path of the captioned mp4, result["srt"] -> path of the .srt
```

A minimal bot with the free `python-telegram-bot` library (`pip install python-telegram-bot`):

```python
# bot.py - put it next to run.py. Get a token from @BotFather in Telegram.
import asyncio
from telegram import Update
from telegram.ext import Application, MessageHandler, filters
from engine import pipeline
from engine.errors import KadrError

TOKEN = "PASTE-YOUR-TOKEN-HERE"
busy = asyncio.Lock()          # one video at a time

async def on_video(update: Update, context):
    video = update.message.video or update.message.document
    await update.message.reply_text("Got it. Working on the captions...")
    file = await video.get_file()
    path = f"jobs/telegram_{update.message.message_id}.mp4"
    await file.download_to_drive(path)
    try:
        async with busy:
            # the engine is normal (blocking) code, so run it in a helper thread
            result = await asyncio.to_thread(pipeline.caption_video, path, "auto", "bold_white")
        await update.message.reply_video(open(result["video"], "rb"))
    except KadrError as e:
        await update.message.reply_text(f"Sorry: {e}")

app = Application.builder().token(TOKEN).build()
app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, on_video))
app.run_polling()
```

Things to know before you build it:

1. **File size.** Normal bots can download files up to 20 MB and send up to 50 MB. For
   bigger videos you need Telegram's "Local Bot API Server" (also free).
2. **No editing step.** A bot sends the result without a human check. For paying clients
   a good flow is: bot receives the video → it appears in your web list → you fix the
   text in the editor → you export and send it back. Use `pipeline.add_video()` and
   `worker.enqueue_process()` for that instead of `caption_video()`.
3. **Choices.** Let the user pick language and style with buttons (`InlineKeyboardMarkup`)
   and pass them to `caption_video(language=..., style=...)`.
4. **Your computer must be on** while the bot runs. Later you can move it to a rented
   server; the code stays the same.
5. **Keep the token secret.** Do not put it on GitHub.
