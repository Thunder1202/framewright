import { Clip, Project, Track } from '../types';
import { sourcePos } from './ramp';
import { clamp, clipEnd, EPS, newClip, newTrack, overlaps, pruneTracks, sortClips, trimEnd, trimStart } from './timeline';

/**
 * Compound clips: several clips grouped into one that holds its own small timeline.
 * The group then moves, trims, speeds up, fades and takes effects as a single clip.
 * Pure, so it is unit tested.
 */

/** Deepest a group may sit inside other groups. */
export const MAX_DEPTH = 4;

/** The timeline inside a compound clip, dressed as a project so the usual code can read it. */
export function subProject(p: Project, clip: Clip): Project {
  return { ...p, tracks: clip.inner?.tracks ?? [], markers: [] };
}

/** Time inside the group for a moment on the outer timeline. */
export function innerTime(clip: Clip, t: number): number {
  const total = clip.inner?.duration ?? 0;
  // stop just short of the end, where nothing inside is showing any more
  return clamp(sourcePos(clip, t - clip.start), 0, Math.max(0, total - 0.002));
}

/** Every source file a clip needs, looking inside groups. */
export function assetsIn(clip: Clip): string[] {
  const out = clip.assetId ? [clip.assetId] : [];
  for (const tr of clip.inner?.tracks ?? []) for (const c of tr.clips) out.push(...assetsIn(c));
  return out;
}

export function depthOf(clip: Clip): number {
  if (!clip.inner) return 0;
  let d = 0;
  for (const tr of clip.inner.tracks) for (const c of tr.clips) d = Math.max(d, depthOf(c));
  return d + 1;
}

/** How many clips are inside, counting through nested groups. */
export function countInside(clip: Clip): number {
  let n = 0;
  for (const tr of clip.inner?.tracks ?? []) for (const c of tr.clips) n += c.inner ? countInside(c) : 1;
  return n;
}

/**
 * Replace the given clips with one compound clip holding them.
 * Returns the new clip's id, or a sentence saying why it could not be done.
 */
export function groupClips(p: Project, ids: Set<string>): { id: string } | { error: string } {
  const picked: { track: Track; clips: Clip[] }[] = [];
  for (const track of p.tracks) {
    const clips = track.clips.filter((c) => ids.has(c.id));
    if (!clips.length) continue;
    if (track.locked) return { error: 'Unlock the track first' };
    picked.push({ track, clips });
  }
  const all = picked.flatMap((x) => x.clips);
  if (!all.length) return { error: 'Select the clips to group' };
  if (all.some((c) => depthOf(c) >= MAX_DEPTH)) return { error: 'Those groups are already nested as deep as they can go' };

  const start = Math.min(...all.map((c) => c.start));
  const end = Math.max(...all.map(clipEnd));
  const inner: Track[] = picked.map(({ track, clips }) => ({
    ...newTrack(track.kind),
    muted: track.muted,
    hidden: track.hidden,
    clips: clips.map((c) => ({ ...c, start: c.start - start })),
  }));
  const group = newClip({
    kind: 'compound',
    name: all.length === 1 ? all[0].name : `Group of ${all.length}`,
    start,
    duration: end - start,
    inner: { tracks: inner, duration: end - start },
  });

  for (const { track } of picked) track.clips = track.clips.filter((c) => !ids.has(c.id));

  // it takes the place of the topmost picture it swallowed, so the stacking stays as close as it can
  const home = picked.find((x) => x.track.kind === 'visual')?.track;
  let target = home && !overlaps(home, start, group.duration) ? home : undefined;
  if (!target) {
    target = newTrack('visual');
    const at = home ? p.tracks.indexOf(home) : 0;
    p.tracks.splice(Math.max(0, at), 0, target);
  }
  target.clips.push(group);
  sortClips(target);
  pruneTracks(p);
  return { id: group.id };
}

/**
 * Put a compound clip's contents back on the timeline. Only the stretch the group
 * was showing comes back. Returns the ids of the clips that came out.
 */
export function ungroupClip(p: Project, id: string): { ids: string[] } | { error: string } {
  let home: Track | undefined;
  let group: Clip | undefined;
  for (const track of p.tracks) {
    const c = track.clips.find((x) => x.id === id);
    if (c) {
      home = track;
      group = c;
    }
  }
  if (!home || !group || !group.inner) return { error: 'Select a group to break apart' };
  if (home.locked) return { error: 'Unlock the track first' };
  if (group.reversed || (group.ramp && group.ramp !== 'none') || Math.abs(group.speed - 1) > 1e-6) {
    return { error: 'Set the group back to normal speed, forwards, before breaking it apart' };
  }

  const from = group.offset;
  const to = group.offset + group.duration;
  const shift = group.start - group.offset;
  const out: string[] = [];
  const lanes: Track[] = [];
  for (const tr of group.inner.tracks) {
    const clips: Clip[] = [];
    for (const src of tr.clips) {
      if (clipEnd(src) <= from + EPS || src.start >= to - EPS) continue;
      let c = structuredClone(src);
      if (c.start < from - EPS) c = trimStart(c, from, 0, p.fps);
      if (clipEnd(c) > to + EPS) c = trimEnd(c, to, Infinity, p.fps);
      c.start += shift;
      clips.push(c);
      out.push(c.id);
    }
    if (clips.length) lanes.push({ ...tr, clips });
  }

  home.clips = home.clips.filter((c) => c.id !== id);
  const above = p.tracks.indexOf(home);
  // bottom picture layer goes back where the group was; the rest stack above it in the same order
  const pictures = lanes.filter((l) => l.kind === 'visual').reverse();
  pictures.forEach((lane, i) => {
    if (i === 0) {
      home!.clips.push(...lane.clips);
      sortClips(home!);
      return;
    }
    const tr = { ...newTrack('visual'), muted: lane.muted, hidden: lane.hidden, clips: lane.clips };
    p.tracks.splice(above, 0, tr);
  });
  for (const lane of lanes.filter((l) => l.kind === 'audio')) {
    let tr = p.tracks.find((t) => t.kind === 'audio' && !t.locked && lane.clips.every((c) => !overlaps(t, c.start, c.duration)));
    if (!tr) {
      tr = { ...newTrack('audio'), muted: lane.muted };
      p.tracks.push(tr);
    }
    tr.clips.push(...lane.clips);
    sortClips(tr);
  }
  pruneTracks(p);
  return { ids: out };
}
