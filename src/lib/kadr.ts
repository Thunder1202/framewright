import { HeardLine } from './captions';

/**
 * Talks to Kadr, the captions engine in the kadr/ folder (Python, runs on this
 * computer only). The desktop app starts it by itself; in a browser it has to be
 * started with StartKadr.bat. Nothing here leaves the machine.
 */

interface Shell {
  startKadr(): Promise<{ ok: boolean; url?: string; error?: string }>;
  openKadr(): Promise<{ ok: boolean; url?: string; error?: string }>;
}
declare global {
  interface Window {
    framewright?: Shell;
  }
}

const DEFAULT_URL = 'http://127.0.0.1:8000';
const NOT_RUNNING = 'The captions engine is not running. Double-click StartKadr.bat in the kadr folder, wait for it to start, then try again.';
const EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.3gp'];

export type SpokenLanguage = 'auto' | 'uz' | 'ru' | 'en';

/** Make sure the engine is up. Resolves to its address; throws a sentence the user can read. */
export async function connect(): Promise<string> {
  if (window.framewright) {
    const r = await window.framewright.startKadr();
    if (!r.ok || !r.url) throw new Error(r.error ?? NOT_RUNNING);
    return r.url;
  }
  try {
    const r = await fetch(`${DEFAULT_URL}/api/info`);
    if (r.ok) return DEFAULT_URL;
  } catch {
    /* fall through */
  }
  throw new Error(NOT_RUNNING);
}

/** Open Kadr's own page: word-by-word caption editing and its burned-in caption styles. */
export async function openKadrPage(): Promise<void> {
  if (window.framewright) {
    const r = await window.framewright.openKadr();
    if (!r.ok) throw new Error(r.error ?? NOT_RUNNING);
    return;
  }
  await connect();
  window.open(DEFAULT_URL.replace('127.0.0.1', 'localhost'), '_blank', 'noopener');
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new Error('Lost contact with the captions engine.');
  }
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(body.error ?? 'The captions engine could not do that.');
  return body as T;
}

interface Job {
  status: 'queued' | 'processing' | 'ready' | 'exporting' | 'error';
  stage: string;
  progress: number;
  error: string;
}

/**
 * Listen to a video file and return caption lines with a time for every word.
 * Times are seconds from the start of the file.
 */
export async function transcribe(
  blob: Blob,
  name: string,
  language: SpokenLanguage,
  onProgress: (stage: string, ratio: number) => void,
): Promise<HeardLine[]> {
  const base = await connect();
  let fileName = name.replace(/[\\/]/g, '_');
  if (!EXTENSIONS.some((e) => fileName.toLowerCase().endsWith(e))) fileName += blob.type.includes('webm') ? '.webm' : '.mp4';
  const form = new FormData();
  form.append('files', new File([blob], fileName, { type: blob.type || 'video/mp4' }));
  form.append('language', language);
  onProgress('Sending the video to the captions engine', 0);
  const made = await call<{ jobs: string[]; problems: string[] }>(`${base}/api/jobs`, { method: 'POST', body: form });
  const id = made.jobs[0];
  if (!id) throw new Error(made.problems[0] ?? 'The captions engine refused that file.');
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = await call<Job>(`${base}/api/jobs/${id}`);
      if (job.status === 'error') throw new Error(job.error || 'The captions engine could not read that video.');
      if (job.status === 'ready') break;
      onProgress(job.stage || 'Listening', job.progress || 0);
    }
    const got = await call<{ lines: HeardLine[] }>(`${base}/api/jobs/${id}/captions`);
    return got.lines;
  } finally {
    // the editor keeps the captions itself; do not leave a second copy of the video behind
    void fetch(`${base}/api/jobs/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/** Translate texts between English and Russian, offline. Same order back. */
export async function translate(texts: string[], source: 'en' | 'ru', target: 'en' | 'ru'): Promise<string[]> {
  const base = await connect();
  const got = await call<{ texts: string[] }>(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, source, target }),
  });
  return got.texts;
}
