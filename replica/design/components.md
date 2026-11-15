# Components

Tokens live in `tokens.json` and are mirrored as CSS custom properties at the top of
`src/styles.css`. Icons are inline SVGs drawn for this project (simple strokes), no
third-party or original-app artwork. No Tailwind: plain CSS classes over the tokens.

```
Button
  variants  primary, secondary, ghost, icon, danger
  sizes     sm 26px, md 32px
  states    default, hover, active, focus-visible (2px accent ring), disabled
  tokens    primary: bg accent, text on-accent; secondary: bg surface-3, text
  a11y      real <button>, title/aria-label on icon buttons
  used on   all

Tab strip
  variants  left rail (icon + label, vertical), inspector (text, horizontal)
  states    default, hover, active (accent text and marker)
  a11y      role=tablist, buttons with aria-selected

Slider + number
  variants  plain, bipolar (double-click resets to default)
  states    default, dragging, disabled
  a11y      native <input type=range> with a label, paired number input

Media thumbnail
  variants  video, image, audio
  states    default, hover (shows add button), loading, error
  a11y      button, name as label, Enter adds to the timeline

Swatch tile
  variants  filter, transition, text preset, animation
  states    default, hover, applied (accent border)

Timeline clip
  variants  video (thumbnail strip colour), image, text, audio (waveform)
  states    default, selected (accent outline), dragging, trimming, locked track
  a11y      pointer driven; every action also has a keyboard shortcut

Playhead
  states    idle, scrubbing

Transform box
  handles   move (body), scale (corners), rotate (top handle)
  states    idle, dragging

Modal
  variants  export, shortcuts
  states    open, busy (export running: close disabled, cancel shown)
  a11y      role=dialog, aria-modal, Escape closes when not busy

Progress bar
  states    running, done, failed

Toast
  variants  info, error
  a11y      role=status, auto-dismiss after 4s

Splitter
  variants  vertical (panel widths), horizontal (timeline height)
```
