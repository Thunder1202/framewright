# Framewright

Framewright is a free, offline video editor for Windows that writes word-timed captions in **Uzbek, Russian and English** on your own computer.

- **Captions from speech, offline.** Press **Write captions** and the spoken words appear on the timeline, each word lighting up as it is said. Uzbek speech goes to a Whisper model fine-tuned for Uzbek; Russian and English use standard Whisper. Mixed Uzbek/Russian/English videos work in Auto mode.
- **Uzbek Latin ↔ Cyrillic** in one click, **English ↔ Russian** translation, and **.srt** export.
- **A full timeline editor:** layers, cut and trim, keyframes, masks, speed shapes, green screen, blend modes, stabilising, and MP4 export up to 4K 60 fps.
- **No account, no upload, no watermark.** After the models have downloaded once, nothing needs the internet.

> **Windows only.** The desktop app is built and tested on Windows 10 and 11 (64-bit). The editor also opens in a current Chrome or Edge for development, but it is not packaged for macOS or Linux.

<!-- TODO: replace this line with a screenshot or short GIF, e.g. ![Framewright writing Uzbek captions](docs/images/demo.gif) -->
*Screenshot / GIF: coming soon.*

## Install

### Requirements

| You need | Why |
| --- | --- |
| Windows 10 or 11, 64-bit | The desktop app is Windows only |
| [Git](https://git-scm.com/download/win) | To download the code |
| [Node.js](https://nodejs.org/) 22.12 or newer (includes npm) | To build the editor |
| [Python](https://www.python.org/downloads/) 3.10 or newer, with **"Add python.exe to PATH"** ticked during install | For the captions engine (Kadr) |
| About 8 GB of free disk space | Python packages (~2.4 GB) and speech/translation models (~2–4 GB, downloaded on first use) |
| Internet, the first time only | To install packages and download the models |
| *Optional:* an NVIDIA graphics card | Captions several times faster |

### Steps

1. **Download the code** and install the editor's packages:

   ```powershell
   git clone https://github.com/Thunder1202/framewright.git
   cd framewright
   npm install
   ```

2. **Set up the captions engine.** Double-click `kadr\StartKadr.bat` once. The first time it creates a private Python environment in `kadr\.venv` and installs what it needs (a few minutes), then opens Kadr's own page in your browser. You can close that window afterwards. To do the same by hand:

   ```powershell
   python -m venv kadr\.venv
   kadr\.venv\Scripts\python.exe -m pip install -r kadr\requirements.txt
   ```

   *Optional, NVIDIA cards only:* `kadr\.venv\Scripts\python.exe -m pip install -r kadr\requirements-gpu.txt`

3. **Build and open the desktop app:**

   ```powershell
   npm run dist
   ```

   This writes `release\win-unpacked\Framewright.exe`. Run it from there (you can pin it or make a desktop shortcut). The first time you press **Write captions**, the speech model downloads (about 0.5–1.5 GB).

> **Run the app from inside the cloned folder.** The app finds the captions engine and keeps your projects in `data\` relative to the repository folder. `npm run dist` also writes an installer (`release\Framewright Setup <version>.exe`), but a copy installed elsewhere edits video fine and cannot write captions. The installer is unsigned, so Windows SmartScreen may warn about it.

### Other commands

| What | Command |
| --- | --- |
| Build and open the app in one step | `npm run app` |
| Run the editor in the browser (http://localhost:5173) | `npm run dev` (captions need Kadr started by hand with `kadr\StartKadr.bat`) |
| Editor tests | `npm test` |
| Captions engine tests | `kadr\.venv\Scripts\python.exe -m pytest kadr\tests -q` |
| Regenerate `docs/GUIDE.md` and `docs/FEATURES.md` | `npm run docs` |

## Models used

Nothing below is stored in this repository. Each model is downloaded the first time it is needed, into `kadr\models\`, and works offline afterwards.

| Used for | Model | Size on disk | Licence |
| --- | --- | --- | --- |
| Speech to text, default on CPU | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) (CTranslate2 conversion of OpenAI Whisper small) | ~0.5 GB | MIT |
| Speech to text, default on a working NVIDIA GPU | [Systran/faster-whisper-medium](https://huggingface.co/Systran/faster-whisper-medium) | ~1.5 GB | MIT |
| Uzbek speech | [yuldashev222/whisper-small-uz-v1-ct2](https://huggingface.co/yuldashev222/whisper-small-uz-v1-ct2), a conversion of [OvozifyLabs/whisper-small-uz-v1](https://huggingface.co/OvozifyLabs/whisper-small-uz-v1) (fine-tuned from openai/whisper-small) | ~0.9 GB | Apache-2.0 |
| English → Russian translation | Argos Translate `translate-en_ru` 1.9 | ~0.2 GB | No licence on the model package itself; the Argos Translate project is MIT / CC0 (see note) |
| Russian → English translation | Argos Translate `translate-ru_en` 1.9 | ~0.2 GB | As above |
| Finding speech in the audio | Silero VAD, shipped inside the `faster-whisper` Python package | small | MIT |

Which speech model is used can be changed in `kadr/settings.json` (see [kadr/README.md](kadr/README.md#3-change-the-model-styles-and-dictionary)).

> **Note on the translation models.** The Argos Translate en↔ru packages do not state a licence of their own. The Argos Translate code and package index are MIT or CC0, but the models were trained on public OPUS corpora, a few of which carry research-only or non-commercial terms. Framewright does not redistribute these files; it downloads them from the Argos package server on first use. Check their terms yourself before commercial use.

## Licence

Framewright's own code is released under the [MIT License](LICENSE).

Bundled third-party files keep their own licences: the caption fonts in `kadr/engine/fonts/` (Montserrat and Noto Sans) are under the [SIL Open Font License 1.1](kadr/engine/fonts/OFL.txt). The models listed above are downloaded at run time under their own licences.

Framewright is an independent project. It is not affiliated with or endorsed by CapCut or ByteDance; the name is used only to compare features.

## Documents

| Read this | To find out |
| --- | --- |
| [docs/GUIDE.md](docs/GUIDE.md) | How to do everything, step by step, plus every keyboard shortcut (also inside the app: press **F1**) |
| [docs/FEATURES.md](docs/FEATURES.md) | The full list of what it can do, and what is only partly done |
| [docs/YOUR-FILES.md](docs/YOUR-FILES.md) | Where your projects are and how to back them up |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | What to do when something goes wrong |
| [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) | What happens behind the buttons, in plain words |
| [docs/WHY-FRAMEWRIGHT.md](docs/WHY-FRAMEWRIGHT.md) | How it compares with CapCut |
| [docs/HISTORY.md](docs/HISTORY.md) | How it was built, and what is still open |
| [kadr/GUIDE.md](kadr/GUIDE.md) | Kadr, the captions engine, when used on its own |
| [kadr/DECISIONS.md](kadr/DECISIONS.md) | Why Kadr works the way it does, with accuracy measurements |
| [CLAUDE.md](CLAUDE.md) | For an AI coding assistant working on the code: start here |

## What is in this repository

| Folder | What it is |
| --- | --- |
| `src/`, `electron/` | The editor (TypeScript, React, Electron) |
| `kadr/` | Kadr, the captions engine (Python, faster-whisper). The editor starts it for you; it also works on its own |
| `docs/` | The documents listed above |
| `scripts/` | Writes `docs/GUIDE.md` and `docs/FEATURES.md` from the app's own data |
| `replica/` | Design notes from building it: feature checklist, design tokens and the detailed build log ([what is in it](replica/README.md)) |

Created on your computer and never committed: `data/` (your saved projects and imported media), `kadr/jobs/`, `kadr/models/`, `kadr/.venv/`, `node_modules/`, `dist/` and `release/`.
