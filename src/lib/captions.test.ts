import { describe, expect, it } from 'vitest';
import { captionBlocker, fitLines, HeardLine, mapCaptionText, piecesForClip, spokenWord, toSrt, wordsFit } from './captions';
import { parseSubtitles } from './subtitles';
import { newClip, splitClip, trimStart } from './timeline';
import { toCyrillic, toLatin } from './translit';
import { CASES as cases } from './translit.cases';
import { DEFAULT_TEXT } from '../types';

const video = (over = {}) => newClip({ kind: 'video', assetId: 'a', name: 'v', start: 10, duration: 4, offset: 2, ...over });
const line = (start: number, words: string[], each = 0.5): HeardLine => ({
  start,
  end: start + words.length * each,
  text: words.join(' '),
  words: words.map((word, i) => ({ word, start: start + i * each, end: start + (i + 1) * each })),
});

describe('Uzbek alphabets: the same answers as the kadr engine', () => {
  it('converts both ways and back again', () => {
    expect(cases.ROUND_TRIP.length).toBeGreaterThan(50);
    for (const [latin, cyrillic] of cases.ROUND_TRIP) {
      expect(toCyrillic(latin)).toBe(cyrillic);
      expect(toLatin(cyrillic)).toBe(latin);
    }
  });

  it('handles typed apostrophes, loan words and mixed text', () => {
    for (const [source, expected] of cases.TO_CYRILLIC_ONLY) expect(toCyrillic(source)).toBe(expected);
    for (const [source, expected] of cases.TO_LATIN_ONLY) expect(toLatin(source)).toBe(expected);
  });
});

describe('captions from speech', () => {
  it('places heard lines where the clip is, allowing for its trim', () => {
    // the clip shows source 2s-6s at timeline 10s-14s
    const pieces = piecesForClip([line(0, ['too', 'early']), line(3, ['salom', 'dunyo']), line(9, ['too', 'late'])], video(), 30);
    expect(pieces).toHaveLength(1);
    expect([pieces[0].start, pieces[0].duration, pieces[0].text]).toEqual([11, 1, 'salom dunyo']);
    expect(pieces[0].words).toEqual([
      { w: 'salom', s: 0, e: 0.5 },
      { w: 'dunyo', s: 0.5, e: 1 },
    ]);
  });

  it('follows the clip speed and never overlaps', () => {
    const fast = video({ speed: 2, duration: 2 }); // source 2s-6s in 2 seconds
    const pieces = piecesForClip([line(2, ['bir', 'ikki']), line(2.8, ['uch', 'tort'])], fast, 30);
    expect(pieces[0].start).toBe(10);
    expect(pieces[0].duration).toBeCloseTo(0.5);
    expect(pieces[1].start).toBeCloseTo(pieces[0].start + pieces[0].duration);
    expect(pieces[0].words[1].e).toBeCloseTo(0.5);
  });

  it('refuses clips it cannot map', () => {
    expect(captionBlocker(video())).toBeNull();
    expect(captionBlocker(video({ reversed: true }))).toMatch(/reverse/);
    expect(captionBlocker(newClip({ kind: 'image', name: 'i', start: 0, duration: 1 }))).toMatch(/video/);
  });

  it('knows which word is being spoken', () => {
    const words = [
      { w: 'a', s: 0, e: 0.4 },
      { w: 'b', s: 0.5, e: 1 },
    ];
    expect(spokenWord(words, 0.2)).toBe(0);
    expect(spokenWord(words, 0.45)).toBe(0); // held through the gap
    expect(spokenWord(words, 0.7)).toBe(1);
    expect(spokenWord(words, 1.2)).toBe(-1);
  });

  it('keeps word times through a split and a trim', () => {
    const c = newClip({
      kind: 'text',
      name: 'Caption',
      start: 10,
      duration: 2,
      text: { ...DEFAULT_TEXT, content: 'a b', words: [{ w: 'a', s: 0, e: 1 }, { w: 'b', s: 1, e: 2 }] },
    });
    const [, b] = splitClip(c, 11, 30)!;
    expect(b.text!.words![1]).toEqual({ w: 'b', s: 0, e: 1 });
    expect(c.text!.words![1].s).toBe(1);
    expect(trimStart(c, 10.5, 0, 30).text!.words![1].s).toBeCloseTo(0.5);
  });

  it('converts the alphabet of a caption and its words together, and drops word times when the text was rewritten', () => {
    const c = newClip({
      kind: 'text',
      name: 'Caption',
      start: 0,
      duration: 1,
      text: { ...DEFAULT_TEXT, content: 'salom do‘stlar', words: [{ w: 'salom', s: 0, e: 0.5 }, { w: 'do‘stlar', s: 0.5, e: 1 }] },
    });
    mapCaptionText(c, toCyrillic);
    expect(c.text!.content).toBe('салом дўстлар');
    expect(wordsFit(c.text!.content, c.text!.words)).toBe(true);
    c.text!.content = 'something else entirely';
    expect(wordsFit(c.text!.content, c.text!.words)).toBe(false);
  });

  it('breaks a long line into two balanced rows and shrinks only when it must', () => {
    const measure = (s: string) => s.length * 10; // every character 10 wide
    const fit = fitLines(['short', 'one two three four five six', 'unbreakablyverylongword'], measure, 150);
    expect(fit.texts[0]).toBe('short');
    expect(fit.texts[1]).toBe('one two three\nfour five six');
    // the single long word is 230 wide and cannot be broken, so everything shrinks to fit it
    expect(fit.shrink).toBeCloseTo(150 / 230);
    expect(fitLines(['a b'], measure, 150).shrink).toBe(1);
    // the words stay the same, so word highlighting still lines up
    expect(wordsFit(fit.texts[1], 'one two three four five six'.split(' ').map((w) => ({ w, s: 0, e: 1 })))).toBe(true);
  });

  it('writes an .srt file that reads back the same', () => {
    const cues = [
      { start: 3661.5, end: 3663, text: 'Second' },
      { start: 1, end: 2.25, text: 'First' },
    ];
    const srt = toSrt(cues);
    expect(srt.startsWith('1\n00:00:01,000 --> 00:00:02,250\nFirst\n')).toBe(true);
    expect(srt).toContain('01:01:01,500 --> 01:01:03,000');
    expect(parseSubtitles(srt)).toEqual([cues[1], cues[0]]);
  });
});
