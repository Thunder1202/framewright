import { Clip, TimedWord } from '../types';
import { Cue } from './subtitles';
import { clipEnd, snapFrame } from './timeline';

/**
 * Captions made from speech. The captions engine (kadr/) hears a whole source file
 * and returns lines with a time for every word; this turns them into caption
 * pieces placed where the clip sits on the timeline. Pure, unit tested.
 */

export interface HeardWord {
  word: string;
  start: number;
  end: number;
}
export interface HeardLine {
  start: number;
  end: number;
  text: string;
  words: HeardWord[];
}

export interface CaptionPiece {
  start: number;
  duration: number;
  text: string;
  /** word times counted from the piece's own start */
  words: TimedWord[];
}

/** Why a clip cannot be captioned as it is, or null when it can. */
export function captionBlocker(clip: Clip): string | null {
  if (clip.kind !== 'video' || !clip.assetId) return 'Select a video clip that has speech in it';
  if (clip.reversed || (clip.ramp && clip.ramp !== 'none')) return 'Make captions first, then reverse or speed-shape the clip';
  return null;
}

/**
 * Heard lines are in source time. Keep the ones the clip actually shows and move
 * them to where the clip is, allowing for its trim and speed. Never overlapping.
 */
export function piecesForClip(lines: HeardLine[], clip: Clip, fps: number): CaptionPiece[] {
  const toTimeline = (s: number) => clip.start + (s - clip.offset) / clip.speed;
  const frame = 1 / fps;
  const out: CaptionPiece[] = [];
  let last = clip.start;
  for (const line of [...lines].sort((a, b) => a.start - b.start)) {
    const text = line.text.trim();
    if (!text) continue;
    const mid = toTimeline((line.start + line.end) / 2);
    if (mid < clip.start || mid >= clipEnd(clip)) continue;
    const start = Math.max(last, snapFrame(Math.max(clip.start, toTimeline(line.start)), fps));
    const end = snapFrame(Math.min(clipEnd(clip), toTimeline(line.end)), fps);
    if (end - start < frame - 1e-6) continue;
    const words = (line.words ?? []).map((w) => ({ w: w.word, s: toTimeline(w.start) - start, e: toTimeline(w.end) - start }));
    out.push({ start, duration: end - start, text, words: wordsFit(text, words) ? words : [] });
    last = end;
  }
  return out;
}

/** Word times only make sense while the text still has the same words in the same order. */
export function wordsFit(text: string, words: TimedWord[] | undefined): words is TimedWord[] {
  if (!words?.length) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.length === words.length && tokens.every((t, i) => t === words[i].w);
}

/** Index of the word being spoken at `local` seconds into the clip, or -1. */
export function spokenWord(words: TimedWord[], local: number): number {
  for (let i = 0; i < words.length; i++) {
    // hold the highlight through the small gap before the next word
    const until = i + 1 < words.length ? Math.max(words[i].e, words[i + 1].s) : words[i].e;
    if (local >= words[i].s && local < until) return i;
  }
  return -1;
}

/** Change the text of a caption and each of its words the same way (alphabet conversion). */
export function mapCaptionText(clip: Clip, fn: (s: string) => string): void {
  if (!clip.text) return;
  const had = wordsFit(clip.text.content, clip.text.words);
  clip.text.content = fn(clip.text.content);
  if (clip.text.words) {
    const next = clip.text.words.map((w) => ({ ...w, w: fn(w.w) }));
    // if the conversion changed the word count, the timings no longer apply
    clip.text.words = had && wordsFit(clip.text.content, next) ? next : undefined;
  }
}

/**
 * Keep captions inside the picture. A line wider than `max` is broken into two
 * rows of about the same width; `shrink` is how much smaller all captions must
 * then be drawn for the widest row to fit (1 = no change, never under 0.5).
 * `measure` gives the width of a string at the size the captions start at.
 */
export function fitLines(texts: string[], measure: (s: string) => number, max: number): { texts: string[]; shrink: number } {
  let widest = 0;
  const out = texts.map((text) => {
    const words = text.split(/\s+/).filter(Boolean);
    const whole = measure(words.join(' '));
    if (whole <= max || words.length < 2) {
      widest = Math.max(widest, whole);
      return words.join(' ');
    }
    let best = 1;
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const w = Math.max(measure(words.slice(0, i).join(' ')), measure(words.slice(i).join(' ')));
      if (w < bestW) {
        bestW = w;
        best = i;
      }
    }
    widest = Math.max(widest, bestW);
    return words.slice(0, best).join(' ') + '\n' + words.slice(best).join(' ');
  });
  return { texts: out, shrink: widest > max ? Math.max(0.5, max / widest) : 1 };
}

const stamp = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** A standard .srt subtitle file. */
export function toSrt(cues: Cue[]): string {
  return [...cues]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
}
