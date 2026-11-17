<!-- Made by `npm run docs` from replica/features.csv. Edit that file, not this one. -->

# What Framewright can do

**47 done, 5 partly done, 6 left out on purpose**, out of 58 features.

How to use each one is in [GUIDE.md](GUIDE.md). What “partly” means is in the Notes column.

## Projects

| Feature | State | Notes |
| --- | --- | --- |
| Create and name a project | ✅ Done |  |
| Projects list with reopen and delete | ✅ Done |  |
| Autosave and restore a project exactly | ✅ Done | stored locally in the browser |

## Media

| Feature | State | Notes |
| --- | --- | --- |
| Import video image and audio by picker or drag and drop | ✅ Done |  |
| Media thumbnails with duration | ✅ Done |  |

## Timeline

| Feature | State | Notes |
| --- | --- | --- |
| Add media to the timeline by click or drag | ✅ Done |  |
| Multiple video tracks layered | ✅ Done |  |
| Separate audio tracks | ✅ Done |  |
| Move clips along and between tracks | ✅ Done |  |
| Trim clip start and end by dragging edges | ✅ Done |  |
| Split at playhead | ✅ Done |  |
| Delete and ripple delete | ✅ Done |  |
| Snapping to clips and playhead | ✅ Done |  |
| Timeline zoom and scroll | ✅ Done |  |
| Undo and redo | ✅ Done |  |
| Freeze frame | ✅ Done |  |
| Duplicate copy and paste clips | ✅ Done |  |
| Track mute lock and hide | ✅ Done |  |
| Markers on the timeline | ✅ Done | unnamed; Shift+M and [ ] |
| Compound clips | 🟡 Partly | group and break apart; a group takes speed reverse effects and keyframes; cannot be opened and edited in place |

## Preview

| Feature | State | Notes |
| --- | --- | --- |
| Preview with play pause and scrub | ✅ Done |  |
| Canvas aspect ratio presets (16:9 9:16 1:1 4:5) | ✅ Done |  |
| Move scale and rotate a clip on the canvas | ✅ Done |  |
| Crop a clip | ✅ Done | edge sliders in the inspector; no on-canvas crop handles |

## Text and captions

| Feature | State | Notes |
| --- | --- | --- |
| Text clips with font size colour stroke and background | ✅ Done |  |
| Subtitle file import (SRT) | ✅ Done | SRT and WebVTT |
| Auto captions from speech | ✅ Done | see Captions from speech below |
| Captions from speech (Uzbek / Russian / English) | ✅ Done | through the kadr engine; spoken word lights up; videos up to 5 minutes |
| Uzbek Latin and Cyrillic conversion | ✅ Done | same rules as the kadr engine |
| Translate captions (English and Russian) | ✅ Done | offline through the kadr engine; rough |
| Save captions as .srt | ✅ Done | every text clip on the timeline |

## Effects

| Feature | State | Notes |
| --- | --- | --- |
| Filters (preset looks) | ✅ Done |  |
| Adjustments (brightness contrast saturation and more) | ✅ Done |  |
| Transitions between adjacent clips | ✅ Done |  |
| Clip opacity and blend | ✅ Done |  |
| Chroma key (green screen) | ✅ Done |  |
| Masks | 🟡 Partly | oval and rectangle with soft edge and invert; no freehand or animated masks |
| Stabilisation | 🟡 Partly | removes sliding shake only; not rotation or rolling shutter |

## Sound

| Feature | State | Notes |
| --- | --- | --- |
| Clip volume mute and fades | ✅ Done |  |
| Audio waveforms on the timeline | ✅ Done |  |
| Record a voiceover | ✅ Done |  |
| Detach audio from a video clip | ✅ Done |  |

## Speed

| Feature | State | Notes |
| --- | --- | --- |
| Clip speed change | ✅ Done |  |
| Speed curves (ramping) | 🟡 Partly | four preset shapes; no hand-drawn curve |
| Reverse a clip | 🟡 Partly | picture and exported sound are reversed; preview sound is silent |

## Export

| Feature | State | Notes |
| --- | --- | --- |
| Export to a video file with resolution and frame rate choice | ✅ Done |  |
| Export a still frame | ✅ Done |  |
| Export sound only (WAV) | ✅ Done | not in the original map; added here |

## Animation

| Feature | State | Notes |
| --- | --- | --- |
| In and out animations for clips and text | ✅ Done |  |
| Keyframes on transform and opacity | ✅ Done | position scale rotation and opacity; smooth easing only |

## The window

| Feature | State | Notes |
| --- | --- | --- |
| Keyboard shortcuts with a cheat sheet | ✅ Done |  |
| Resizable panes | ✅ Done |  |

## Left out on purpose

These need an online service, a paid catalogue or someone else’s servers, which goes against “everything stays on this computer”.

| Feature | Why |
| --- | --- |
| Licensed music and sound effect library | licensed catalogue; bring your own files |
| Stock video stickers and templates | their content library and creator marketplace |
| Cloud storage and team spaces | single user and local only by design |
| Publish directly to social platforms | needs partner API access |
| AI background removal and avatars | server-side models |
| Text to speech voices | licensed voices |
