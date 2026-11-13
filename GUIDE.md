# Kadr — the complete guide

Everything about Kadr in one place, in plain words.
For technical details see `README.md` (install on other systems, settings, benchmark)
and `DECISIONS.md` (why things were built this way, and what was measured).

---

## 1. What Kadr is

Kadr makes subtitles for short videos (up to 5 minutes), by itself, on your own computer.

1. You give it a video with **Uzbek, Russian or English** speech (or a mix).
2. It writes down what is said, word by word, with the time of every word.
3. You check and fix the text in a simple page in your browser.
4. It gives you back the video with **styled captions burned in** — the word being spoken lights up — plus a `.srt` subtitle file.
5. It can also **translate captions between English and Russian**.

It costs nothing: no paid services, no accounts, no internet needed after the first download of the speech and translation models.

**Important:** Kadr is not a website on the internet. It is a program that runs on your laptop, and you use it through your browser at `http://localhost:8000`. That address only works on this laptop, and only while Kadr is running.

---

## 2. Where it is

| What | Where |
|---|---|
| The program | `C:\Users\USER\Desktop\new app with fable` (folder on your Desktop) |
| Start button | `StartKadr.bat` inside that folder |
| Your work | the `jobs` folder inside it (one folder per video) |
| Online copy of the code | <https://github.com/Thunder1202/framewright> (private, only you can see it) |

---

## 3. How to start and stop it

**Start:** open the folder on your Desktop and double-click **`StartKadr.bat`**.
A black window opens, and after a few seconds your browser opens Kadr.

**Stop:** close the black window.

Keep the black window open while you work. If something goes wrong, the details are printed there.

**Tip:** right-click `StartKadr.bat` → *Show more options* → *Send to* → *Desktop (create shortcut)* to put an icon on your Desktop.

**On another computer:** download the code from GitHub, then double-click `StartKadr.bat`.
The first time, it installs everything by itself (needs Python, see `README.md`).

```bash
git clone https://github.com/Thunder1202/framewright.git
```

---

## 4. How to use it, step by step

### Step 1 — Upload

- Drag one or several videos onto the page, or click the box to choose them.
- **Language spoken:**
  - **Uzbek**, **Russian** or **English** — choose this if the whole video is in one language. It is the most accurate choice.
  - **Auto** — for mixed videos. Kadr decides the language for each piece of speech.
- **Speech model:** leave it on **Default**. Default uses a special Uzbek model for Uzbek speech and standard Whisper for Russian and English.

### Step 2 — Wait

The list shows the progress of each video. Videos are processed one after another (a queue).
The first video with a new language downloads a model once, so it takes longer:

| Model | Size | Used for |
|---|---|---|
| Uzbek model | ~1 GB | Uzbek speech |
| `medium` (GPU) or `small` (CPU) | ~1.5 GB / ~0.5 GB | Russian, English, language detection |
| Translation EN→RU / RU→EN | ~200 MB each | the translate buttons |

### Step 3 — Edit (click **Open editor**)

The video is on the left, the caption lines on the right.

| You want to… | Do this |
|---|---|
| Jump the video to a word | Click the word |
| Fix the text | Click into a line and type. **Enter** saves, **Esc** cancels |
| Cut a line in two | Click the word that should start the new line, then **Split** |
| Join a line with the next one | **Merge ↓** |
| Delete a line | **✕** |
| Make a line start/end earlier or later | **−** / **+** next to the times (0.1 s per click) |
| Switch Uzbek between alphabets | **Lotin → Кирилл** or **Кирилл → Lotin** |
| Translate English captions to Russian | **EN → RU** |
| Translate Russian captions to English | **RU → EN** |
| Take back the last change | **Undo** (press again to redo) |
| Throw away all edits | **Reset** (goes back to the automatic transcript) |
| Get only the subtitle file | **.srt** |

Everything is saved after every change. You can close the browser or Kadr and continue later; nothing is lost.

### Step 4 — Style

Click a style card. The caption on the video changes at once.

| Style | Looks like |
|---|---|
| **Bold white** | Big white text with black outline, spoken word turns green |
| **Yellow highlight** | CAPITAL letters, spoken word turns yellow |
| **Rounded box** | Text inside a dark rounded box, spoken word turns gold |
| **Minimal** | Small, quiet text at the bottom |
| **Word box** | A purple box jumps from word to word |

The preview on the video is approximate. **Exact preview** shows one real frame exactly as it will be exported.

### Step 5 — Export

- Tick **Export as 9:16 vertical** if you want a 1080×1920 video (for Reels, TikTok, Shorts) from a wide video. Vertical videos keep safe margins so app buttons don't cover the captions.
- Press **Export video**, wait for the bar, then **Download video (.mp4)** and/or **Subtitles (.srt)**.

---

## 5. Translation (English ↔ Russian)

- Click **EN → RU** or **RU → EN** in the editor. It takes a few seconds.
- It works offline and is free (Argos Translate models).
- **It is rough.** It gets the basic meaning, but slang and special words go wrong.
  Example from a real fitness video:
  - "Arms overhead, legs up" → "Руки над головой, ноги вверх" ✅
  - "six packs" → "шесть пачек" ❌ (should be "кубики пресса")
  - "obliques" → "косичек" ❌ (should be "косые мышцы")
- **Always read every line before sending to a client.** For important videos, translating the `.srt` with Google Translate or DeepL gives better results.
- Each sentence keeps its timing. The word-by-word highlight inside a translated sentence is estimated.
- **Uzbek translation is not available.** There is no free offline Uzbek translator that may be used for paid work.

---

## 6. Changing things

All of these are text files in the Kadr folder. Edit them with Notepad, save, then restart Kadr.

### `dictionary.txt` — fix words the model keeps getting wrong

```
ok tepa => Oqtepa
instagramm => Instagram
Toshkent
```

- `wrong => right` replaces what was heard.
- A line with just a name always writes that name with exactly this spelling.
- It works on new videos (not on ones already transcribed).

### `styles.json` — caption looks

Each block is one style: font, size, colours, outline, box, position. Change a number and save.
Copy a block and rename it to make your own style. To use another font, put its `.ttf` into `engine/fonts/` — check it has the Uzbek letters oʻ gʻ ў қ ғ ҳ.

### `settings.json` — models and limits

| Setting | Meaning |
|---|---|
| `"model"` | General model. `"auto"` = `small` on CPU, `medium` on GPU |
| `"model_uz"` | Model for Uzbek speech (set to a special Uzbek model) |
| `"model_ru"` | Model for Russian speech (empty = use `"model"`) |
| `"auto_languages"` | Languages Auto mode chooses from: `["uz", "ru", "en"]` |
| `"max_video_seconds"` | Longest allowed video (300 = 5 minutes) |
| `"port"` | Change if 8000 is busy |
| `"open_browser"` | `false` = don't open the browser on start |

---

## 7. Speed on your laptop (GTX 1650)

Seconds of work per **one minute** of video:

| Speech | With your NVIDIA GPU | CPU only |
|---|---|---|
| Russian / English | ~9 s | ~12–18 s |
| Uzbek | ~19–28 s | ~70–160 s |
| Mixed (Auto) | ~45–50 s | ~125 s |
| Rendering the final video | ~3 s | ~3 s |
| Translation | a few seconds | a few seconds |

Your GPU is used automatically. The GPU libraries are already installed on your laptop.
On another computer with an NVIDIA card, run `pip install -r requirements-gpu.txt` once.

---

## 8. How accurate is it?

Measured on **computer-generated voices** (clean, no music), not on real people:

| Setup | Words wrong |
|---|---|
| Standard Whisper on Uzbek | 60–90 % ❌ |
| Kadr default (Uzbek model + Whisper) on Uzbek | 0–6 % |
| Kadr default on Russian | 0 % |
| Kadr default on mixed Uzbek + Russian | 1 % |
| English (your fitness video) | every word correct |

**Real videos will be worse** — accents, music, noise, fast speech, slang.
To measure on your own videos: put 5 clips with correct text files into `samples/` (see `samples/README.md`) and run:

```bash
python benchmark.py samples --models settings small medium
```

---

## 9. Known problems and tips

- **Always read the captions before exporting.** No speech model is perfect.
- **Names, brands, numbers** are often wrong → add them to `dictionary.txt`.
- **Uzbek model writes in lower case** and sometimes drops apostrophes ("koring" instead of "ko‘ring"). Fix in the editor.
- **Background music** can make the model invent words. Delete those lines.
- **A sentence that switches language in the middle** comes out partly wrong. Fix by hand.
- **One video at a time.** A long queue just takes longer.
- **Error popups / red messages** explain the problem in plain words: no sound in the video, video too long, broken file, wrong file type.

---

## 10. What was built — history

| When | What |
|---|---|
| Nov 10–11 | Built the whole app: engine (audio, transcription, captions, rendering), web editor, 5 styles, Latin⇄Cyrillic converter, dictionary, batch queue, benchmark, 300+ tests |
| Nov 11 | Compared speech models. Standard Whisper was bad at Uzbek, so a free Uzbek-trained model is now used for Uzbek. Fixed Auto mode (Whisper never recognises Uzbek as Uzbek) and filtered invented text |
| Nov 11 | Named the app **Kadr**, added the logo, put the code on GitHub (private) |
| Nov 12 | Added `StartKadr.bat` (double-click to start) |
| Nov 12 | Fixed English videos: English speech was treated as Uzbek and came out as nonsense. English is now supported |
| Nov 12 | Added English ↔ Russian translation buttons |

---

## 11. Next steps (ideas)

1. **Test on your own videos** (section 8) to see real accuracy.
2. **Put Kadr online** so it works from your phone or for clients:
   - *Hugging Face Spaces* — free, always online, can be private, but slow (no GPU). You need a free Hugging Face account.
   - *Cloudflare Tunnel* — a temporary public link to Kadr running on your laptop. Fast, but only while your laptop is on. Should get a password first.
3. **Telegram bot** — clients send a video to a bot and get the captioned video back. `README.md` section 7 has a starting example.

---

## 12. Where to look in the code

| File | What it does |
|---|---|
| `engine/pipeline.py` | The whole process in a few functions — start reading here |
| `engine/transcribe.py` | Speech to text, GPU/CPU choice, language detection |
| `engine/captions.py` | Splitting into lines, editing, SRT |
| `engine/ass.py` + `engine/render.py` | Styled captions and burning them into the video |
| `engine/translit.py` | Uzbek Latin ⇄ Cyrillic |
| `engine/translate.py` | English ⇄ Russian translation |
| `engine/dictionary.py` | `dictionary.txt` rules |
| `engine/jobs.py` + `engine/worker.py` | Saving work and the queue |
| `web/` | The browser page |
| `tests/` | Automatic tests — run `python -m pytest tests` |
