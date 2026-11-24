# Framewright

A local-first video editor for Windows (also runs in Chrome or Edge). No accounts, nothing uploaded. A free, offline alternative to the well-known mobile and desktop editors, written clean-room: its own name, palette, copy and code. MIT licensed (`LICENSE`).

This folder holds two programs that work together:

- **Framewright** (everything outside `kadr/`): the editor. TypeScript, React, Electron.
- **Kadr** (`kadr/`): the captions engine. Python. It listens to a video and writes word-timed captions in Uzbek, Russian or English, converts Uzbek between alphabets, translates English and Russian, and can burn styled captions in by itself. Framewright starts it in the background when captions are asked for and talks to it over `http://127.0.0.1:8000`. It also still runs on its own (`kadr/StartKadr.bat`). Its own docs: `kadr/README.md`, `kadr/GUIDE.md`, `kadr/DECISIONS.md`.

Everything lives inside the repository folder on purpose: the code, the built app, Kadr's Python environment and speech models (`kadr/.venv`, `kadr/models`), and the desktop app's saved projects (`data/`). Do not send models, caches or app data to the system drive or the user profile.

Do the whole job: make the change, test it, rebuild the app, and report in plain words what works and what was not checked.

## Commands

| What | Command |
| --- | --- |
| Type check | `npx tsc --noEmit -p .` |
| Unit tests | `npx vitest run` |
| Dev server (port 5173) | `npm run dev` (in Claude Code: the `editor` preview from `.claude/launch.json`) |
| Desktop app from the last build | `npm run app` |
| Kadr's tests | `kadr\.venv\Scripts\python.exe -m pytest kadr\tests -q` (run from `kadr/`) |
| Kadr on its own | `kadr\StartKadr.bat`, or `kadr\.venv\Scripts\python.exe run.py` from `kadr/` |
| Regenerate docs/GUIDE.md and docs/FEATURES.md | `npm run docs` |
| Build site + Windows installer | `npm run dist` → `release/Framewright Setup <version>.exe` and `release/win-unpacked/Framewright.exe` |

The app is run as `release/win-unpacked/Framewright.exe` from inside this folder (that is how it finds Kadr and `data/`), so `npm run dist` is what updates it. Close the app before building or the build cannot overwrite it.

## Where things are

```
src/
  types.ts            the whole data model: Project → Track → Clip (+ Asset)
  store.ts            Zustand store; undo is whole-project snapshots (checkpoint / mutate / commit)
  actions.ts          every user action; components call these, never the store directly for edits
  guide.ts            the in-app Guide (F1): one entry per feature, in plain words
  lib/                pure logic, no DOM, unit tested
    timeline.ts         split, trim, snap, ripple, speed
    keyframes.ts        animated position / scale / rotation / opacity
    ramp.ts             speed shapes and reverse: sourcePos(clip, local), rateAt
    compound.ts         groups (a timeline inside a clip): groupClips, ungroupClip, innerTime
    captions.ts         captions from speech: placing heard lines on the timeline, word highlight, fitting, SRT
    kadr.ts             the client for the Kadr engine (start it, transcribe, translate)
    translit.ts         Uzbek Latin <-> Cyrillic; must match kadr/engine/translit.py (cases in translit.cases.ts)
    stabilise.ts        shake measurement and smoothing
    chroma.ts           green screen
    subtitles.ts        SRT / WebVTT parsing
    media.ts, db.ts     importing files, IndexedDB storage (these do touch the browser)
  engine/
    compose.ts          drawFrame: the one renderer, used by both preview and export
    player.ts           realtime preview: pooled <video>/<audio> elements + WebAudio gains
    export.ts           WebCodecs + mp4-muxer video export, offline audio mix, WAV, stills
  components/         React UI: Editor, LeftPanel, Preview, Inspector, Timeline, Dialogs, ui
  styles.css          plain CSS; all colours and sizes are tokens on :root
electron/main.cjs     desktop wrapper; serves dist/ over app://, keeps saved projects in data/, starts and stops Kadr
electron/preload.cjs  the two calls the editor may make to the wrapper (window.framewright)
kadr/                 the captions engine (Python): engine/ does the work, web/ is its own page and API
data/                 the desktop app's saved projects and imported media (not in git)
replica/              specs and history: recon.md, architecture.md, design/, features.csv, build-log.md
```

## Rules

- **Clean room.** Never copy code, assets, icons or wording from another editor. Write labels fresh.
- **Tokens only.** No raw colours or pixel sizes in components. Add a token to `:root` in `styles.css` and to `replica/design/tokens.json`.
- **Old projects must still open.** New fields on `Clip` or `Project` are optional (`field?:`), with a default applied where read.
- **One renderer.** Anything visual goes in `compose.ts` so preview and export cannot drift apart. Anything audible needs both `player.ts` (preview) and `mixAudio` in `export.ts`.
- **Time inside a clip** always goes through `sourcePos` / `sourceTime` (and `innerTime` for groups). Do not compute `offset + local * speed` by hand.
- **Edits go through `actions.ts`** using `commit` (one undo step) or `checkpoint` + `mutate` (dragging).
- **Never commit** `data/`, `kadr/jobs/`, `kadr/models/`, `kadr/.venv/`, `release/`: they are users' videos, multi-gigabyte models and builds. The `.gitignore` files already cover them.
- **Kadr changes stay additive.** Kadr must keep working on its own; do not remove or rename what its page uses.
- **Two converters, one behaviour.** If `kadr/engine/translit.py` changes, change `src/lib/translit.ts` the same way and regenerate `src/lib/translit.cases.ts` from Kadr's tests.
- **Keep the docs true.** `docs/GUIDE.md` and `docs/FEATURES.md` are generated: after changing `src/guide.ts`, `src/shortcuts.ts` or `replica/features.csv`, run `npm run docs` and commit the result. The other files in `docs/` are written by hand for users, in plain words: update `docs/HISTORY.md` (and the others when affected) after each round of work.
- **Keep the Guide true.** When a feature is added, moved or renamed, update its entry in `src/guide.ts`.
- **Plain words in the UI.** Short labels, no jargon, say what a button does in its tooltip.

## Adding a feature: the checklist

1. Data in `types.ts` (optional field), pure logic in `src/lib/` with a `*.test.ts` beside it.
2. Rendering in `compose.ts`; sound in `player.ts` and `export.ts`.
3. An action in `actions.ts`, a control in the right component, a shortcut in `App.tsx` and the list in `Dialogs.tsx` if it deserves one.
4. An entry in `src/guide.ts`.
5. `npx tsc --noEmit -p .` and `npx vitest run` clean.
6. Check it for real in the browser (below).
7. `npm run dist`, then update `replica/features.csv` and add a dated section to `replica/build-log.md` saying what was and was not checked.

## Checking it for real

Rendering bugs do not show up in unit tests. In the dev server page, drive the app's own modules and read pixels:

- `await import('/src/store.ts')`, `'/src/actions.ts'`, `'/src/engine/export.ts'`.
- Make test media in the page: a canvas → PNG `File`, canvas + `MediaRecorder` → WebM `File`, a hand-built WAV. Import with `actions.importFiles([...])`.
- `exportStill(project, t)` gives a PNG of the frame at time `t`; draw it to a canvas and read pixels. `exportAudio(project, () => {})` gives a WAV to decode and measure.
- Restart the dev server before this kind of test. After hot reloads, `import('/src/store.ts')` can return a second copy of the store with no project in it.
- Long checks: start them as a promise that stores its result on `window`, then poll. A single script call times out after about 45 seconds.
- Do not call anything that triggers a file download.

## Git and GitHub

Repository: `origin` on GitHub (see `git remote -v`). Kadr's earlier history is merged in under `kadr/`. Commit after each finished piece of work and push; never commit the folders listed under Rules, secrets or `.env` files.

## Known limits (see `replica/build-log.md` for the full list)

- Reversed clips are silent in the preview (the export has the sound).
- Splitting a speed-shaped clip flattens each half to a steady speed.
- Stabilising handles sliding shake only, up to 120 s of a clip.
- Captions from speech need the desktop app opened from this folder (or Kadr started by hand), handle videos up to 5 minutes, and only video clips, not sound-only clips. Editing a caption's words switches its word highlighting off.
- A group cannot be opened and edited in place: break it apart, edit, group again. Breaking apart drops settings that were on the group itself.
- Blend modes on a clip inside a group only blend with the other clips in that group.
- Pointer drags on the timeline and the on-canvas handles have never been tested by automation.
- The installer is unsigned and uses the default icon.

## Environment notes

Windows, Git Bash and PowerShell. The only Python is Kadr's own, at `kadr\.venv\Scripts\python.exe` (if the folder has been moved since the venv was made, its launchers such as `pip.exe` break; use `python.exe -m pip`). Shell heredocs mangle backslashes and backticks here: write scripts to a file with the editor tools and run them with `node`.
