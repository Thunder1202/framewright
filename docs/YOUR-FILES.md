# Where your files are, and how to keep them safe

Everything Framewright uses lives inside the folder you cloned it into (called "the Framewright folder" below). It does not spread files over the system drive: projects, models and Kadr's Python environment all stay in that folder.

## The folders that matter to you

| Folder | What is in it | Back it up? |
| --- | --- | --- |
| `data\` | **Your projects and every video, picture and sound you imported into the editor.** This is your work. | **Yes. This is the one that matters.** |
| `kadr\jobs\` | Videos you captioned in Kadr's own page, with their captions | Yes, if you use Kadr's page |
| `kadr\dictionary.txt`, `kadr\styles.json`, `kadr\settings.json` | Your own word fixes, caption styles and Kadr settings | Yes, if you changed them |
| `kadr\models\` | Speech and translation models (2–5 GB, depending on which were used) | No. They download again by themselves if lost |
| `kadr\.venv\` | Kadr's private copy of Python (about 2.4 GB) | No. `kadr\StartKadr.bat` rebuilds it |
| `release\` | The built app and the installer | No. Rebuilt with `npm run dist` |
| `node_modules\` | Building blocks the code needs | No. Rebuilt with `npm install` |
| everything else | The code and these documents | No. It is on GitHub |

> `data\` is only used by the desktop app. When the editor runs in a browser (`npm run dev`), projects are kept in that browser's own storage instead.

## How to back up your work

1. Close Framewright.
2. Copy the `data` folder (and `kadr\jobs` if you use Kadr's page) to a USB drive or cloud folder.

To restore: close Framewright, put the copied `data` folder back into the Framewright folder, and open Framewright again.

> The `data` folder only makes sense to Framewright. You cannot open the videos inside it directly; they are stored in the app's own database. To get a finished video out, use **Export** in the editor.

## What is never put on GitHub

The repository holds the code and documents only, never your videos, projects or the big models. These are left out by `.gitignore`:

- `data/`
- `kadr/jobs/`
- `kadr/models/`
- `kadr/.venv/`
- `release/`, `dist/`
- `node_modules/`

## Rules that keep things from disappearing

- **Do not move or rename the Framewright folder once you use it.** The editor finds Kadr and your `data` folder relative to it, and any shortcuts you made point at it. If it must move, move the whole folder and fix the shortcuts.
- **Do not delete `data\`.** Deleting a project inside the editor asks first; deleting the folder does not.
- **Close Framewright before copying `data\`**, so you never copy a half-written file.
- **Nothing is ever uploaded.** Captions, translation and export all run on this computer.

## Shortcuts (optional)

You can make desktop shortcuts to these two files:

| File | Opens |
| --- | --- |
| `release\win-unpacked\Framewright.exe` | The editor (it starts Kadr for you when needed) |
| `kadr\StartKadr.bat` | Kadr's own page in your browser |
