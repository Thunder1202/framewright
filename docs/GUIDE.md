<!-- Made by `npm run docs` from src/guide.ts and src/shortcuts.ts. Edit that file, not this one. -->

# Framewright guide

Everything the editor can do, in plain words. The same text is inside the app: press **F1** or the **Guide** button at the top right, and search it.

## Contents

- **[Start here](#start-here)**: [Make a video in five steps](#make-a-video-in-five-steps) · [Select, move and trim clips](#select-move-and-trim-clips) · [Undo anything](#undo-anything)
- **[Cutting](#cutting)**: [Split and delete](#split-and-delete) · [Remove silences](#remove-silences) · [Group clips into one](#group-clips-into-one) · [Markers](#markers) · [Freeze a frame](#freeze-a-frame)
- **[Picture](#picture)**: [Size, position and rotation](#size-position-and-rotation) · [Animate with keyframes](#animate-with-keyframes) · [Crop](#crop) · [Mask](#mask) · [Colour, filters and blur](#colour-filters-and-blur) · [Green screen](#green-screen) · [Blend modes](#blend-modes) · [Steady a shaky shot](#steady-a-shaky-shot)
- **[Time](#time)**: [Speed up or slow down](#speed-up-or-slow-down) · [Speed shapes](#speed-shapes) · [Play backwards](#play-backwards) · [Transitions between clips](#transitions-between-clips) · [Arrive and leave animations](#arrive-and-leave-animations)
- **[Text and sound](#text-and-sound)**: [Add text](#add-text) · [Captions from speech](#captions-from-speech) · [Uzbek Latin and Cyrillic](#uzbek-latin-and-cyrillic) · [Translate captions](#translate-captions) · [Save captions as a subtitle file](#save-captions-as-a-subtitle-file) · [Kadr: the captions engine on its own](#kadr-the-captions-engine-on-its-own) · [Import subtitles](#import-subtitles) · [Volume, mute and fades](#volume-mute-and-fades) · [Detach the sound from a video](#detach-the-sound-from-a-video) · [Record a voiceover](#record-a-voiceover)
- **[Finishing](#finishing)**: [Canvas size and shape](#canvas-size-and-shape) · [Export the video](#export-the-video) · [Export only the sound](#export-only-the-sound)
- **[Keyboard shortcuts](#keyboard-shortcuts)**

## Start here

### Make a video in five steps

The whole loop, start to finish.

**Where:** The four areas: files on the left, picture in the middle, settings on the right, timeline along the bottom.

1. Drag video, picture or sound files anywhere onto the window.
2. Click a file on the left to put it on the timeline.
3. Move the playhead and press S to cut. Select a piece and press Delete to remove it.
4. Select a clip and change it with the tabs on the right.
5. Press Export at the top right and save the MP4.

> Everything is saved on this computer as you go. Nothing is uploaded.

### Select, move and trim clips

Arrange what plays when.

**Where:** Timeline.

1. Click a clip to select it. Ctrl-click to select several.
2. Drag a clip sideways to move it, or up and down to change layer.
3. Drag either end of a clip to make it shorter or longer.
4. Q and W trim the selected clip to the playhead from the start or the end.

> Clips snap to each other and to markers. Hold Alt while dragging to turn that off, or press N.

### Undo anything

Every change can be taken back.

**Where:** The two arrows at the left of the timeline toolbar.

1. Ctrl + Z undoes.
2. Ctrl + Y does it again.

## Cutting

### Split and delete

Cut a clip in two and remove parts.

**Where:** Timeline toolbar: the scissors and the two bins.

1. Put the playhead where the cut should be and press S.
2. Select the part you do not want.
3. Delete leaves a gap. Shift + Delete closes the gap.

### Remove silences

Cuts the quiet stretches out of a talking clip in one go.

**Where:** Timeline toolbar: Remove silences.

1. Select one clip that has sound.
2. Press Remove silences.
3. The clip is replaced by the spoken pieces, closed up.

> Do this before reversing or speed-shaping the clip.

### Group clips into one

Turns several clips into a single clip, so they move together and one effect covers them all.

**Where:** Timeline toolbar: Group and Break apart.

1. Select the clips (Ctrl-click, or Ctrl + A for all).
2. Press Group, or Ctrl + G.
3. The group now takes speed, fades, filters, masks, keyframes and transitions like any clip.
4. To change what is inside, select it and press Break apart (Ctrl + Shift + G), edit, then group again.

> Break apart drops the settings that were on the group itself. A group must be at normal speed and forwards before it can be broken apart.

### Markers

Flags on the ruler to remember a moment, such as a beat in the music.

**Where:** Timeline toolbar: Marker.

1. Shift + M adds or removes a marker at the playhead.
2. [ and ] jump to the previous and next marker.
3. Clips snap to markers when dragged.

### Freeze a frame

Holds the picture under the playhead for two seconds.

**Where:** Timeline toolbar: Freeze.

1. Select one video clip.
2. Put the playhead on the frame to hold.
3. Press Freeze.

## Picture

### Size, position and rotation

Place a clip on the canvas.

**Where:** Drag it in the preview, or right panel: Layout.

1. Select the clip.
2. Drag it in the preview, or drag a corner to resize.
3. Or type exact numbers in Layout.

### Animate with keyframes

Makes size, position, rotation or opacity change over time.

**Where:** Right panel: Layout. The diamond beside each setting.

1. Put the playhead where the move should begin and click the diamond.
2. Move the playhead to where it should end.
3. Change the value. A second keyframe appears, and the clip glides between them.

> Click a lit diamond to remove that keyframe. Dots on the clip show where they are.

### Crop

Trims the edges off a picture or video.

**Where:** Right panel: Layout, Crop.

1. Select the clip.
2. Drag Left, Right, Top or Bottom.

### Mask

Shows only an oval or rectangle of the clip.

**Where:** Right panel: Layout, Mask.

1. Choose Oval or Rectangle.
2. Set its size and position.
3. Soft edge blurs the border. The checkbox shows the outside instead.

### Colour, filters and blur

Changes how the picture looks.

**Where:** Right panel: Adjust. Ready-made looks are in the left panel: Looks.

1. Select the clip.
2. Drag the sliders, or click a look.
3. Reset look puts it back.

### Green screen

Makes one colour see-through so the layer below shows.

**Where:** Right panel: Adjust, Green screen.

1. Put the green-screen clip on a layer above the background.
2. Turn Green screen on and pick the colour.
3. Raise Tolerance until the colour is gone, then Softness to tidy the edge.

### Blend modes

Mixes a layer with what is underneath: Screen for light leaks, Multiply for shadows.

**Where:** Right panel: Layout, Blend.

1. Put the clip on a layer above another.
2. Pick a blend.

### Steady a shaky shot

Smooths out hand-held wobble.

**Where:** Right panel: Adjust, Shaky footage.

1. Select a video clip.
2. Press Steady the shot and wait while it is measured.
3. Remove takes it off again.

> It fixes sliding shake, not twisting, and zooms in a little to hide the edges. Works on up to two minutes of a clip.

## Time

### Speed up or slow down

Changes how fast a clip plays.

**Where:** Right panel: Speed.

1. Select the clip.
2. Pick a speed, or drag the slider.

> Sound follows the speed, so faster is higher pitched.

### Speed shapes

Speed that changes during the clip, such as slow then fast.

**Where:** Right panel: Speed, Speed shape.

1. Select the clip.
2. Pick a shape. The clip keeps its length.

> Splitting a shaped clip turns each half into a steady-speed clip.

### Play backwards

Reverses a clip.

**Where:** Right panel: Speed, Play backwards.

1. Select the clip.
2. Tick Play backwards.

> Backwards sound is silent in the preview but is in the exported file.

### Transitions between clips

A fade, slide or wipe from one clip into the next.

**Where:** Left panel: Transitions.

1. Put two clips end to end on the same layer.
2. Select the second one.
3. Click a transition.

### Arrive and leave animations

How a clip or caption comes on and goes off.

**Where:** Right panel: Motion.

1. Select the clip.
2. Pick an animation for Arrive and for Leave, and how long each takes.

## Text and sound

### Add text

Titles and captions.

**Where:** Left panel: Text.

1. Click a text style.
2. Type in the right panel: Text.
3. Drag it in the preview to place it.

### Captions from speech

Listens to a video and writes its captions for you, in Uzbek, Russian or English. The word being spoken lights up.

**Where:** Left panel: Text, Captions from speech.

1. Select the video clip on the timeline.
2. Pick the language spoken, or Auto for mixed speech. One language is more accurate than Auto.
3. Press Write captions and wait. The captions appear on a new layer above the clip.
4. Read them through and fix mistakes in the right panel: Text.

> Works on videos up to 5 minutes. The first time, a speech model of about 1 GB is downloaded. Names, numbers and speech over music are often misheard. If you change the words of a caption, its word highlighting switches off.

### Uzbek Latin and Cyrillic

Converts text between the two Uzbek alphabets.

**Where:** Left panel: Text. The buttons Lotin → Кирилл and Кирилл → Lotin.

1. Select the text clips to change, or select nothing to change all text.
2. Press the direction you want.

> A few loan words with ts or a soft sign can come out wrong. Ctrl + Z brings the original back.

### Translate captions

Translates text between English and Russian without the internet.

**Where:** Left panel: Text. The buttons EN → RU and RU → EN.

1. Select the text clips to translate, or select nothing to translate all text.
2. Press the direction you want.

> The first time, a language model of about 200 MB is downloaded. Machine translation is rough, so read every line. Uzbek cannot be translated offline.

### Save captions as a subtitle file

Saves every text clip on the timeline as an .srt file, for uploading beside a video.

**Where:** Left panel: Text, Save as .srt.

1. Press Save as .srt.
2. Choose where to save it.

### Kadr: the captions engine on its own

The engine behind Captions from speech also has its own page, for captioning many videos in a row and burning in its own caption styles.

**Where:** Left panel: Text, Open Kadr. Or double-click StartKadr.bat in the kadr folder.

1. Press Open Kadr. Your browser opens its page.
2. Drop videos on the page and follow its steps.

> Its full guide is the file GUIDE.md in the kadr folder.

### Import subtitles

Turns a subtitle file into timed captions.

**Where:** Left panel: Text, Import subtitles.

1. Press Import subtitles.
2. Choose an .srt or .vtt file.

### Volume, mute and fades

How loud a clip is and how it starts and ends.

**Where:** Right panel: Sound.

1. Select the clip.
2. Set Volume, Fade in and Fade out. M mutes it.

### Detach the sound from a video

Moves a video’s sound onto its own track so it can be cut separately.

**Where:** Timeline toolbar: Detach audio.

1. Select the video clip.
2. Press Detach audio.

### Record a voiceover

Records your microphone straight onto the timeline.

**Where:** Left panel: Audio.

1. Put the playhead where you want to start talking.
2. Press record, speak, and stop.

> The first time, Windows asks for permission to use the microphone.

## Finishing

### Canvas size and shape

Wide for YouTube, tall for phones, square for feeds.

**Where:** Right panel, with nothing selected.

1. Click an empty part of the timeline to clear the selection.
2. Pick a shape and size.

### Export the video

Saves the finished video as an MP4 file.

**Where:** Export, top right. Ctrl + E.

1. Pick the size, frame rate and quality.
2. Press Export and choose where to save.

> Up to 4K at 60 frames a second, with no watermark.

### Export only the sound

Saves the mixed sound of the timeline as a WAV file.

**Where:** Export, then Save as: Sound only.

1. Open Export.
2. Choose Sound only (WAV).
3. Press Export.

## Keyboard shortcuts

| Keys | What it does |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>K / L</kbd> | Pause / play |
| <kbd>J</kbd> | Jump back two seconds |
| <kbd>← / →</kbd> | Step one frame (Shift: one second) |
| <kbd>Home / End</kbd> | Go to start / end |
| <kbd>S</kbd> | Split at the playhead |
| <kbd>Q / W</kbd> | Trim the selected clip’s start / end to the playhead |
| <kbd>Delete</kbd> | Delete the selection |
| <kbd>Shift + Delete</kbd> | Delete and close the gap |
| <kbd>Ctrl + D</kbd> | Duplicate |
| <kbd>Ctrl + G</kbd> | Group the selected clips into one |
| <kbd>Ctrl + Shift + G</kbd> | Break a group apart |
| <kbd>Ctrl + C / V</kbd> | Copy / paste at the playhead |
| <kbd>Ctrl + A</kbd> | Select every clip |
| <kbd>Ctrl + Z / Y</kbd> | Undo / redo |
| <kbd>M</kbd> | Mute the selected clip |
| <kbd>Shift + M</kbd> | Add or remove a marker at the playhead |
| <kbd>[ / ]</kbd> | Go to the previous / next marker |
| <kbd>N</kbd> | Snapping on / off (hold Alt while dragging to bypass) |
| <kbd>+ / −</kbd> | Zoom the timeline (or Ctrl + wheel) |
| <kbd>Ctrl + E</kbd> | Export |
| <kbd>Esc</kbd> | Clear the selection |
| <kbd>F1</kbd> | The guide: how everything works |
| <kbd>?</kbd> | This list |
