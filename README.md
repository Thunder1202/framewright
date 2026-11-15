# Framewright

A video editor that runs entirely on your own computer: no account, no upload, no watermark.

**To open it:** double-click **Framewright** on the desktop.
**To learn it:** press **F1** inside the app, or the **Guide** button at the top right.

## What is in this folder

| Folder | What it is |
| --- | --- |
| `src/`, `electron/` | The editor itself |
| `kadr/` | Kadr, the captions engine: it listens to a video and writes the captions. The editor uses it for you; it also works on its own with `kadr/StartKadr.bat` ([its guide](kadr/GUIDE.md)) |
| `data/` | Your saved projects and imported videos. Back this folder up to keep your work safe |
| `kadr/jobs/` | Videos you captioned in Kadr's own page |
| `release/` | The built app that the desktop icon opens, and the installer |
| `replica/` | Notes from building it: feature list and build log |

Everything is on drive D on purpose. Moving this folder breaks the desktop icon; if you must move it, ask an AI helper to do it and fix the icon.

## For an AI helper

Read [CLAUDE.md](CLAUDE.md) first.
