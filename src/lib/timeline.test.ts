import { describe, expect, it } from 'vitest';
import * as T from './timeline';
import { Asset, Track } from '../types';

const clip = (start: number, duration: number, extra: object = {}) =>
  T.newClip({ kind: 'video', name: 'c', start, duration, assetId: 'a', ...extra });
const track = (...clips: ReturnType<typeof clip>[]): Track => ({ ...T.newTrack('visual'), clips });
const asset: Asset = { id: 'a', kind: 'video', name: 'a', duration: 10, width: 1920, height: 1080, hasAudio: true };

describe('split', () => {
  it('keeps the source continuous across the cut', () => {
    const c = clip(2, 6, { offset: 1, speed: 2 });
    const [a, b] = T.splitClip(c, 4, 30)!;
    expect(a.start).toBe(2);
    expect(a.duration).toBe(2);
    expect(b.start).toBe(4);
    expect(b.duration).toBe(4);
    expect(b.offset).toBe(1 + 2 * 2);
    expect(b.id).not.toBe(a.id);
  });
  it('refuses a cut that leaves less than a frame', () => {
    const c = clip(0, 1);
    expect(T.splitClip(c, 0, 30)).toBeNull();
    expect(T.splitClip(c, 1, 30)).toBeNull();
    expect(T.splitClip(c, 0.01, 30)).toBeNull();
  });
  it('does not carry fades or animations across the cut', () => {
    const c = clip(0, 4, { fadeIn: 1, fadeOut: 1, animIn: { kind: 'fade', duration: 1 }, animOut: { kind: 'fade', duration: 1 } });
    const [a, b] = T.splitClip(c, 2, 30)!;
    expect(a.fadeIn).toBe(1);
    expect(a.fadeOut).toBe(0);
    expect(a.animOut.kind).toBe('none');
    expect(b.fadeIn).toBe(0);
    expect(b.fadeOut).toBe(1);
    expect(b.animIn.kind).toBe('none');
  });
});

describe('trim', () => {
  it('moves the source offset when the start is trimmed', () => {
    const c = T.trimStart(clip(2, 4, { offset: 3 }), 3, 0, 30);
    expect(c.start).toBe(3);
    expect(c.duration).toBe(3);
    expect(c.offset).toBe(4);
  });
  it('cannot extend the start before the source begins', () => {
    const c = T.trimStart(clip(5, 4, { offset: 1 }), 0, 0, 30);
    expect(c.start).toBe(4);
    expect(c.offset).toBe(0);
    expect(c.duration).toBe(5);
  });
  it('cannot extend the start into the previous clip', () => {
    const c = T.trimStart(clip(5, 4, { offset: 5 }), 0, 3, 30);
    expect(c.start).toBe(3);
  });
  it('cannot extend the end past the source or the next clip', () => {
    expect(T.trimEnd(clip(0, 4, { offset: 2 }), 100, Infinity, 30, asset).duration).toBe(8);
    expect(T.trimEnd(clip(0, 4), 100, 6, 30, asset).duration).toBe(6);
  });
  it('accounts for speed when extending the end', () => {
    expect(T.trimEnd(clip(0, 1, { speed: 2 }), 100, Infinity, 30, asset).duration).toBe(5);
  });
  it('never trims below one frame', () => {
    expect(T.trimEnd(clip(0, 4), -5, Infinity, 30, asset).duration).toBeCloseTo(1 / 30);
    expect(T.trimStart(clip(0, 4), 99, 0, 30).duration).toBeCloseTo(1 / 30);
  });
  it('lets stills and text grow freely', () => {
    const still = T.newClip({ kind: 'image', name: 'i', start: 0, duration: 5 });
    expect(T.trimEnd(still, 60, Infinity, 30).duration).toBe(60);
  });
});

describe('placement', () => {
  it('keeps a free position', () => {
    expect(T.findFreeStart(track(clip(0, 2)), 5, 2)).toBe(5);
  });
  it('pushes an overlapping drop to the nearest gap', () => {
    const tr = track(clip(0, 4), clip(6, 4));
    expect(T.findFreeStart(tr, 3.5, 2)).toBe(4);
    expect(T.findFreeStart(tr, 5, 2)).toBe(4);
    expect(T.findFreeStart(tr, 5, 3)).toBe(10);
  });
  it('ignores the clip being moved', () => {
    const a = clip(0, 4);
    expect(T.findFreeStart(track(a), 1, 4, a.id)).toBe(1);
  });
  it('never returns a negative start', () => {
    expect(T.findFreeStart(track(clip(0.5, 4)), 0, 2)).toBe(4.5);
  });
});

describe('ripple delete', () => {
  it('closes the gap on that track', () => {
    const a = clip(0, 2);
    const b = clip(2, 3);
    const c = clip(6, 1);
    const tr = track(a, b, c);
    T.rippleDelete(tr, new Set([b.id]));
    expect(tr.clips.map((x) => x.start)).toEqual([0, 3]);
  });
});

describe('speed', () => {
  it('keeps the same source span and pushes later clips', () => {
    const a = clip(0, 4);
    const b = clip(4, 2);
    const tr = track(a, b);
    T.setSpeed(tr, a.id, 0.5);
    expect(tr.clips[0].duration).toBe(8);
    expect(tr.clips[1].start).toBe(8);
    T.setSpeed(tr, a.id, 2);
    expect(tr.clips[0].duration).toBe(2);
    expect(tr.clips[1].start).toBe(8);
  });
});

describe('snapping', () => {
  it('snaps within the threshold only', () => {
    expect(T.snapTime(4.05, [0, 4], 0.1)).toEqual({ t: 4, hit: 4 });
    expect(T.snapTime(4.5, [0, 4], 0.1)).toEqual({ t: 4.5, hit: null });
  });
});

describe('silence removal', () => {
  const peaks = (pattern: [number, number][], rate = 100) => {
    const total = pattern.reduce((s, [d]) => s + d, 0);
    const out = new Float32Array(Math.round(total * rate));
    let i = 0;
    for (const [d, level] of pattern) for (let k = 0; k < Math.round(d * rate); k++) out[i++] = level;
    return out;
  };
  it('keeps loud ranges with a little padding', () => {
    const keep = T.detectKeepRanges(peaks([[1, 0.8], [2, 0], [1, 0.8]]), 100, { pad: 0.1 });
    expect(keep.length).toBe(2);
    expect(keep[0][0]).toBe(0);
    expect(keep[0][1]).toBeCloseTo(1.1);
    expect(keep[1][0]).toBeCloseTo(2.9);
    expect(keep[1][1]).toBeCloseTo(4);
  });
  it('ignores short pauses', () => {
    expect(T.detectKeepRanges(peaks([[1, 0.8], [0.2, 0], [1, 0.8]]), 100).length).toBe(1);
  });
  it('drops leading and trailing silence completely', () => {
    const keep = T.detectKeepRanges(peaks([[1, 0], [1, 0.8], [1, 0]]), 100, { pad: 0.1 });
    expect(keep.length).toBe(1);
    expect(keep[0][0]).toBeCloseTo(0.9);
    expect(keep[0][1]).toBeCloseTo(2.1);
  });
  it('cuts a clip into back-to-back pieces', () => {
    const c = clip(10, 4, { fadeIn: 0.5, fadeOut: 0.5 });
    const pieces = T.cutToRanges(c, [[0, 1], [3, 4]], 30);
    expect(pieces.length).toBe(2);
    expect(pieces[0].start).toBe(10);
    expect(pieces[0].duration).toBeCloseTo(1);
    expect(pieces[1].start).toBeCloseTo(11);
    expect(pieces[1].offset).toBe(3);
    expect(pieces[0].fadeIn).toBe(0.5);
    expect(pieces[0].fadeOut).toBe(0);
    expect(pieces[1].fadeOut).toBe(0.5);
  });
  it('returns the same clip when there is nothing to cut', () => {
    const c = clip(0, 4);
    expect(T.cutToRanges(c, [[0, 10]], 30)[0]).toBe(c);
  });
  it('ripples later clips after a cut', () => {
    const a = clip(0, 4);
    const b = clip(4, 2);
    const tr = track(a, b);
    T.replaceWithRipple(tr, a.id, T.cutToRanges(a, [[0, 1], [3, 4]], 30));
    expect(tr.clips.length).toBe(3);
    expect(tr.clips[2].start).toBeCloseTo(2);
  });
});

describe('tracks', () => {
  it('keeps one visual and one audio track when everything is empty', () => {
    const p = T.newProject('x');
    p.tracks.unshift(T.newTrack('visual'));
    p.tracks.push(T.newTrack('audio'));
    T.pruneTracks(p);
    expect(p.tracks.map((t) => t.kind)).toEqual(['visual', 'audio']);
  });
  it('drops only the empty ones', () => {
    const p = T.newProject('x');
    const top = T.newTrack('visual');
    top.clips.push(clip(0, 1));
    p.tracks.unshift(top);
    T.pruneTracks(p);
    expect(p.tracks.filter((t) => t.kind === 'visual')).toEqual([top]);
  });
});

describe('fades and time', () => {
  it('ramps volume at both ends', () => {
    const c = clip(10, 4, { fadeIn: 2, fadeOut: 1 });
    expect(T.fadeGain(c, 10)).toBe(0);
    expect(T.fadeGain(c, 11)).toBe(0.5);
    expect(T.fadeGain(c, 12.5)).toBe(1);
    expect(T.fadeGain(c, 13.5)).toBe(0.5);
  });
  it('formats timecode', () => {
    expect(T.formatTime(61.5, 30)).toBe('01:01:15');
  });
});
