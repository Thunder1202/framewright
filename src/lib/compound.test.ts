import { describe, expect, it } from 'vitest';
import { assetsIn, countInside, groupClips, innerTime, ungroupClip } from './compound';
import { maxDuration, newClip, newProject, newTrack, splitClip, trimEnd } from './timeline';
import { Clip, Project } from '../types';

const clip = (kind: Clip['kind'], start: number, duration: number, over: Partial<Clip> = {}) =>
  newClip({ kind, assetId: kind + start, name: kind, start, duration, ...over });

/** two picture layers and a sound track: [top: text 2-4] [main: video 0-3, video 3-6] [audio 1-5] */
function project(): Project {
  const p = newProject('t');
  const top = newTrack('visual');
  top.clips.push(clip('text', 2, 2, { assetId: undefined }));
  p.tracks.unshift(top);
  p.tracks[1].clips.push(clip('video', 0, 3), clip('video', 3, 3));
  p.tracks[2].clips.push(clip('audio', 1, 4));
  return p;
}
const ids = (p: Project) => p.tracks.flatMap((t) => t.clips.map((c) => c.id));
const group = (p: Project, pick: string[]) => {
  const r = groupClips(p, new Set(pick));
  if ('error' in r) throw new Error(r.error);
  return p.tracks.flatMap((t) => t.clips).find((c) => c.id === r.id)!;
};

describe('grouping', () => {
  it('swallows the clips and sits where they were', () => {
    const p = project();
    const g = group(p, ids(p));
    expect([g.kind, g.start, g.duration, g.inner!.duration]).toEqual(['compound', 0, 6, 6]);
    expect(ids(p)).toEqual([g.id]);
    expect(g.inner!.tracks.map((t) => [t.kind, t.clips.map((c) => c.start)])).toEqual([
      ['visual', [2]],
      ['visual', [0, 3]],
      ['audio', [1]],
    ]);
    expect(countInside(g)).toBe(4);
    // an empty picture and sound track are always kept
    expect(p.tracks.map((t) => t.kind)).toEqual(['visual', 'audio']);
  });

  it('counts time from the first grouped clip, not from zero', () => {
    const p = project();
    const second = p.tracks[1].clips[1];
    const g = group(p, [second.id, p.tracks[0].clips[0].id]);
    // text 2-4 and video 3-6 → the group runs 2-6
    expect([g.start, g.duration]).toEqual([2, 4]);
    expect(g.inner!.tracks[1].clips[0].start).toBe(1);
    // the first video is still on the main track, so the group needed a layer of its own above it
    expect(p.tracks.findIndex((t) => t.clips.includes(g))).toBeLessThan(p.tracks.findIndex((t) => t.clips.some((c) => c.start === 0)));
  });

  it('refuses a locked track and an empty pick', () => {
    const p = project();
    p.tracks[1].locked = true;
    expect(groupClips(p, new Set(ids(p)))).toHaveProperty('error');
    expect(groupClips(project(), new Set())).toHaveProperty('error');
  });

  it('knows which files it needs, through nesting', () => {
    const p = project();
    const g = group(p, ids(p));
    const outer = group(p, [g.id]);
    expect(assetsIn(outer).sort()).toEqual(['audio1', 'video0', 'video3']);
    expect(countInside(outer)).toBe(4);
  });
});

describe('a group behaves like a clip with a source', () => {
  const made = () => {
    const p = project();
    return group(p, ids(p));
  };

  it('maps outer time to inner time through trim, speed and reverse', () => {
    const g = made();
    g.start = 10;
    expect(innerTime(g, 12)).toBeCloseTo(2);
    g.offset = 1;
    g.speed = 2;
    g.duration = 2.5;
    expect(innerTime(g, 11)).toBeCloseTo(3);
    g.reversed = true;
    expect(innerTime(g, 10)).toBeCloseTo(5.998);
    expect(innerTime(g, 12.5)).toBeCloseTo(1);
  });

  it('cannot be stretched past what is inside', () => {
    const g = made();
    expect(maxDuration(g)).toBe(6);
    expect(trimEnd(g, 99, Infinity, 30).duration).toBe(6);
  });

  it('splits into two groups that do not share ids', () => {
    const g = made();
    const [a, b] = splitClip(g, 4, 30)!;
    expect([a.duration, b.start, b.offset, b.duration]).toEqual([4, 4, 4, 2]);
    const inside = (c: Clip) => c.inner!.tracks.flatMap((t) => t.clips.map((x) => x.id));
    expect(inside(a).filter((id) => inside(b).includes(id))).toEqual([]);
    expect(innerTime(b, 4)).toBeCloseTo(4);
  });
});

describe('breaking apart', () => {
  it('puts everything back where it was', () => {
    const p = project();
    const before = p.tracks.map((t) => [t.kind, t.clips.map((c) => [c.kind, c.start, c.duration])]);
    const g = group(p, ids(p));
    const r = ungroupClip(p, g.id);
    expect(r).toHaveProperty('ids');
    expect(p.tracks.map((t) => [t.kind, t.clips.map((c) => [c.kind, c.start, c.duration])])).toEqual(before);
  });

  it('brings back only the stretch the group was showing', () => {
    const p = project();
    const g = group(p, ids(p));
    // trim the group to its 2s-5s stretch and move it to 20s
    g.offset = 2;
    g.duration = 3;
    g.start = 20;
    ungroupClip(p, g.id);
    const flat = p.tracks.flatMap((t) => t.clips.map((c) => [c.kind, c.start, c.duration, c.offset]));
    expect(flat).toEqual([
      ['text', 20, 2, 0],
      ['video', 20, 1, 2],
      ['video', 21, 2, 0],
      ['audio', 20, 3, 1],
    ]);
  });

  it('refuses while the group is sped up or reversed', () => {
    const p = project();
    const g = group(p, ids(p));
    g.reversed = true;
    expect(ungroupClip(p, g.id)).toHaveProperty('error');
    g.reversed = false;
    g.speed = 2;
    expect(ungroupClip(p, g.id)).toHaveProperty('error');
  });
});
