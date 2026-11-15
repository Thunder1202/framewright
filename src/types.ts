export type AssetKind = 'video' | 'image' | 'audio';

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  /** seconds; 0 for images */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** small JPEG data URL */
  thumb?: string;
}

export interface Adjust {
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  vignette: number; // 0..100
  blur: number; // 0..100
}

/** One word of a caption and when it is spoken, in seconds from the clip's start. */
export interface TimedWord {
  w: string;
  s: number;
  e: number;
}

export interface TextStyle {
  content: string;
  /** captions made from speech: a time for every word, so the spoken one can light up */
  words?: TimedWord[];
  /** colour of the word being spoken; no highlighting when empty */
  highlight?: string;
  font: string;
  /** percent of canvas height */
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  stroke: string;
  strokeWidth: number; // 0..20, percent of font size
  background: string;
  backgroundOn: boolean;
  shadow: boolean;
}

export type AnimKind =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'spin';

export type TransitionKind = 'none' | 'crossfade' | 'dip-black' | 'slide' | 'push' | 'wipe' | 'zoom';

export interface Anim {
  kind: AnimKind;
  duration: number;
}

export type ClipKind = 'video' | 'image' | 'text' | 'audio' | 'compound';

/** A timeline inside a clip: several clips grouped so they move and change as one. */
export interface Inner {
  tracks: Track[];
  /** seconds; the length of the grouped stretch */
  duration: number;
}

/** fractions (0..1) of the source trimmed off each edge */
export interface Crop {
  l: number;
  t: number;
  r: number;
  b: number;
}

export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'lighten' | 'darken' | 'add';

/** Green screen: pixels close to `color` become see-through. */
export interface Chroma {
  on: boolean;
  color: string;
  tolerance: number; // 0..100
  softness: number; // 0..100
}

export type KeyProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';

/** One keyframe: a value at a time (seconds from the clip's start). */
export interface Key {
  t: number;
  v: number;
}

export interface Mask {
  shape: 'none' | 'rect' | 'ellipse';
  /** size as a fraction of the clip */
  w: number;
  h: number;
  /** centre offset as a fraction of the clip, 0 = middle */
  x: number;
  y: number;
  feather: number; // 0..100
  invert: boolean;
}

export type RampKind = 'none' | 'speed-up' | 'slow-down' | 'hero' | 'rush';

/** Camera-shake corrections, sampled along the source. */
export interface Stab {
  /** samples per second of source */
  rate: number;
  /** source time of the first sample */
  t0: number;
  /** shift to apply, as fractions of the source width / height */
  dx: number[];
  dy: number[];
  /** how far the picture is zoomed in to hide the moving edges */
  zoom: number;
}

export interface Marker {
  id: string;
  time: number;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  assetId?: string;
  name: string;
  /** position on the timeline, seconds */
  start: number;
  /** length on the timeline, seconds */
  duration: number;
  /** seconds into the source where this clip begins */
  offset: number;
  speed: number;
  volume: number; // 0..2
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  /** centre offset from the canvas centre, as a fraction of canvas width / height */
  x: number;
  y: number;
  /** 1 = fitted inside the canvas */
  scale: number;
  rotation: number; // degrees
  opacity: number; // 0..1
  flipH: boolean;
  adjust: Adjust;
  filter: string;
  /** optional so projects saved before these existed still load */
  crop?: Crop;
  blend?: BlendMode;
  chroma?: Chroma;
  keys?: Partial<Record<KeyProp, Key[]>>;
  mask?: Mask;
  reversed?: boolean;
  ramp?: RampKind;
  stab?: Stab;
  /** only on compound clips */
  inner?: Inner;
  text?: TextStyle;
  animIn: Anim;
  animOut: Anim;
  /** how this clip arrives from the clip directly before it on the same track */
  transition: { kind: TransitionKind; duration: number };
}

export type TrackKind = 'visual' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** visual tracks first (index 0 is the top layer), then audio tracks */
  tracks: Track[];
  assets: Asset[];
  markers?: Marker[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
  duration: number;
  thumb?: string;
}

export const DEFAULT_ADJUST: Adjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  vignette: 0,
  blur: 0,
};

export const DEFAULT_MASK: Mask = { shape: 'none', w: 0.6, h: 0.6, x: 0, y: 0, feather: 10, invert: false };

export const DEFAULT_CROP: Crop = { l: 0, t: 0, r: 0, b: 0 };

export const DEFAULT_CHROMA: Chroma = { on: false, color: '#00d000', tolerance: 40, softness: 20 };

export const DEFAULT_TEXT: TextStyle = {
  content: 'Your text',
  font: 'Segoe UI, system-ui, sans-serif',
  size: 9,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  stroke: '#000000',
  strokeWidth: 0,
  background: '#000000',
  backgroundOn: false,
  shadow: true,
};
