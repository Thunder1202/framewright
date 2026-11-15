# Recon map: CapCut (web editor, then desktop)

Scope: the core editing loop only: import media, arrange on a multi-track timeline, trim and split, text, filters and adjustments, transitions, audio, export a video file.
For: personal use by the project owner. One user, one machine, no accounts.
Date: 2026-11-15

Note on evidence: this map is written from general knowledge of the public product
(its marketing site, help center and store listings). None of the pages below were
re-read during this session, no account was used, and no app code or network traffic
was inspected. No reference screenshots were taken, so `replica/screens/` is empty.
Anything marked "guess" should be treated as one.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing site | https://www.capcut.com | positioning, the core loop in their words |
| 2 | web editor landing | https://www.capcut.com/tools/online-video-editor | feature list for the browser editor |
| 3 | help center | https://www.capcut.com/help | per-feature articles, export settings |
| 4 | pricing | https://www.capcut.com/pricing | what is gated behind Pro (signals what users value) |
| 5 | Microsoft Store listing | https://apps.microsoft.com | desktop screenshots, pitch |
| 6 | public walkthrough videos | YouTube search "capcut pc tutorial" | flows, click by click |

Terms note: the product's terms restrict using the service to build a competing
product. This build uses public knowledge only, is for personal use, and takes
no assets, templates, code, names or visual identity from the original.

## Core loop

Drop clips in, cut them on a timeline, dress them with text, filters, transitions and sound, export a finished video.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Home / projects | app start | pick or create a project | project cards, new-project button | empty, filled |
| S02 | Editor shell | open a project | the whole workspace | top bar, 4 panes, resizable splitters | empty project, filled |
| S03 | Media panel | left pane, Media tab | import and hold source files | drop zone, thumbnails, duration badge, add-to-timeline | empty, importing, filled, unsupported file |
| S04 | Text panel | left pane, Text tab | add titles and captions | preset list, add button | filled |
| S05 | Audio panel | left pane, Audio tab | add music, sounds, voiceover | file list, record button | empty, filled, recording, mic denied |
| S06 | Effects / filters panel | left pane, Filters tab | pick a look | filter swatches | filled |
| S07 | Transitions panel | left pane, Transitions tab | pick a transition | transition tiles | filled |
| S08 | Preview player | centre pane | see the result | canvas, play/pause, timecode, aspect picker, fullscreen, on-canvas transform handles | empty, playing, paused, buffering |
| S09 | Inspector | right pane | edit the selected clip | tabs: video, audio, speed, animation, adjust; sliders, number inputs | nothing selected, video, image, text, audio |
| S10 | Timeline | bottom pane | arrange and cut | ruler, playhead, tracks, clips, toolbar (split, delete, undo, redo, snap, zoom) | empty, filled, dragging, trimming |
| S11 | Export dialog | top bar, Export | render a file | name, resolution, frame rate, quality, format, progress bar | idle, rendering, done, failed |
| S12 | Shortcuts sheet | menu / ? | list keyboard shortcuts | table | filled |

## Flows

```
F01 Make a simple cut and export it
    S01 -> S02 -> S03 import -> S10 drag to timeline -> split, delete -> S11 export
    happy path clicks: about 9 (new project, import, pick file, add to timeline,
      move playhead, split, select, delete, export, confirm)
    edge: unsupported codec, very long file, no audio track, export cancelled

F02 Add a title
    S04 pick preset -> S10 text clip appears -> S08 drag on canvas -> S09 edit text, font, colour
    happy path clicks: 4
    edge: empty text, text off canvas, very long text

F03 Grade a clip
    S10 select clip -> S09 Adjust tab -> sliders, or S06 pick a filter
    happy path clicks: 3
    edge: reset to default, filter on an image

F04 Add a transition between two clips
    S07 pick -> drag onto a cut on S10 -> S09 set duration
    happy path clicks: 3
    edge: clips too short, clips not adjacent

F05 Add music and balance sound
    S05 import -> S10 audio track -> S09 volume, fade in, fade out, mute original
    happy path clicks: 5
    edge: audio longer than video, clipping

F06 Change speed
    S10 select -> S09 Speed tab -> slider
    happy path clicks: 3
    edge: downstream clips, audio pitch

F07 Reframe for another platform
    S08 aspect picker -> 9:16 -> S09 scale / position per clip
    happy path clicks: 2 plus adjustments

F08 Come back to a project
    S01 -> project card -> S02 restored exactly
    edge: source file moved or missing
```

Number to beat on F01: about 9 clicks, plus a sign-in step in the original.

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, icon, danger | default, hover, focus, active, disabled | all |
| Tab strip | left-pane icons, inspector tabs | default, active | S02, S09 |
| Slider + number | plain, bipolar (centre zero) | default, dragging, disabled | S09, S11 |
| Media thumbnail | video, image, audio | default, hover, selected, loading, error | S03, S05 |
| Swatch tile | filter, transition, text preset | default, hover, applied | S04, S06, S07 |
| Timeline clip | video, image, text, audio | default, selected, dragging, trimming | S10 |
| Playhead | | idle, scrubbing | S10 |
| Transform box | move, scale, rotate handles | idle, dragging | S08 |
| Modal | export, shortcuts, confirm | open, busy | S11, S12 |
| Progress bar | | running, done, failed | S03, S11 |
| Toast | info, error | | all |
| Splitter | horizontal, vertical | idle, dragging | S02 |
| Context menu | clip, track | | S10 |

## Inferred data model

```
Project     id, name, width, height, fps, duration (derived), created_at, updated_at
            evidence: S01 cards, S08 aspect picker, S11 export settings
            confidence: high

Asset       id, project_id, kind (video | image | audio), name, file, duration,
            width, height, thumbnail
            evidence: S03 thumbnails and badges
            confidence: high

Track       id, project_id, kind (video | audio | text), order, muted, locked, hidden
            evidence: S10 track headers
            confidence: high

Clip        id, track_id, asset_id (null for text), start (on timeline),
            in, out (within the source), speed, volume, fade_in, fade_out,
            transform (x, y, scale, rotation, opacity),
            adjust (brightness, contrast, saturation, temperature, ...), filter,
            text (content, font, size, colour, stroke, background, align),
            animation_in, animation_out
            evidence: S09 inspector tabs
            confidence: high for fields, medium for exact grouping

Transition  id, track_id, between (clip_a, clip_b), kind, duration
            evidence: S07, F04
            confidence: medium (may be a property of the later clip)

Keyframe    clip_id, property, time, value, easing
            evidence: diamond buttons beside inspector fields
            confidence: medium
```

Relationships: Project 1-n Asset, Project 1-n Track, Track 1-n Clip, Asset 1-n Clip, Clip 1-n Keyframe.

## Feature matrix

See `features.csv`. Must: 24, should: 14, could: 8, skip: 7.

## Out of scope (cannot or should not be cloned)

- The licensed music and sound-effect catalogue. Bring your own audio files.
- The stock video, sticker, template and font libraries, and the creator marketplace behind them.
- Cloud storage, team spaces, and publishing straight to social accounts.
- Server-side AI features: auto captions from speech, background removal, text-to-speech voices, AI avatars. Some may be possible locally later, none are in this build.
- The original's name, logo, colours, icons and layout specifics. This build has its own.
- The mobile apps.

## Size

Screens 12, flows 8, entities 6.
Hard parts:
1. Frame-accurate preview: compositing several video layers in sync with audio while scrubbing and playing.
2. Export: rendering the timeline to a real MP4 in the browser (WebCodecs encode plus muxing, with audio mixed offline).
3. Timeline interaction: drag, trim, split, snap, ripple, zoom and undo all working together without glitches.
Size: M for the must rows. The should and could rows push it to L.
