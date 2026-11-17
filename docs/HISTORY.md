# How Framewright was built

The story so far, in plain words, newest last. The detailed record, including exactly what was tested each time, is in [replica/build-log.md](../replica/build-log.md).

## Before: two unfinished programs

There were two separate projects on drive C:

- **“Cut and Cap”**, a video editor modelled on how CapCut's editing works but written from scratch: its own name (Framewright), look, wording and code.
- **Kadr**, a Python program that writes captions for short Uzbek, Russian and English videos. It already had its own private GitHub repository.

## Round 1: the editor works end to end

The core loop was built:

1. import files;
2. arrange them on a timeline with layers;
3. cut, trim, move, undo;
4. preview;
5. change colour, text, speed and sound;
6. export a finished MP4.

It was wrapped as a Windows app with an installer. All 24 must-have features were done.

## Round 2: useful extras

- Crop.
- Blend modes.
- Green screen.
- Timeline markers.
- Importing subtitle files.
- Saving just the sound as WAV.

## Round 3: animation and motion

- Keyframes, to make size, position, rotation and opacity change over time.
- Oval and rectangle masks.
- Playing clips backwards.
- Speed shapes (slow-fast-slow and others).
- Steadying shaky footage.

## Round 4: groups, the Guide, and a way in

- **Groups:** several clips turned into one that moves and takes effects as one.
- **The Guide** (F1): 29 short topics in plain words, searchable.
- **CLAUDE.md**, so an AI helper can work on the code.
- **A desktop icon** that opens the app.

## Round 5: mistakes fixed, new look

Clicking through the real buttons found six mistakes:

- Ctrl-click didn't add a clip to the selection.
- With several clips selected, a plain click didn't pick just one.
- Looks (filters) refused groups.
- A group showed no picture on its timeline clip.
- A group's label said "group of 2" twice.
- The left icon buttons had no names for screen readers.

All six were fixed. Then the look was refreshed:

- darker layered panels;
- orange gradient buttons and a round play button;
- rounded clips that glow when selected;
- a spotlight around the preview;
- dialogs that fade in;
- a new home screen.

## Round 6: Kadr joins, everything moves to D, GitHub

- **Fused.** Kadr moved inside Framewright as the `kadr` folder, keeping its full history. Nothing of Kadr was removed: it still runs on its own.
- **New buttons in the editor's Text tab:**
  - **Write captions**, with the spoken word lighting up in yellow;
  - Uzbek **Latin ↔ Cyrillic**;
  - **English ↔ Russian** translation;
  - **Save as .srt**;
  - **Open Kadr**.
- **Caption fit.** Testing found long captions running off the sides of vertical videos; they now break into two rows.
- **Moved to D.** The whole program moved to `the Framewright folder`, including:
  - Kadr's 4.3 GB of speech models, which had been hidden in a cache folder on C;
  - your saved projects, now in `data\`.

  Every file was checked before the old copies on C were removed. C gained about 8.5 GB of free space.
- **GitHub.** Everything went into one private GitHub repository: <https://github.com/Thunder1202/framewright>.

## Round 7: everything written down

These documents:

- [GUIDE.md](GUIDE.md) and [FEATURES.md](FEATURES.md), generated from the app itself so they stay true;
- [HOW-IT-WORKS.md](HOW-IT-WORKS.md);
- [YOUR-FILES.md](YOUR-FILES.md);
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md);
- [WHY-FRAMEWRIGHT.md](WHY-FRAMEWRIGHT.md);
- this history.

Kadr's own guide was updated for its new home.

## Still open

| What | Why it is not done |
| --- | --- |
| Opening a group to edit inside it | Break apart, edit, group again for now |
| Hand-drawn speed curves, freehand or animated masks | Presets and simple shapes only |
| Reversed clips' sound in the preview | The export has it; the preview player cannot play sound backwards |
| Captions from sound-only clips, or videos over 5 minutes | Kadr's limits; split long videos |
| Accuracy on real Uzbek speakers | Never measured; Kadr was only tested on computer voices |
| A proper app icon and a signed installer | Uses the default icon; Windows may warn when installing |
| Pressing Write captions inside the desktop window | Tested in the browser version against the same engine, not clicked in the desktop window |
