import { describe, expect, it } from 'vitest';
import { parseSubtitles } from './subtitles';
import { applyChroma } from './chroma';
import { newClip, newProject, snapPoints } from './timeline';

describe('parseSubtitles', () => {
  it('reads SRT cues with numbers, commas and several lines', () => {
    const cues = parseSubtitles('1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\nthere\r\n\r\n2\r\n00:01:00,250 --> 00:01:03,000\r\n<i>Second</i>\r\n');
    expect(cues).toEqual([
      { start: 1, end: 2.5, text: 'Hello\nthere' },
      { start: 60.25, end: 63, text: 'Second' },
    ]);
  });

  it('reads WebVTT without hours and ignores the header', () => {
    const cues = parseSubtitles('WEBVTT\n\nNOTE made by hand\n\n00:03.500 --> 00:05.000 align:center\nShort one\n');
    expect(cues).toEqual([{ start: 3.5, end: 5, text: 'Short one' }]);
  });

  it('drops empty and backwards cues and sorts by start', () => {
    const cues = parseSubtitles('00:00:05,000 --> 00:00:06,000\nB\n\n00:00:01,000 --> 00:00:02,000\nA\n\n00:00:09,000 --> 00:00:08,000\nbad\n\n00:00:10,000 --> 00:00:11,000\n\n');
    expect(cues.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('returns nothing for a file that is not subtitles', () => {
    expect(parseSubtitles('just some words\n\nand more')).toEqual([]);
  });
});

describe('applyChroma', () => {
  const px = (...rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap((c) => [...c, 255]));
  const chroma = { on: true, color: '#00d000', tolerance: 40, softness: 20 };

  it('clears the backdrop, including a darker shade of it, and keeps the subject', () => {
    const data = px([0, 208, 0], [10, 150, 20], [200, 60, 50], [255, 255, 255], [20, 20, 20]);
    applyChroma(data, chroma);
    expect([data[3], data[7]]).toEqual([0, 0]);
    expect([data[11], data[15], data[19]]).toEqual([255, 255, 255]);
    expect(Array.from(data.slice(8, 11))).toEqual([200, 60, 50]);
  });

  it('keys nothing at zero tolerance except the exact colour', () => {
    const data = px([0, 208, 0], [40, 180, 40]);
    applyChroma(data, { ...chroma, tolerance: 0, softness: 0 });
    expect(data[3]).toBe(0);
    expect(data[7]).toBeGreaterThan(0);
  });
});

describe('markers', () => {
  it('are snap points', () => {
    const p = newProject('t');
    p.tracks[0].clips.push(newClip({ kind: 'image', name: 'a', start: 1, duration: 2 }));
    p.markers = [{ id: 'm', time: 7.5 }];
    expect(snapPoints(p, null, 0)).toContain(7.5);
  });
});
