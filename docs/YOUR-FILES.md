# Where your files are, and how to keep them safe

Everything lives in one folder on drive D: **`the Framewright folder`**. Nothing of this program is on drive C any more, apart from the two icons on your desktop.

## The folders that matter to you

| Folder | What is in it | Back it up? |
| --- | --- | --- |
| `data\` | **Your projects and every video, picture and sound you imported into the editor.** This is your work. | **Yes. This is the one that matters.** |
| `kadr\jobs\` | Videos you captioned in Kadr's own page, with their captions | Yes, if you use Kadr's page |
| `kadr\dictionary.txt`, `kadr\styles.json`, `kadr\settings.json` | Your own word fixes, caption styles and Kadr settings | Yes, if you changed them (they are also on GitHub) |
| `kadr\models\` | Speech and translation models (about 4.7 GB) | No. They download again by themselves if lost |
| `kadr\.venv\` | Kadr's private copy of Python (about 2.4 GB) | No. `StartKadr.bat` rebuilds it |
| `release\` | The built app the desktop icon opens, and the installer | No. Rebuilt from the code |
| `node_modules\` | Building blocks the code needs | No. Rebuilt from the code |
| everything else | The code and these documents | Already safe on GitHub |

## How to back up your work

1. Close Framewright.
2. Copy the `data` folder (and `kadr\jobs` if you use Kadr's page) to a USB drive or cloud folder.

To restore: close Framewright, put the copied `data` folder back into `the Framewright folder`, and open Framewright again.

> The `data` folder only makes sense to Framewright. You cannot open the videos inside it directly; they are stored in the app's own database. To get a finished video out, use **Export** in the editor.

## The code is on GitHub

Private repository: <https://github.com/Thunder1202/framewright> (only you can see it). It holds the code and documents, never your videos, projects or the big models. These are deliberately left out:

- `data/`
- `kadr/jobs/`
- `kadr/models/`
- `kadr/.venv/`
- `release/`
- `node_modules/`

## Rules that keep things from disappearing

- **Do not move or rename `the Framewright folder`.** The desktop icons point at it, and the editor finds Kadr and your `data` folder relative to it. If it must move, ask an AI helper to move it and fix the icons.
- **Do not delete `data\`.** Deleting a project inside the editor asks first; deleting the folder does not.
- **Close Framewright before copying `data\`**, so you never copy a half-written file.
- **Nothing is ever uploaded.** Captions, translation and export all run on this computer.

## The two desktop icons

| Icon | Opens |
| --- | --- |
| **Framewright** | `the Framewright folder\release\win-unpacked\Framewright.exe`: the editor (it starts Kadr for you when needed) |
| **Kadr captions** | `the Framewright folder\kadr\StartKadr.bat`: Kadr's own page in your browser |

## Left over on drive C (safe to delete when you like)

| What | Size | Why it is there |
| --- | --- | --- |
| `MOVED.txt in the old folder` | tiny | A note saying where the program went |
| `an old copy of Kadr` | 0.15 GB | An old, incomplete copy of Kadr (no code inside) |
| `the old app-data folder` | 7 MB | The editor's data from before the move. The `data` folder on D has a copy of it |
