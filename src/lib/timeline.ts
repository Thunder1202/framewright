import { Asset, Clip, DEFAULT_ADJUST, Project, Track, TrackKind } from '../types';
import { scaleKeys, shiftKeys } from './keyframes';
import { sourcePos } from './ramp';

/** Pure timeline maths. No DOM, no store: everything here is unit tested. */

export const EPS = 1e-4;

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const clipEnd = (c: Clip) => c.start + c.duration;

export const snapFrame = (t: number, fps: number) => Math.round(t * fps) / fps;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function projectDuration(p: Project): number {
  let d = 0;
  for (const tr of p.tracks) for (const c of tr.clips) d = Math.max(d, clipEnd(c));
  return d;
}

export function newTrack(kind: TrackKind): Track {
  return { id: uid(), kind, muted: false, hidden: false, locked: false, clips: [] };
}

export function newProject(name: string): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [newTrack('visual'), newTrack('audio')],
    assets: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newClip(partial: Partial<Clip> & Pick<Clip, 'kind' | 'name' | 'start' | 'duration'>): Clip {
  return {
    id: uid(),
    offset: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    flipH: false,
    adjust: { ...DEFAULT_ADJUST },
    filter: 'none',
    animIn: { kind: 'none', duration: 0.5 },
    animOut: { kind: 'none', duration: 0.5 },
    transition: { kind: 'none', duration: 0.5 },
    ...partial,
  };
}

export const hasSource = (c: Clip) => c.kind === 'video' || c.kind === 'audio' || c.kind === 'compound';

/** Move a caption's word times when the clip's own start moves (split, trim). */
export function shiftWords(clip: Clip, delta: number): void {
  if (!clip.text?.words) return;
  clip.text = { ...clip.text, words: clip.text.words.map((w) => ({ ...w, s: w.s + delta, e: w.e + delta })) };
}

/** Give everything inside a compound clip new ids, so a copy never shares players with the original. */
export function freshIds(clip: Clip): Clip {
  if (!clip.inner) return clip;
  for (const tr of clip.inner.tracks) {
    tr.id = uid();
    for (const c of tr.clips) {
      c.id = uid();
      freshIds(c);
    }
  }
  return clip;
}

/** Longest this clip can be on the timeline given where it starts in its source. */
export function maxDuration(clip: Clip, asset?: Asset): number {
  const total = clip.inner ? clip.inner.duration : asset?.duration;
  if (!hasSource(clip) || !total || !(total > 0)) return Infinity;
  return Math.max(0, (total - clip.offset) / clip.speed);
}

export function findClip(p: Project, id: string): { track: Track; clip: Clip; ti: number; ci: number } | null {
  for (let ti = 0; ti < p.tracks.length; ti++) {
    const ci = p.tracks[ti].clips.findIndex((c) => c.id === id);
    if (ci >= 0) return { track: p.tracks[ti], clip: p.tracks[ti].clips[ci], ti, ci };
  }
  return null;
}

export function sortClips(track: Track) {
  track.clips.sort((a, b) => a.start - b.start);
}

export function overlaps(track: Track, start: number, duration: number, ignoreId?: string): boolean {
  const end = start + duration;
  return track.clips.some(
    (c) => c.id !== ignoreId && start < clipEnd(c) - EPS && end > c.start + EPS,
  );
}

/** Nearest start at or around `start` where a clip of `duration` fits without overlapping. */
export function findFreeStart(track: Track, start: number, duration: number, ignoreId?: string): number {
  start = Math.max(0, start);
  if (!overlaps(track, start, duration, ignoreId)) return start;
  const candidates: number[] = [];
  for (const c of track.clips) {
    if (c.id === ignoreId) continue;
    candidates.push(clipEnd(c));
    if (c.start - duration >= 0) candidates.push(c.start - duration);
  }
  let best = Infinity;
  let bestDist = Infinity;
  for (const cand of candidates) {
    if (overlaps(track, cand, duration, ignoreId)) continue;
    const d = Math.abs(cand - start);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  if (best === Infinity) {
    // always fits after the last clip
    best = track.clips.reduce((m, c) => (c.id === ignoreId ? m : Math.max(m, clipEnd(c))), 0);
  }
  return best;
}

/** A free start on the frame grid. Rounds up if rounding to nearest would overlap. */
export function placeOnGrid(track: Track, start: number, duration: number, fps: number, ignoreId?: string): number {
  const free = findFreeStart(track, start, duration, ignoreId);
  const near = snapFrame(free, fps);
  if (!overlaps(track, near, duration, ignoreId)) return near;
  const up = Math.ceil(free * fps - 1e-6) / fps;
  return overlaps(track, up, duration, ignoreId) ? free : up;
}

export function trackEnd(track: Track): number {
  return track.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

/** End of the clip before and start of the clip after, on the same track. */
export function neighbours(track: Track, clipId: string): { prevEnd: number; nextStart: number } {
  const me = track.clips.find((c) => c.id === clipId);
  let prevEnd = 0;
  let nextStart = Infinity;
  if (!me) return { prevEnd, nextStart };
  for (const c of track.clips) {
    if (c.id === clipId) continue;
    if (clipEnd(c) <= me.start + EPS) prevEnd = Math.max(prevEnd, clipEnd(c));
    else if (c.start >= clipEnd(me) - EPS) nextStart = Math.min(nextStart, c.start);
  }
  return { prevEnd, nextStart };
}

/** Split into two clips at timeline time t. Null if either half would be under one frame. */
export function splitClip(clip: Clip, t: number, fps: number): [Clip, Clip] | null {
  t = snapFrame(t, fps);
  const frame = 1 / fps;
  if (t - clip.start < frame - EPS || clipEnd(clip) - t < frame - EPS) return null;
  const a: Clip = {
    ...structuredClone(clip),
    duration: t - clip.start,
    fadeOut: 0,
    animOut: { kind: 'none', duration: clip.animOut.duration },
  };
  const b: Clip = {
    ...structuredClone(clip),
    id: uid(),
    start: t,
    duration: clipEnd(clip) - t,
    offset: hasSource(clip) ? clip.offset + (t - clip.start) * clip.speed : clip.offset,
    fadeIn: 0,
    animIn: { kind: 'none', duration: clip.animIn.duration },
    transition: { kind: 'none', duration: clip.transition.duration },
  };
  if (hasSource(clip) && (clip.reversed || (clip.ramp && clip.ramp !== 'none'))) {
    // Time is bent inside this clip. Each half keeps exactly the stretch of source
    // it was showing, at that stretch's average speed, so the cut does not jump.
    const s0 = sourcePos(clip, 0);
    const s1 = sourcePos(clip, t - clip.start);
    const s2 = sourcePos(clip, clip.duration);
    for (const [piece, from, to] of [
      [a, s0, s1],
      [b, s1, s2],
    ] as const) {
      piece.offset = Math.min(from, to);
      piece.speed = Math.max(0.01, Math.abs(to - from) / piece.duration);
      piece.ramp = 'none';
    }
  }
  // key times count from the clip's start, so the second half's move back with it
  shiftKeys(b, clip.start - t);
  shiftWords(b, clip.start - t);
  freshIds(b);
  return [a, b];
}

export function trimStart(clip: Clip, newStart: number, lowerBound: number, fps: number): Clip {
  const frame = 1 / fps;
  // a reversed clip shows the end of its source first; its start edge can be pulled in but not out
  const minStart = !hasSource(clip) ? 0 : clip.reversed ? clip.start : clip.start - clip.offset / clip.speed;
  const ns = clamp(newStart, Math.max(lowerBound, minStart, 0), clipEnd(clip) - frame);
  const delta = ns - clip.start;
  const out: Clip = {
    ...structuredClone(clip),
    start: ns,
    duration: clip.duration - delta,
    offset: hasSource(clip) && !clip.reversed ? Math.max(0, clip.offset + delta * clip.speed) : clip.offset,
  };
  shiftKeys(out, -delta);
  shiftWords(out, -delta);
  return out;
}

export function trimEnd(clip: Clip, newEnd: number, upperBound: number, fps: number, asset?: Asset): Clip {
  const frame = 1 / fps;
  if (clip.reversed && hasSource(clip)) {
    // the end edge of a reversed clip is the start of its source
    const ne = clamp(newEnd, clip.start + frame, Math.min(upperBound, clipEnd(clip) + clip.offset / clip.speed));
    const delta = ne - clipEnd(clip);
    return { ...clip, duration: ne - clip.start, offset: Math.max(0, clip.offset - delta * clip.speed) };
  }
  const maxEnd = clip.start + maxDuration(clip, asset);
  const ne = clamp(newEnd, clip.start + frame, Math.min(upperBound, maxEnd));
  return { ...clip, duration: ne - clip.start };
}

/** Remove clips and close the gaps they leave, on this track only. */
export function rippleDelete(track: Track, ids: Set<string>): void {
  sortClips(track);
  let shift = 0;
  const kept: Clip[] = [];
  for (const c of track.clips) {
    if (ids.has(c.id)) {
      shift += c.duration;
      continue;
    }
    c.start = Math.max(0, c.start - shift);
    kept.push(c);
  }
  track.clips = kept;
}

/** Snap t to the nearest point within threshold. */
export function snapTime(t: number, points: number[], threshold: number): { t: number; hit: number | null } {
  let best: number | null = null;
  let bestD = threshold;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best === null ? { t, hit: null } : { t: best, hit: best };
}

export function snapPoints(p: Project, excludeId: string | null, playhead: number): number[] {
  const pts = [0, playhead];
  for (const tr of p.tracks)
    for (const c of tr.clips) {
      if (c.id === excludeId) continue;
      pts.push(c.start, clipEnd(c));
    }
  for (const m of p.markers ?? []) pts.push(m.time);
  return pts;
}

/** Change speed, keeping the same stretch of source. Later clips are pushed right if needed. */
export function setSpeed(track: Track, clipId: string, speed: number): void {
  const clip = track.clips.find((c) => c.id === clipId);
  if (!clip) return;
  speed = clamp(speed, 0.1, 8);
  const sourceSpan = clip.duration * clip.speed;
  const oldEnd = clipEnd(clip);
  const oldDuration = clip.duration;
  clip.speed = speed;
  clip.duration = hasSource(clip) ? sourceSpan / speed : clip.duration;
  if (oldDuration > 0) scaleKeys(clip, clip.duration / oldDuration);
  const grow = clipEnd(clip) - oldEnd;
  if (grow > 0) {
    sortClips(track);
    let cursor = clipEnd(clip);
    for (const c of track.clips) {
      if (c.id === clipId || c.start < clip.start) continue;
      if (c.start < cursor - EPS) c.start = cursor;
      cursor = Math.max(cursor, clipEnd(c));
    }
  }
}

export interface SilenceOptions {
  /** fraction of the loudest peak below which audio counts as silent */
  relative?: number;
  minSilence?: number;
  pad?: number;
}

/**
 * From peak data (one absolute peak per bucket), the ranges of source time worth keeping.
 */
export function detectKeepRanges(
  peaks: Float32Array,
  rate: number,
  { relative = 0.06, minSilence = 0.45, pad = 0.1 }: SilenceOptions = {},
): [number, number][] {
  const total = peaks.length / rate;
  if (!peaks.length) return [];
  let loud = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > loud) loud = peaks[i];
  const thr = Math.max(0.008, loud * relative);
  const silences: [number, number][] = [];
  let runStart = -1;
  for (let i = 0; i <= peaks.length; i++) {
    const quiet = i < peaks.length && peaks[i] < thr;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      const a = runStart / rate;
      const b = i / rate;
      if (b - a >= minSilence) {
        // keep a little air either side, except at the very ends of the file
        const sa = runStart === 0 ? 0 : a + pad;
        const sb = i === peaks.length ? total : b - pad;
        if (sb - sa > 0.05) silences.push([sa, sb]);
      }
      runStart = -1;
    }
  }
  const keep: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of silences) {
    if (a > cursor + EPS) keep.push([cursor, a]);
    cursor = b;
  }
  if (total > cursor + EPS) keep.push([cursor, total]);
  return keep;
}

/** Replace a clip with back-to-back pieces covering only the kept source ranges. */
export function cutToRanges(clip: Clip, ranges: [number, number][], fps: number): Clip[] {
  const s0 = clip.offset;
  const s1 = clip.offset + clip.duration * clip.speed;
  const spans: [number, number][] = [];
  for (const [a, b] of ranges) {
    const lo = Math.max(a, s0);
    const hi = Math.min(b, s1);
    if ((hi - lo) / clip.speed >= 2 / fps) spans.push([lo, hi]);
  }
  if (!spans.length) return [clip];
  if (spans.length === 1 && spans[0][0] <= s0 + EPS && spans[0][1] >= s1 - EPS) return [clip];
  const out: Clip[] = [];
  let cursor = clip.start;
  spans.forEach(([lo, hi], i) => {
    const first = i === 0;
    const last = i === spans.length - 1;
    const duration = snapFrame((hi - lo) / clip.speed, fps);
    const piece: Clip = {
      ...structuredClone(clip),
      id: first ? clip.id : uid(),
      start: cursor,
      offset: lo,
      duration,
      fadeIn: first ? clip.fadeIn : 0,
      fadeOut: last ? clip.fadeOut : 0,
      animIn: first ? clip.animIn : { kind: 'none', duration: 0.5 },
      animOut: last ? clip.animOut : { kind: 'none', duration: 0.5 },
      transition: first ? clip.transition : { kind: 'none', duration: 0.5 },
    };
    out.push(piece);
    cursor += duration;
  });
  return out;
}

/** Swap one clip for several and shift later clips on the track by the change in length. */
export function replaceWithRipple(track: Track, clipId: string, pieces: Clip[]): void {
  const old = track.clips.find((c) => c.id === clipId);
  if (!old) return;
  const oldEnd = clipEnd(old);
  const newEnd = pieces.length ? clipEnd(pieces[pieces.length - 1]) : old.start;
  const delta = newEnd - oldEnd;
  const rest = track.clips.filter((c) => c.id !== clipId);
  for (const c of rest) if (c.start >= oldEnd - EPS) c.start = Math.max(0, c.start + delta);
  track.clips = [...rest, ...pieces];
  sortClips(track);
}

/** Drop empty tracks, but always keep one visual and one audio track. */
export function pruneTracks(p: Project): void {
  const keep = (kind: TrackKind) => {
    const all = p.tracks.filter((t) => t.kind === kind);
    const full = all.filter((t) => t.clips.length > 0);
    if (full.length) return full;
    if (!all.length) return [newTrack(kind)];
    return [kind === 'visual' ? all[all.length - 1] : all[0]];
  };
  p.tracks = [...keep('visual'), ...keep('audio')];
}

/** Volume multiplier from the clip's fades at timeline time t. */
export function fadeGain(clip: Clip, t: number): number {
  let g = 1;
  const local = t - clip.start;
  const left = clipEnd(clip) - t;
  if (clip.fadeIn > 0) g = Math.min(g, local / clip.fadeIn);
  if (clip.fadeOut > 0) g = Math.min(g, left / clip.fadeOut);
  return clamp(g, 0, 1);
}

export function formatTime(t: number, fps: number): string {
  t = Math.max(0, t);
  const totalFrames = Math.round(t * fps);
  const f = totalFrames % fps;
  const s = Math.floor(totalFrames / fps);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f)}`;
}
