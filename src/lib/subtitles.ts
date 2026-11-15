/** Subtitle file parsing (SRT and WebVTT). Pure, so it is unit tested. */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

// 00:01:02,345  or  01:02.345  (hours optional, comma or dot before the milliseconds)
const STAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/;
const ARROW = new RegExp(String.raw`${STAMP.source}\s*-->\s*${STAMP.source}`);

function seconds(h: string | undefined, m: string, s: string, ms: string | undefined): number {
  return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number((ms ?? '0').padEnd(3, '0')) / 1000;
}

export function parseSubtitles(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const m = ARROW.exec(lines[at]);
    if (!m) continue;
    const start = seconds(m[1], m[2], m[3], m[4]);
    const end = seconds(m[5], m[6], m[7], m[8]);
    const text = lines
      .slice(at + 1)
      .join('\n')
      // styling tags such as <i> or {\an8} are dropped; the words are kept
      .replace(/<[^>]*>|\{\\[^}]*\}/g, '')
      .trim();
    if (!text || !(end > start)) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}
