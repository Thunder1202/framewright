/**
 * The in-app guide. One entry per thing the editor can do: what it is for, where
 * it lives, and the steps. Shown by the Guide button (F1) and searchable there.
 * When a feature is added or moved, add or fix its entry here.
 */

export interface Topic {
  title: string;
  /** one sentence: what it is for */
  what: string;
  /** where to find it on screen */
  where: string;
  steps: string[];
  /** worth knowing before relying on it */
  note?: string;
  /** extra search words */
  words?: string;
}

export interface Section {
  name: string;
  topics: Topic[];
}

export const GUIDE: Section[] = [
  {
    name: 'Start here',
    topics: [
      {
        title: 'Make a video in five steps',
        what: 'The whole loop, start to finish.',
        where: 'The four areas: files on the left, picture in the middle, settings on the right, timeline along the bottom.',
        steps: [
          'Drag video, picture or sound files anywhere onto the window.',
          'Click a file on the left to put it on the timeline.',
          'Move the playhead and press S to cut. Select a piece and press Delete to remove it.',
          'Select a clip and change it with the tabs on the right.',
          'Press Export at the top right and save the MP4.',
        ],
        note: 'Everything is saved on this computer as you go. Nothing is uploaded.',
        words: 'begin basics first how',
      },
      {
        title: 'Select, move and trim clips',
        what: 'Arrange what plays when.',
        where: 'Timeline.',
        steps: [
          'Click a clip to select it. Ctrl-click to select several.',
          'Drag a clip sideways to move it, or up and down to change layer.',
          'Drag either end of a clip to make it shorter or longer.',
          'Q and W trim the selected clip to the playhead from the start or the end.',
        ],
        note: 'Clips snap to each other and to markers. Hold Alt while dragging to turn that off, or press N.',
        words: 'drag shorten cut snap',
      },
      {
        title: 'Undo anything',
        what: 'Every change can be taken back.',
        where: 'The two arrows at the left of the timeline toolbar.',
        steps: ['Ctrl + Z undoes.', 'Ctrl + Y does it again.'],
        words: 'mistake back redo',
      },
    ],
  },
  {
    name: 'Cutting',
    topics: [
      {
        title: 'Split and delete',
        what: 'Cut a clip in two and remove parts.',
        where: 'Timeline toolbar: the scissors and the two bins.',
        steps: [
          'Put the playhead where the cut should be and press S.',
          'Select the part you do not want.',
          'Delete leaves a gap. Shift + Delete closes the gap.',
        ],
        words: 'cut scissors ripple remove',
      },
      {
        title: 'Remove silences',
        what: 'Cuts the quiet stretches out of a talking clip in one go.',
        where: 'Timeline toolbar: Remove silences.',
        steps: ['Select one clip that has sound.', 'Press Remove silences.', 'The clip is replaced by the spoken pieces, closed up.'],
        note: 'Do this before reversing or speed-shaping the clip.',
        words: 'pause quiet jump cut talking',
      },
      {
        title: 'Group clips into one',
        what: 'Turns several clips into a single clip, so they move together and one effect covers them all.',
        where: 'Timeline toolbar: Group and Break apart.',
        steps: [
          'Select the clips (Ctrl-click, or Ctrl + A for all).',
          'Press Group, or Ctrl + G.',
          'The group now takes speed, fades, filters, masks, keyframes and transitions like any clip.',
          'To change what is inside, select it and press Break apart (Ctrl + Shift + G), edit, then group again.',
        ],
        note: 'Break apart drops the settings that were on the group itself. A group must be at normal speed and forwards before it can be broken apart.',
        words: 'compound nest combine merge ungroup',
      },
      {
        title: 'Markers',
        what: 'Flags on the ruler to remember a moment, such as a beat in the music.',
        where: 'Timeline toolbar: Marker.',
        steps: ['Shift + M adds or removes a marker at the playhead.', '[ and ] jump to the previous and next marker.', 'Clips snap to markers when dragged.'],
        words: 'flag beat bookmark',
      },
      {
        title: 'Freeze a frame',
        what: 'Holds the picture under the playhead for two seconds.',
        where: 'Timeline toolbar: Freeze.',
        steps: ['Select one video clip.', 'Put the playhead on the frame to hold.', 'Press Freeze.'],
        words: 'still pause hold',
      },
    ],
  },
  {
    name: 'Picture',
    topics: [
      {
        title: 'Size, position and rotation',
        what: 'Place a clip on the canvas.',
        where: 'Drag it in the preview, or right panel: Layout.',
        steps: ['Select the clip.', 'Drag it in the preview, or drag a corner to resize.', 'Or type exact numbers in Layout.'],
        words: 'move scale resize rotate transform picture in picture',
      },
      {
        title: 'Animate with keyframes',
        what: 'Makes size, position, rotation or opacity change over time.',
        where: 'Right panel: Layout. The diamond beside each setting.',
        steps: [
          'Put the playhead where the move should begin and click the diamond.',
          'Move the playhead to where it should end.',
          'Change the value. A second keyframe appears, and the clip glides between them.',
        ],
        note: 'Click a lit diamond to remove that keyframe. Dots on the clip show where they are.',
        words: 'animation motion zoom pan ken burns',
      },
      {
        title: 'Crop',
        what: 'Trims the edges off a picture or video.',
        where: 'Right panel: Layout, Crop.',
        steps: ['Select the clip.', 'Drag Left, Right, Top or Bottom.'],
        words: 'cut edges frame',
      },
      {
        title: 'Mask',
        what: 'Shows only an oval or rectangle of the clip.',
        where: 'Right panel: Layout, Mask.',
        steps: ['Choose Oval or Rectangle.', 'Set its size and position.', 'Soft edge blurs the border. The checkbox shows the outside instead.'],
        words: 'shape circle vignette cut out',
      },
      {
        title: 'Colour, filters and blur',
        what: 'Changes how the picture looks.',
        where: 'Right panel: Adjust. Ready-made looks are in the left panel: Looks.',
        steps: ['Select the clip.', 'Drag the sliders, or click a look.', 'Reset look puts it back.'],
        words: 'brightness contrast saturation grade look',
      },
      {
        title: 'Green screen',
        what: 'Makes one colour see-through so the layer below shows.',
        where: 'Right panel: Adjust, Green screen.',
        steps: ['Put the green-screen clip on a layer above the background.', 'Turn Green screen on and pick the colour.', 'Raise Tolerance until the colour is gone, then Softness to tidy the edge.'],
        words: 'chroma key background remove',
      },
      {
        title: 'Blend modes',
        what: 'Mixes a layer with what is underneath: Screen for light leaks, Multiply for shadows.',
        where: 'Right panel: Layout, Blend.',
        steps: ['Put the clip on a layer above another.', 'Pick a blend.'],
        words: 'overlay screen multiply mix',
      },
      {
        title: 'Steady a shaky shot',
        what: 'Smooths out hand-held wobble.',
        where: 'Right panel: Adjust, Shaky footage.',
        steps: ['Select a video clip.', 'Press Steady the shot and wait while it is measured.', 'Remove takes it off again.'],
        note: 'It fixes sliding shake, not twisting, and zooms in a little to hide the edges. Works on up to two minutes of a clip.',
        words: 'stabilise stabilize wobble handheld',
      },
    ],
  },
  {
    name: 'Time',
    topics: [
      {
        title: 'Speed up or slow down',
        what: 'Changes how fast a clip plays.',
        where: 'Right panel: Speed.',
        steps: ['Select the clip.', 'Pick a speed, or drag the slider.'],
        note: 'Sound follows the speed, so faster is higher pitched.',
        words: 'slow motion fast timelapse',
      },
      {
        title: 'Speed shapes',
        what: 'Speed that changes during the clip, such as slow then fast.',
        where: 'Right panel: Speed, Speed shape.',
        steps: ['Select the clip.', 'Pick a shape. The clip keeps its length.'],
        note: 'Splitting a shaped clip turns each half into a steady-speed clip.',
        words: 'ramp curve velocity',
      },
      {
        title: 'Play backwards',
        what: 'Reverses a clip.',
        where: 'Right panel: Speed, Play backwards.',
        steps: ['Select the clip.', 'Tick Play backwards.'],
        note: 'Backwards sound is silent in the preview but is in the exported file.',
        words: 'reverse rewind',
      },
      {
        title: 'Transitions between clips',
        what: 'A fade, slide or wipe from one clip into the next.',
        where: 'Left panel: Transitions.',
        steps: ['Put two clips end to end on the same layer.', 'Select the second one.', 'Click a transition.'],
        words: 'crossfade dissolve wipe',
      },
      {
        title: 'Arrive and leave animations',
        what: 'How a clip or caption comes on and goes off.',
        where: 'Right panel: Motion.',
        steps: ['Select the clip.', 'Pick an animation for Arrive and for Leave, and how long each takes.'],
        words: 'intro outro fade slide',
      },
    ],
  },
  {
    name: 'Text and sound',
    topics: [
      {
        title: 'Add text',
        what: 'Titles and captions.',
        where: 'Left panel: Text.',
        steps: ['Click a text style.', 'Type in the right panel: Text.', 'Drag it in the preview to place it.'],
        words: 'title caption words font',
      },
      {
        title: 'Import subtitles',
        what: 'Turns a subtitle file into timed captions.',
        where: 'Left panel: Text, Import subtitles.',
        steps: ['Press Import subtitles.', 'Choose an .srt or .vtt file.'],
        words: 'srt vtt captions',
      },
      {
        title: 'Volume, mute and fades',
        what: 'How loud a clip is and how it starts and ends.',
        where: 'Right panel: Sound.',
        steps: ['Select the clip.', 'Set Volume, Fade in and Fade out. M mutes it.'],
        words: 'audio loud quiet music',
      },
      {
        title: 'Detach the sound from a video',
        what: 'Moves a video’s sound onto its own track so it can be cut separately.',
        where: 'Timeline toolbar: Detach audio.',
        steps: ['Select the video clip.', 'Press Detach audio.'],
        words: 'separate split audio',
      },
      {
        title: 'Record a voiceover',
        what: 'Records your microphone straight onto the timeline.',
        where: 'Left panel: Audio.',
        steps: ['Put the playhead where you want to start talking.', 'Press record, speak, and stop.'],
        note: 'The first time, Windows asks for permission to use the microphone.',
        words: 'microphone narration voice',
      },
    ],
  },
  {
    name: 'Finishing',
    topics: [
      {
        title: 'Canvas size and shape',
        what: 'Wide for YouTube, tall for phones, square for feeds.',
        where: 'Right panel, with nothing selected.',
        steps: ['Click an empty part of the timeline to clear the selection.', 'Pick a shape and size.'],
        words: 'aspect ratio vertical portrait landscape resolution',
      },
      {
        title: 'Export the video',
        what: 'Saves the finished video as an MP4 file.',
        where: 'Export, top right. Ctrl + E.',
        steps: ['Pick the size, frame rate and quality.', 'Press Export and choose where to save.'],
        note: 'Up to 4K at 60 frames a second, with no watermark.',
        words: 'save render download mp4',
      },
      {
        title: 'Export only the sound',
        what: 'Saves the mixed sound of the timeline as a WAV file.',
        where: 'Export, then Save as: Sound only.',
        steps: ['Open Export.', 'Choose Sound only (WAV).', 'Press Export.'],
        words: 'audio wav podcast',
      },
    ],
  },
];
