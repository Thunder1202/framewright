# Framewright

A local-first video editor for Windows (also runs in Chrome or Edge). Personal use, no accounts, nothing uploaded. Modelled on the editing loop of a well-known mobile and desktop editor, but written clean-room: its own name, palette, copy and code.

The owner is not a programmer. Do the whole job yourself: make the change, test it, rebuild the installer, and report in plain words what works and what was not checked. Do not hand back steps for the owner to carry out unless only they can do it.

## Commands

| What | Command |
| --- | --- |
| Type check | `npx tsc --noEmit -p .` |
| Unit tests | `npx vitest run` |
| Dev server (port 5173) | `npm run dev` (in Claude Code: the `editor` preview from `.claude/launch.json`) |
| Desktop app from the last build | `npm run app` |
| Build site + Windows installer | `npm run dist` → `release/Framewright Setup <version>.exe` and `release/win-unpacked/Framewright.exe` |

The desktop shortcut "Framewright" points at `release/win-unpacked/Framewright.exe`, so `npm run dist` is what updates the app the owner opens. Close the app before building or the build cannot overwrite it.

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
electron/main.cjs     desktop wrapper; serves dist/ over app://
replica/              specs and history: recon.md, architecture.md, design/, features.csv, build-log.md
```

## Rules

- **Clean room.** Never copy code, assets, icons or wording from another editor. Write labels fresh.
- **Tokens only.** No raw colours or pixel sizes in components. Add a token to `:root` in `styles.css` and to `replica/design/tokens.json`.
- **Old projects must still open.** New fields on `Clip` or `Project` are optional (`field?:`), with a default applied where read.
- **One renderer.** Anything visual goes in `compose.ts` so preview and export cannot drift apart. Anything audible needs both `player.ts` (preview) and `mixAudio` in `export.ts`.
- **Time inside a clip** always goes through `sourcePos` / `sourceTime` (and `innerTime` for groups). Do not compute `offset + local * speed` by hand.
- **Edits go through `actions.ts`** using `commit` (one undo step) or `checkpoint` + `mutate` (dragging).
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

## Known limits (see `replica/build-log.md` for the full list)

- Reversed clips are silent in the preview (the export has the sound).
- Splitting a speed-shaped clip flattens each half to a steady speed.
- Stabilising handles sliding shake only, up to 120 s of a clip.
- A group cannot be opened and edited in place: break it apart, edit, group again. Breaking apart drops settings that were on the group itself.
- Blend modes on a clip inside a group only blend with the other clips in that group.
- Pointer drags on the timeline and the on-canvas handles have never been tested by automation.
- The installer is unsigned and uses the default icon.

## Environment notes

Windows, Git Bash and PowerShell, no Python, not a git repository. Shell heredocs mangle backslashes and backticks here: write scripts to a file with the editor tools and run them with `node`.
