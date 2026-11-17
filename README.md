# Framewright

A video editor that runs entirely on your own computer: no account, no upload, no watermark. Automatic captions in Uzbek, Russian and English are built in.

**To open it:** double-click **Framewright** on the desktop.
**To learn it:** press **F1** inside the app, or read the guide below.

## Documents

| Read this | To find out |
| --- | --- |
| [docs/GUIDE.md](docs/GUIDE.md) | How to do everything, step by step, plus every keyboard shortcut |
| [docs/FEATURES.md](docs/FEATURES.md) | The full list of what it can do, and what is only partly done |
| [docs/YOUR-FILES.md](docs/YOUR-FILES.md) | Where your projects are and how to back them up |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | What to do when something goes wrong |
| [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) | What happens behind the buttons, in plain words |
| [docs/WHY-FRAMEWRIGHT.md](docs/WHY-FRAMEWRIGHT.md) | How it compares with CapCut |
| [docs/HISTORY.md](docs/HISTORY.md) | How it was built, and what is still open |
| [kadr/GUIDE.md](kadr/GUIDE.md) | Kadr, the captions engine, when used on its own |
| [CLAUDE.md](CLAUDE.md) | For an AI helper working on the code: start here |

## What is in this folder

| Folder | What it is |
| --- | --- |
| `src/`, `electron/` | The editor itself |
| `kadr/` | Kadr, the captions engine. The editor uses it for you; it also works on its own (**Kadr captions** icon on the desktop) |
| `data/` | **Your saved projects and imported videos. Back this folder up** |
| `kadr/jobs/` | Videos you captioned in Kadr's own page |
| `release/` | The built app that the desktop icon opens, and the installer |
| `docs/` | The documents listed above |
| `replica/` | Notes from building it: feature list, design tokens and the detailed build log |

Everything is on drive D on purpose. Do not move this folder: the desktop icons point at it ([why](docs/YOUR-FILES.md#rules-that-keep-things-from-disappearing)).
