# Decisions

Choices made while building Kadr, each with one line of reasoning.
Built and tested on: Windows 11, Python 3.9.10, GTX 1650 (4 GB), FFmpeg 7.1.

## Setup and tools

- **Python 3.9 is also accepted, 3.10+ recommended.** The build computer only had 3.9; the code uses nothing newer, so refusing 3.9 would only have stopped it from running here.
- **FFmpeg comes with `pip install` (imageio-ffmpeg) as a fallback.** A system FFmpeg is used first if present; this way "one command to install" is really true on Windows, where installing FFmpeg is the step beginners get stuck on.
- **No ffprobe.** Video facts are read from `ffmpeg -i` output, because the pip FFmpeg ships without ffprobe.
- **FastAPI + plain HTML/CSS/JS, no build step.** As required; every page is a file you can open and read.
- **fonttools added as a dependency.** Needed to measure text width so rounded boxes and line breaks are placed exactly; it is small and pure Python.
- **GPU libraries are a separate, optional file (`requirements-gpu.txt`).** They are 1.2 GB and useless without an NVIDIA card, so they must not be part of the basic install.
- **The GPU is tested in a separate process with a time limit before use.** A broken CUDA setup can freeze or crash Python instead of raising an error; this way the app always falls back to CPU (int8).
- **GPU compute type `int8_float16`, then `int8`.** Fits a 4 GB card with the medium model.
- **Settings live in `settings.json`,** not in code or environment variables: easier for a beginner to find and edit.

## Transcription

- **General model: `small` on CPU, `medium` on a working GPU, as the brief asked. Uzbek speech goes to a community Uzbek model instead.** The measurements in "Model quality" below showed standard Whisper gets 60–90 % of Uzbek words wrong.
- **`KADR_DEVICE=cpu` forces the CPU.** Useful if the GPU is busy or misbehaves.
- **Separate models per language are possible (`model_uz`, `model_ru`).** Models trained on Uzbek are better at Uzbek but usually worse at Russian, so one model for everything is the wrong shape for mixed work.
- **Auto mode = cut speech at pauses (pieces up to 15 s), detect the language of each piece, transcribe each piece with that language.** Whisper can only hold one language per piece of audio; shorter pieces switch language faster but cost speed and context. 15 s was the compromise.
- **Auto mode only chooses between the languages in `auto_languages` (uz, ru).** Whisper often mistakes Uzbek for Turkish, Kazakh or Tajik; limiting the choice removes that whole class of errors.
- **Pieces shorter than 1.5 s keep the previous piece's language.** Language detection on one or two words is close to guessing.
- **Language detection always uses the general model,** even when `model_uz` is set: a model trained only on Uzbek tends to call everything Uzbek.
- **`condition_on_previous_text` is off.** It reduces the "repeating sentence" failure of Whisper on music and noise, at a small cost in consistency.
- **Dictionary is a find-and-replace pass after transcription,** matched ignoring case and apostrophe style; it keeps word timings.

## Captions and rendering

- **Lines: 2–6 words, max 32 characters; new line at pauses over 0.7 s and after sentence ends.** A one-word last line is repaired by borrowing a word from the line above (or joining, if that is impossible).
- **Word highlighting is done with one subtitle event per word,** not ASS karaoke tags: it looks the same in every libass version and makes "box behind the spoken word" possible.
- **Text is positioned by our own layout code (`\pos`), and long lines are broken into two balanced rows or shrunk.** This is what guarantees captions never run off a vertical video.
- **Rounded boxes are drawn as ASS vector shapes sized from real font measurements.** libass has no rounded-box style of its own.
- **Five presets** (the four required + "Word box"). Sizes are defined for a 1080-wide video and scaled.
- **Fonts: Montserrat ExtraBold and Noto Sans Bold/Regular are bundled** (SIL Open Font License). A test checks that every font used in `styles.json` contains oʻ gʻ ʼ ў қ ғ ҳ and all Russian letters.
- **Vertical safe margins: bottom 14 %, top 10 %, text width max 84 %** on any portrait video, even if a style asks for less: apps draw buttons there.
- **9:16 export of a wide video puts it on a blurred copy of itself** instead of black bars or cropping people's heads off.
- **Export uses H.264 (libx264, CRF 20, veryfast) + AAC,** the format every phone and app accepts. NVENC was not used, to keep one code path that works everywhere.
- **FFmpeg runs inside the job folder with relative file names.** FFmpeg's filter syntax breaks on Windows paths such as `C:\...` and on folder names with spaces or quotes.

## Web editor

- **Every edit is a small request to the server, which returns the new lines.** The editing rules live in one place (`engine/captions.py`), are covered by tests, and work the same for a future bot.
- **Editing text with the same number of words keeps each word's timing; otherwise the line's time is shared out by word length.**
- **Timing is nudged per line in 0.1 s steps,** not per word: enough to fix what viewers notice, and simple.
- **The browser preview is approximate (CSS); "Exact preview" renders one true frame with FFmpeg.** A pixel-exact live preview would need libass in the browser, which means a build step.
- **A small 480p copy of the video is made for the player.** Browsers cannot play every phone format (HEVC, some .mov), and it keeps seeking fast.
- **Undo/Redo history of 50 steps (Ctrl+Z / Ctrl+Y), plus Reset.** Each version is saved in `captions.history.json` in the job folder (a few KB each), so it survives a restart. Ctrl+Z inside a text box still undoes typing, as in any program.
- **"Words per line" re-cuts the existing lines** (it does not re-transcribe), so text fixes are kept. With an exact number, lines never go over it; pauses and sentence ends still start a new line.
- **Text size is a multiplier on the style (S 0.8, M 1.0, L 1.25, XL 1.5),** not a new style, so every style gets all sizes.
- **Translated subtitles are a separate upload mode,** not buttons in the editor: the spoken language must be chosen by hand, and the original-language lines are kept in `captions.original.json`.
- **Model downloads send a plain `User-Agent: Kadr/1.0`.** The Argos server started refusing Python's default one (403).
- **Jobs are folders with JSON files, no database.** Easy to inspect, back up and delete by hand; written atomically so a crash cannot leave half a file.
- **Batch mode is a single worker thread with a queue; unfinished jobs resume on restart.** Two transcriptions at once would just compete for the same CPU/GPU.
- **The server listens on 127.0.0.1 only.** Nothing on the network can reach it; there is no login because there is nobody else.

## Uzbek extras

- **Converter output uses ‘ (U+2018) for oʻ/gʻ and ’ (U+2019) for the tutuq belgisi;** input accepts every apostrophe people type (' ` ʻ ʼ ‘ ’).
- **`ц` is always written `ts` in Latin** (official spelling uses `s` at the start of a word and after consonants), so that converting back can work.
- **Latin `ts` → `ц` only at the start of a word, before `-iya/-ion/-iy`, and for an exception list;** otherwise `тс`. This is a real ambiguity (litsey/лицей vs aytsa/айтса) that rules cannot fully solve.
- **A short exception list restores `ь`, `йо` and `ц` in common loan words** (сентябрь, район, концерт…). It lives at the top of `engine/translit.py` and is meant to be extended.
- **Translation: English ↔ Russian only, added later on request.** It uses the free Argos Translate models (MIT licence), loaded directly with CTranslate2 + SentencePiece, because the full Argos package pulls in PyTorch (2 GB+). Each model is about 200 MB and is downloaded on first use. **Uzbek translation is not offered:** Argos has no Uzbek model, NLLB-200 does but is non-commercial (CC-BY-NC), and MADLAD-400 (3 GB+) was not tested. Translated lines keep each sentence's start and end time; word timings inside are estimated from word length.
- **Whisper's own translate mode was not used:** it can only translate *into English*.

## Model quality — what was and was not measured

**No real Uzbek speech was available.** I had no recordings of real Uzbek speakers. To have *something* to measure, I generated test audio with computer voices:

- Russian: the Windows built-in voice "Irina" (offline).
- Uzbek: Microsoft's neural voices "Madina" and "Sardor", made with the free `edge-tts` tool. This tool uses a Microsoft online service. It was used **only to make the test files**; it is not part of Kadr.
- Mixed: Uzbek + Russian + Uzbek glued together (59 s).

198 reference words in total. The videos and their texts are in `samples/`.

**Results** (word error rate, lower is better; speed = seconds of work per minute of video, on a GTX 1650 GPU unless marked):

| Model | Uzbek clips | Mixed clip | Russian clip | All | Speed |
|---|---|---|---|---|---|
| `small` (standard) | 77 % / 91 % | 66 % | 0 % | 62 % | 12 s |
| `medium` (standard) | 69 % / 82 % | 68 % | 0 % | 60 % | 16 s |
| `yuldashev222/whisper-small-uz-v1-ct2` (Uzbek fine-tune) | 0 % / 6 % | 10 % | 17 % | 8.6 % | 28 s |
| `AlexAnoshka/fast-whisper-uz-rubaistt-v2-medium-ct2` (Uzbek fine-tune) | 0 % / 24 % | 15 % | 13 % | 13.6 % | 21 s |
| **Chosen default: Uzbek → Uzbek fine-tune, Russian → standard, with the auto-mode fixes below** | 0 % / 6 % | **1 %** | **0 %** | **1.5 %** | 32 s GPU, 103 s CPU |

What this shows:

- **Standard Whisper cannot do Uzbek usefully** (60–90 % of words wrong), even `medium`. It writes Uzbek as Turkish-looking text, or in Cyrillic.
- **Uzbek fine-tuned models are far better at Uzbek but worse at Russian.** The Uzbek model wrote Russian in Latin letters, or invented Uzbek phrases.
- **Decision: `settings.json` now ships with `"model_uz": "yuldashev222/whisper-small-uz-v1-ct2"`,** and Russian keeps the standard model (`small` on CPU, `medium` on GPU). It had the lowest error on Uzbek and is Apache-2.0 licensed, so you can use it for paid work. The first Uzbek video downloads about 1 GB.
- **Auto mode needed a fix for language detection.** Whisper never said "uz" for Uzbek speech. It guessed Turkish (0.57), Azerbaijani, Kazakh or Persian, while Russian was always detected with 0.93–0.99 confidence. New rule: a piece of audio counts as Russian only when Whisper is ≥ 50 % sure, and everything else counts as Uzbek. Before the fix, standard Whisper took one Uzbek part for Russian and *translated* it into Russian (mixed clip: 34 % error). After the fix: 1 %.
- **Filters against invented text.** The Uzbek model sometimes wrote phrases nobody said ("o‘zbekistonda o‘tkaziladi" twice, in 0.08 s), or a string of quote marks at the end of a clip. Segments are now dropped when their words are impossibly fast (under 0.1 s per word), when the text repeats itself, or when there is low confidence plus "no speech". faster-whisper's `hallucination_silence_threshold` is also switched on. After this, two full benchmark runs gave identical, clean results.
- **CPU speed:** with the Uzbek model, a 1-minute Uzbek video took 70–160 s on this computer's CPU. Standard `small` takes 12–18 s, but is unusable for Uzbek. With the free GPU libraries (`requirements-gpu.txt`) it is 19–28 s.

**Why these numbers do not prove real-world accuracy:**

- Computer voices are clean, slow and accent-free, with no music or noise. Real creators' videos will score much worse.
- Microsoft's Uzbek voices, or text like them, may have been part of what these community models were trained on. That would flatter them.
- 198 words is a tiny sample. One wrong word changes the result by 0.5 %.
- The fine-tuned models write everything in lower case. Captions will look like "assalomu alaykum, aziz do‘stlar." unless you fix capitals in the editor.

**Not tested:** `large-v3`, `hostmepanda/whisper-large-v3-turbo-uzbek-ct2` (about 1.6 GB, too big for the 4 GB test GPU together with the other models) and the many models in plain `transformers` format (they need converting to CTranslate2 first). `samples/README.md` explains how to compare any of them on your own clips.

## Not verified

- Real Uzbek speech of any kind (see above).
- Real phone videos: all test videos were generated with FFmpeg test patterns. Rotation handling is covered by a test with a generated rotated file.
- macOS and Linux.
- The Telegram bot example in the README is a starting sketch and was not run.
- Videos with background music or several people talking over each other.
