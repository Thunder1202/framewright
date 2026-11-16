# Build log: Framewright

Date: 2026-11-15. Typecheck clean, 27 timeline unit tests pass, production build clean.

| ID | screen | status | notes |
| --- | --- | --- | --- |
| S01 | Home / projects | done | empty and filled states; create, reopen, delete. Reopen after reload checked in the browser. |
| S02 | Editor shell | done | four panes, splitters, top bar. Laid out for desktop widths only (min 1024); no phone layout, by design. |
| S03 | Media panel | done | picker and drag-drop import, thumbnails, duration badge. Import of an H.264/AAC MP4 checked. |
| S04 | Text panel | done | presets add a text clip on a new layer. |
| S05 | Audio panel | done, not exercised | voiceover recording is written but was not tested (needs a microphone). |
| S06 | Looks panel | done | filter presets; applied through the same compositor as export. |
| S07 | Transitions panel | done | crossfade applied and stored; the other kinds were not looked at one by one. |
| S08 | Preview player | done | play, pause, timecode, aspect picker. On-canvas transform handles are written but were not dragged in testing. |
| S09 | Inspector | done | layout, adjust, sound, speed, motion tabs. No keyframes, no crop. |
| S10 | Timeline | done | split, ripple delete, undo/redo, duplicate, detach audio, speed change checked through the app's actions. Pointer drag, edge trim and snapping are covered by unit tests on the maths, not by a pointer-driven test. |
| S11 | Export dialog | done | exported a 7.9 s 640x360 MP4 with sound in about 6 s; re-opened it and confirmed frames and audio. The dialog's own download button was not clicked. |
| S12 | Shortcuts sheet | done | not opened in testing. |
| Desktop | Electron wrapper + installer | done | `npm run app` opens the editor; `npm run dist` writes `release/Framewright Setup 0.1.0.exe` (unsigned, default icon). The installer itself was not run. |

## Feature matrix

Must 24 of 24. Should 11 yes, 1 partial (opacity without blend modes), 2 not built (keyframes, crop). Could 0 of 8, all deferred.

## Harder than expected

- Nothing in this pass; the risk list in `architecture.md` still stands. Export has been checked on one machine with one codec only.

## Not done

- No git repository, so no per-screen commits.
- No reference or clone screenshots (`replica/screens/` was never captured), so replica-diff has nothing to compare.
- No pointer-driven end-to-end tests yet; that is the job of replica-test.
- Installer is unsigned: Windows SmartScreen will warn on first run.

## Second pass, 2026-11-15: added features

34 unit tests pass (7 new: subtitle parsing, green screen maths, marker snapping).

| feature | status | checked how |
| --- | --- | --- |
| Crop (left, right, top, bottom sliders) | done | rendered a still with the left half cropped off and read the pixels |
| Blend modes (screen, add, lighten, multiply, darken, overlay) | done | multiply checked by pixel; the other modes were not looked at one by one |
| Green screen | done | green card over a video: backdrop gone, subject kept. Only tried on a flat synthetic green, not on real footage with uneven lighting |
| Timeline markers | done | add, remove and snap checked through the app's actions; the marker buttons on the ruler were seen but not clicked |
| Subtitle import (.srt, .vtt) | done | a two-cue file became two caption clips at the right times. The file picker button itself was not clicked |
| Sound-only export (WAV) | done | produced a valid WAV from the test timeline; the dialog option was seen but the download was not triggered |

Still not built: keyframes, speed curves, reverse, masks, stabilisation, compound clips.
Green screen reads every pixel on the CPU each frame, so a keyed 4K clip will preview slowly; export is unaffected in result, only in time.

## Third pass, 2026-11-15: keyframes and the remaining editing features

50 unit tests pass (16 new: keyframes, ramps, reverse, stabiliser maths).

| feature | status | checked how |
| --- | --- | --- |
| Keyframes (position, scale, rotation, opacity) | done | keyed a picture's position and read rendered pixels at three times; keys survive split, trim and speed change in unit tests. The diamond buttons were seen, not clicked |
| Masks (oval, rectangle, soft edge, invert) | done | rendered and read pixels inside and outside, both ways round |
| Reverse | partial | rendered frames run backwards and a reversed, ramped sound track exports. Preview sound for a reversed clip is silent by design. Preview playback of a reversed clip was not watched: the browser pane was not drawing frames during this pass |
| Speed ramps (4 presets) | partial | rendered frames follow the curve; presets only, no hand-drawn curve |
| Stabilise | partial | on a synthetic clip sliding 8 analysis pixels side to side, the rendered wobble dropped to 1. Sliding shake only; never tried on real hand-held footage |
| Compound clips | not built | would need the renderer, player, exporter and sound mixer to nest timelines |

Known rough edges: splitting a ramped clip turns each half into a steady-speed clip (the cut does not jump, but the ramp shape is gone). A reversed clip's start edge can be trimmed in but not dragged back out. Stabilising is limited to 120 seconds of footage per clip.

## Fourth pass, 2026-11-15: compound clips, the Guide, and a way in

60 unit tests pass (10 new, in src/lib/compound.test.ts).

| item | status | checked how |
| --- | --- | --- |
| Compound clips (Group, Ctrl+G / Break apart, Ctrl+Shift+G) | partial | in the browser: grouped a video and a tone, then read rendered pixels and exported sound. Same pixels as before grouping; at half size the corner is black and the centre is the video; reversed shows the end first; at 2x the group is half as long and its tone is 879 Hz for one second; at half volume the level halves; breaking apart restores the timeline exactly. The toolbar buttons and shortcuts were not pressed, and preview playback of a group was not watched |
| Guide (F1, or Guide at the top) | done | opened and screenshotted; search box not typed into. 29 topics, text in src/guide.ts |
| CLAUDE.md | done | project map, rules, checklist and testing method for an AI working on the code |
| Desktop shortcut "Framewright" | done | created, launched through the shortcut, window came up and responded, closed again. Points at release/win-unpacked/Framewright.exe |

Limits: a group cannot be opened and edited in place (break apart, edit, group again). Breaking apart drops the settings that were on the group itself, and is refused while the group is sped up, shaped or reversed. A blend mode on a clip inside a group only blends with the rest of that group. Groups nest four deep at most.

## Fifth pass, 2026-11-15: mistakes found by clicking, and a design refresh

Mistakes found and fixed (found by clicking the real controls in the browser):

- Ctrl-click did not add a clip to the selection; only Shift-click did, while the Guide said Ctrl-click. Both work now.
- With several clips selected, a plain click on one of them kept all of them selected. It now selects just that one (dragging still moves them all).
- Looks (filters) refused groups. They now apply to groups too.
- A group showed no picture on its timeline clip, and its colour dot in the settings panel was the video colour. It now shows the first picture inside and its own colour.
- A clip named "Group of 2" also had a "group of 2" tag. The tag now only appears on renamed groups.
- The left icon rail buttons had no names for screen readers.

Clicked and confirmed working: Group, Break apart, the keyframe diamond plus typing a value at a new playhead position, Ctrl+E export dialog. No console errors.

Design refresh (styles.css design layer, tokens updated): slightly blue-tinted darker greys with more separation between layers; orange gradient on primary buttons, the play button and the playhead; segmented tab pills in the settings panel; section headings with rules; rounded timeline clips with a light sheen, a glow when selected and grip marks on the trim edges; framed preview with a soft spotlight; blurred backdrop and gentle pop-in for dialogs; pill notices; thin dark scrollbars; home screen with a soft gradient, cards that lift on hover and a "New project" tile. Animations respect the reduced-motion setting.

Not checked: the look inside the packaged desktop app (rebuild was blocked because the app was open), dialog animations (they do not run while the test browser is hidden).

## Sixth pass, 2026-11-15: fused with Kadr, moved to drive D, put on GitHub

Kadr (a separate Python program for automatic captions, found unfinished beside this one) now lives in `kadr/` with its git history, and its features are reachable from the editor. Nothing of Kadr's was removed: its own page, styles, batch mode and tests are all still there.

| item | status | checked how |
| --- | --- | --- |
| Whole program on the Framewright folder | done | copied with robocopy: 8,998 + 11,561 + 27 files, 0 failed; Kadr's 336 tests pass from D using the moved Python environment and the moved speech models |
| Speech models moved out of the user-profile Hugging Face cache (4.3 GB) into kadr/models/hf | done | a caption run from D loaded them without downloading anything |
| Captions from speech in the editor | done | in the browser, with Kadr running from D: a 21 s Russian sample became 9 correct captions in 29 s, each with word times |
| Spoken word lights up | done | rendered frames with the video hidden: the yellow word was in row one at the first word and row two at the last |
| Captions fit the picture | done | found broken by that same test (a line ran off both edges of a vertical video); now long lines break into two balanced rows, text spans 95-446 of 540 pixels |
| Uzbek Latin / Cyrillic | done | the TypeScript port gives the same answer as Kadr on all of Kadr's own test cases; converted a title both ways in the app |
| Translate EN / RU | done | translated the 9 captions RU to EN in 2 s through Kadr; undo restored them |
| Save as .srt | done | unit test: written file reads back the same. The button itself was not pressed (it would start a download) |
| Desktop app keeps projects in data/ and starts Kadr itself | see below | |

75+ checks: 70 editor unit tests and 339 Kadr tests pass.
| Desktop app from D | done | opened release/win-unpacked/Framewright.exe and asked it directly: it listed the project saved before the move (copied from AppData into data/), started Kadr itself in 2.2 s, and Kadr reported the graphics card, 11 styles and both translation directions |
| GitHub | done | private repository Thunder1202/framewright, Kadr's 8 earlier commits included |
| Old copies removed from C | done | after a byte-for-byte check of the 33 job files and a size and date check of everything else: the two project folders and the 4.3 GB speech-model cache. C went from 165.5 GB free to 174 GB |

Not checked: pressing Write captions inside the desktop window itself (the same code was run in the browser against the same engine); captions on real Uzbek speech; the installer. Left alone on purpose: an old partial copy of Kadr, Kadr's older standalone repository, and the 7 MB of pre-move app data in the old app-data folder (a spare copy; the app now uses data/).
