# How Framewright works

A plain-words tour of the parts, for when you want to understand what happens behind the buttons. You do not need any of this to use the program.

## Two programs in one folder

```
Framewright (the editor)  ── asks for captions ──▶  Kadr (the captions engine)
  what you see and click                                  listens to speech, writes words,
  cuts, effects, export                                   converts alphabets, translates
  TypeScript + React + Electron                           Python + Whisper speech models
```

- **Framewright** is everything you see: the timeline, the preview, the settings, export. It is written in TypeScript (the language of web pages) and wrapped as a Windows app with Electron, which is a browser engine packaged as a program.
- **Kadr** is the part that understands speech. It is a separate Python program in the `kadr` folder. Framewright starts it in the background when you press **Write captions** and stops it when you close the editor. Kadr also works on its own, with its own page ([Kadr's guide](../kadr/GUIDE.md)).

The two talk to each other over an address that only exists inside your computer (`127.0.0.1:8000`). Nothing goes onto the internet.

## What happens when you…

### …import a file

The file is copied into the editor's own database in the `data` folder, with a small thumbnail and, for sound, a waveform. The original file on your disk is never changed, and the editor no longer needs it.

### …edit

Every clip is a small description:

- which file it comes from;
- where it starts on the timeline and how long it is;
- its size, position, colour settings, speed and effects.

Editing changes only these descriptions, never the video file itself. That is why everything can be undone: before each change the whole project is remembered, and **Ctrl + Z** goes back to it. The project is saved to the `data` folder a moment after every change.

### …play

The preview takes one video player per clip near the playhead and keeps each one in step with the timeline clock. About sixty times a second it paints every visible layer onto the preview picture, bottom layer first, with effects, masks, green screen, blend and captions applied.

### …export

The **same painting code** draws every frame again at full size, one frame at a time, waiting until each video is exactly on the right frame. The frames go to the computer's video encoder and become an MP4. Sound is mixed separately, every clip with its own volume, fades and speed, and added to the file. Because preview and export share one painter, what you see is what you get.

### …press Write captions

1. Framewright starts Kadr if it is not running yet (about 2 seconds, plus loading the speech model the first time).
2. It hands Kadr the clip's video file.
3. Kadr pulls out the sound and runs a **Whisper** speech model on it:
   - Uzbek speech goes to a model trained on Uzbek;
   - Russian and English go to the standard one;
   - in Auto mode, each stretch of speech gets its language decided separately.
4. Kadr returns lines of text with the exact time of every word.
5. Framewright places them on a new layer:
   - it works out where each line falls in the clip, allowing for any trimming and speed change;
   - it breaks long lines into two rows so they stay inside the picture.

   The word times are kept, which is how the spoken word lights up.
6. Kadr's temporary copy of the video is deleted.

If you change the words of a caption, the word times no longer match, so that caption stops highlighting. It still shows normally.

### …convert Uzbek Latin ↔ Cyrillic

This runs inside the editor itself, with the same rules as Kadr. The editor's tests check it against all of Kadr's own examples. A short exception list handles loan words such as *sentyabr → сентябрь*.

### …translate English ↔ Russian

The text is sent to Kadr, which uses a small offline translation model (Argos Translate). The first time, the model downloads (about 200 MB per direction).

## Where the code is

| Part | File |
| --- | --- |
| The data a project is made of | `src/types.ts` |
| Every action a button can trigger | `src/actions.ts` |
| The painter (preview and export) | `src/engine/compose.ts` |
| Live playback | `src/engine/player.ts` |
| Export to MP4 and WAV | `src/engine/export.ts` |
| Captions placement, highlighting, SRT | `src/lib/captions.ts` |
| Talking to Kadr | `src/lib/kadr.ts` |
| Uzbek alphabets | `src/lib/translit.ts` |
| The in-app guide text | `src/guide.ts` |
| The desktop wrapper (starts Kadr, keeps data on D) | `electron/main.cjs` |
| Kadr's speech recognition | `kadr/engine/transcribe.py` |
| Kadr's own page and its connection point | `kadr/web/app.py` |

The full map for programmers and AI helpers is in [CLAUDE.md](../CLAUDE.md). Why Kadr was built the way it was, with its accuracy measurements, is in [kadr/DECISIONS.md](../kadr/DECISIONS.md).

## How it is checked

- **Unit tests** check the maths and the rules: timeline editing, keyframes, speed shapes, groups, caption placement, the alphabet converter. Run `npm test` for the editor and Kadr's tests from the `kadr` folder.
- **Rendered-frame checks**: before a change is called done, an AI helper renders real frames and reads the pixel colours to confirm the picture is right.
- **The build log** ([replica/build-log.md](../replica/build-log.md)) records each round of work: what was checked, how, and what was not.
