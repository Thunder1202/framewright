import { describe, expect, it } from 'vitest';
import { keyTimes, propAt, resolveClip, setProp, toggleKey } from './keyframes';
import { rampPos, rampRate, rateAt, RAMPS, sourcePos } from './ramp';
import { corrections, estimateShift, STAB_H, STAB_W } from './stabilise';
import { newClip, setSpeed, splitClip, trimEnd, trimStart, newTrack } from './timeline';

const video = (over = {}) => newClip({ kind: 'video', assetId: 'a', name: 'v', start: 10, duration: 4, offset: 2, ...over });

describe('keyframes', () => {
  it('leaves a clip alone until a key is added', () => {
    const c = video({ x: 0.2 });
    expect(resolveClip(c, 11)).toBe(c);
    setProp(c, 'x', 0.3, 1, 30);
    expect(c.x).toBe(0.3);
    expect(c.keys).toBeUndefined();
  });

  it('glides between keys and holds outside them', () => {
    const c = video();
    toggleKey(c, 'x', 1, 30);
    setProp(c, 'x', 0.4, 3, 30);
    expect(c.keys!.x).toEqual([
      { t: 1, v: 0 },
      { t: 3, v: 0.4 },
    ]);
    expect(propAt(c, 'x', 0)).toBe(0);
    expect(propAt(c, 'x', 2)).toBeCloseTo(0.2);
    expect(propAt(c, 'x', 9)).toBe(0.4);
    // eased, so a quarter of the way in time is less than a quarter of the way in distance
    expect(propAt(c, 'x', 1.5)).toBeLessThan(0.1);
    expect(resolveClip(c, 12).x).toBeCloseTo(0.2);
    expect(resolveClip(c, 12).y).toBe(0);
  });

  it('edits the key under the playhead instead of adding a second one', () => {
    const c = video();
    toggleKey(c, 'scale', 2, 30);
    setProp(c, 'scale', 1.5, 2.01, 30);
    expect(c.keys!.scale).toEqual([{ t: 2, v: 1.5 }]);
  });

  it('removing the last key fixes the value where it was', () => {
    const c = video();
    toggleKey(c, 'opacity', 1, 30);
    setProp(c, 'opacity', 0.25, 1, 30);
    toggleKey(c, 'opacity', 1, 30);
    expect(c.keys!.opacity).toBeUndefined();
    expect(c.opacity).toBe(0.25);
    expect(resolveClip(c, 11)).toBe(c);
  });

  it('survives a split: both halves look the same as before at every moment', () => {
    const c = video();
    toggleKey(c, 'x', 0, 30);
    setProp(c, 'x', 0.4, 4, 30);
    const [a, b] = splitClip(c, 12, 30)!;
    for (const t of [10.5, 11.9]) expect(resolveClip(a, t).x).toBeCloseTo(resolveClip(c, t).x);
    for (const t of [12, 13.2]) expect(resolveClip(b, t).x).toBeCloseTo(resolveClip(c, t).x);
  });

  it('survives trimming the start and changing speed', () => {
    const c = video();
    toggleKey(c, 'x', 2, 30);
    const trimmed = trimStart(c, 11, 0, 30);
    expect(trimmed.keys!.x![0].t).toBeCloseTo(1);
    expect(c.keys!.x![0].t).toBe(2);
    const track = newTrack('visual');
    track.clips.push(c);
    setSpeed(track, c.id, 2);
    expect(c.duration).toBeCloseTo(2);
    expect(c.keys!.x![0].t).toBeCloseTo(1);
    expect(keyTimes(c)).toEqual([1]);
  });
});

describe('speed ramps', () => {
  it('every ramp starts at the start, ends at the end, and never runs backwards', () => {
    for (const { id } of RAMPS) {
      expect(rampPos(id, 0)).toBeCloseTo(0);
      expect(rampPos(id, 1)).toBeCloseTo(1);
      let prev = 0;
      for (let i = 1; i <= 50; i++) {
        const v = rampPos(id, i / 50);
        expect(v).toBeGreaterThan(prev);
        expect(rampRate(id, i / 50)).toBeGreaterThan(0);
        prev = v;
      }
    }
  });

  it('keeps the clip length and source span, only bending the middle', () => {
    const plain = video();
    const ramped = video({ ramp: 'speed-up' });
    expect(sourcePos(ramped, 0)).toBeCloseTo(sourcePos(plain, 0));
    expect(sourcePos(ramped, 4)).toBeCloseTo(sourcePos(plain, 4));
    expect(sourcePos(ramped, 2)).toBeLessThan(sourcePos(plain, 2));
    expect(rateAt(ramped, 0)).toBeLessThan(rateAt(ramped, 4));
  });

  it('a plain clip is untouched', () => {
    expect(sourcePos(video({ speed: 2 }), 1)).toBe(4);
    expect(rateAt(video({ speed: 2 }), 1)).toBe(2);
  });
});

describe('reverse', () => {
  it('shows the end of the source first', () => {
    const c = video({ reversed: true });
    expect(sourcePos(c, 0)).toBeCloseTo(6);
    expect(sourcePos(c, 4)).toBeCloseTo(2);
    expect(sourcePos(c, 1)).toBeCloseTo(5);
  });

  it('splits so each half keeps the footage it was showing', () => {
    const c = video({ reversed: true });
    const [a, b] = splitClip(c, 11, 30)!;
    expect([a.offset, a.duration, a.reversed]).toEqual([5, 1, true]);
    expect([b.offset, b.duration, b.reversed]).toEqual([2, 3, true]);
    expect(sourcePos(a, 1)).toBeCloseTo(sourcePos(b, 0));
    expect(sourcePos(b, 3)).toBeCloseTo(2);
  });

  it('splitting a ramped clip does not jump at the cut', () => {
    const c = video({ ramp: 'hero' });
    const [a, b] = splitClip(c, 11.5, 30)!;
    expect(sourcePos(a, a.duration)).toBeCloseTo(sourcePos(c, 1.5));
    expect(sourcePos(b, 0)).toBeCloseTo(sourcePos(c, 1.5));
    expect(sourcePos(b, b.duration)).toBeCloseTo(sourcePos(c, 4));
    expect(a.ramp).toBe('none');
  });

  it('trims from the right ends of the source', () => {
    const c = video({ reversed: true });
    // pulling the end edge in drops the start of the source
    const e = trimEnd(c, 13, Infinity, 30);
    expect([e.duration, e.offset]).toEqual([3, 3]);
    expect(sourcePos(e, 0)).toBeCloseTo(6);
    // pulling the start edge in drops the end of the source
    const s = trimStart(c, 11, 0, 30);
    expect([s.start, s.duration, s.offset]).toEqual([11, 3, 2]);
    expect(sourcePos(s, 0)).toBeCloseTo(5);
    // the end edge cannot be dragged out past the start of the source
    expect(trimEnd(c, 99, Infinity, 30).offset).toBe(0);
  });
});

describe('stabilise', () => {
  // a busy pattern, so there is something to lock on to
  const frame = (ox: number, oy: number) => {
    const out = new Uint8Array(STAB_W * STAB_H);
    for (let y = 0; y < STAB_H; y++)
      for (let x = 0; x < STAB_W; x++) {
        const u = x - ox;
        const v = y - oy;
        out[y * STAB_W + x] = (Math.sin(u * 0.7) * Math.cos(v * 0.5) * 60 + Math.sin(u * 0.13 + v * 0.21) * 60 + 128) | 0;
      }
    return out;
  };

  it('measures how far the picture slid', () => {
    expect(estimateShift(frame(0, 0), frame(3, -2))).toEqual({ dx: 3, dy: -2 });
    expect(estimateShift(frame(5, 5), frame(1, 6))).toEqual({ dx: -4, dy: 1 });
  });

  it('reads a still or featureless picture as not moving', () => {
    expect(estimateShift(frame(2, 2), frame(2, 2))).toEqual({ dx: 0, dy: 0 });
    const flat = new Uint8Array(STAB_W * STAB_H).fill(90);
    expect(estimateShift(flat, flat)).toEqual({ dx: 0, dy: 0 });
  });

  it('cancels a wobble but follows a steady pan', () => {
    const wobble = corrections([2, -2, 2, -2, 2, -2, 2, -2], 4);
    // path is 0,2,0,2,...: after correcting, every frame sits near the middle
    const path = [0, 2, 0, 2, 0, 2, 0, 2, 0];
    const fixed = path.map((p, i) => p + wobble[i]);
    expect(Math.max(...fixed.slice(2, 7)) - Math.min(...fixed.slice(2, 7))).toBeLessThan(0.5);
    // a pan of one pixel per frame needs no correction away from the ends
    const pan = corrections([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 2);
    for (const c of pan.slice(2, -2)) expect(c).toBeCloseTo(0);
  });
});
