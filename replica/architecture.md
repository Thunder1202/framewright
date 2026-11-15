# Architecture: Framewright (working name)

A local-first video editor. Built from `recon.md` and `features.csv`.

The replica-architect template assumes a hosted app with a database, auth, payments
and an HTTP API. None of that applies here: one user, one machine, nothing leaves it.
The "schema" is a typed project document and the "API" is a set of pure functions.

## Stack

| layer | choice | why |
| --- | --- | --- |
| app | Vite + React + TypeScript | no server needed, so no Next.js; fast dev loop |
| state | Zustand | one store, cheap snapshots for undo |
| styling | plain CSS with tokens from replica-design | small surface, no build plugin |
| storage | IndexedDB (idb-keyval) | holds project JSON and the imported media blobs locally |
| preview | Canvas 2D + pooled `<video>` / `<audio>` elements + Web Audio gains | hardware decode for free, simple compositing |
| export | WebCodecs `VideoEncoder` / `AudioEncoder` + `mp4-muxer`, audio mixed in `OfflineAudioContext` | a real MP4 (H.264 + AAC), frame-accurate, no upload |
| tests | Vitest on the timeline maths | the part where bugs are silent |
| desktop | Electron wrapping the same build | ships its own Chromium, so WebCodecs is guaranteed; no Rust toolchain needed on Windows |

No backend, no accounts, no analytics, no network calls at runtime.

## Project document (replaces schema.sql)

Defined in `src/types.ts`.

```
Project   id, name, width, height, fps, tracks[], assets[], createdAt, updatedAt
Asset     id, kind (video|image|audio), name, duration, width, height, hasAudio
          blob stored separately under key  media:<assetId>
Track     id, kind (visual|audio), muted, hidden, locked, clips[]
Clip      id, kind (video|image|text|audio), assetId?, start, duration,
          offset (seconds into the source), speed, volume, muted, fadeIn, fadeOut,
          x, y, scale, rotation, opacity, flipH,
          adjust {brightness, contrast, saturation, hue, blur, temperature, vignette},
          filter, text {...}, animIn, animOut, transition
```

Rules enforced in `src/lib/timeline.ts`, not in the UI:
- clips on one track never overlap; a move that would overlap is pushed to the next free gap
- `offset + duration * speed` never runs past the source length (video and audio)
- a clip is never shorter than one frame
- all times are seconds as floats, snapped to the frame grid on write

Storage keys: `projects` (index), `project:<id>` (document), `media:<assetId>` (blob), `thumb:<assetId>`.

## Modules (replaces the API table)

| module | does | flows |
| --- | --- | --- |
| `lib/timeline.ts` | split, move, trim, ripple delete, snap, duplicate, free-gap search, silence ranges to cuts | F01 F06 |
| `lib/media.ts` | import, probe duration and size, thumbnails, waveform peaks, object URLs | F01 F05 |
| `lib/filters.ts` | filter presets and adjust values to a canvas filter string | F03 |
| `engine/compose.ts` | draw one frame at time t: layers, transforms, text, animations, transitions | all |
| `engine/player.ts` | realtime playback: element pool, drift correction, gains and fades | F01 |
| `engine/export.ts` | offline render to MP4, PNG still | F01 |
| `store.ts` | project state, selection, playhead, undo history, autosave | F08 |

The preview and the export both call `compose.drawFrame`, so what you see is what renders.

## The parts that bite

- **Sync.** Media elements drift. The player re-seeks any element more than ~0.15 s off, and the timeline clock is the audio context clock while playing.
- **Seeking cost in export.** Each frame seeks every active video and waits for `seeked`. Correct but slower than realtime on long 4K timelines.
- **Codec support.** Import handles whatever the browser can decode (MP4/H.264, WebM, MOV with H.264, MP3, WAV, AAC, PNG, JPG, WebP). HEVC and ProRes depend on the machine. Unsupported files are rejected with a message, not silently broken.
- **Memory.** Audio is fully decoded for waveforms and export mixing. Hour-long sources will be heavy.
- **Storage quota.** Media is copied into IndexedDB so projects survive a restart. The browser can evict it under disk pressure unless persistence is granted; the app asks for it.
- **Autoplay policy.** Audio starts only after a user gesture; the first Play click resumes the audio context.

## Better than the original (design goals)

1. No sign-in, no watermark, no paid tier, no upload. Opens straight into the editor.
2. Export up to 4K at 60 fps with no gate.
3. Works offline; files never leave the machine.
4. Ripple delete and keyboard-first editing (J K L, S, Q, W, arrows) by default.
5. Remove silences: one click cuts the dead air out of a clip.
6. Autosave on every change, with full undo.

## Build order

1. **Vertical slice**: import a video, put it on the timeline, play it, export an MP4. (S02 S03 S08 S10 S11)
2. **Musts**: projects and autosave, multi-track, move/trim/split/delete/ripple, snap, zoom, undo, aspect presets, canvas transform, text, filters, adjust, volume and fades, speed.
3. **Shoulds**: transitions, in/out animations, waveforms, voiceover, detach audio, freeze frame, duplicate/copy/paste, track mute/lock/hide, shortcuts sheet, still export.
4. **Desktop**: Electron wrapper and a Windows installer.

Deferred: keyframes, crop, speed curves, reverse, chroma key, masks, stabilisation, markers, compound clips, SRT import.

## Risk

1. Export correctness across codecs and machines.
2. Preview sync with several video layers.
3. Timeline interaction edge cases.
