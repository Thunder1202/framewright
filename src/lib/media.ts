import { Asset, AssetKind, Project } from '../types';
import { loadMediaBlob, saveMedia } from './db';
import { uid } from './timeline';

/** Imported media: blobs, object URLs, decoded images and audio peaks, all kept in memory per open project. */

export const PEAK_RATE = 100; // peaks per second
const MAX_DECODE_BYTES = 1.5 * 1024 * 1024 * 1024;

const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();
const peaks = new Map<string, Float32Array | null>();
const peakJobs = new Map<string, Promise<Float32Array | null>>();
const listeners = new Set<() => void>();

export function onMediaChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const emit = () => listeners.forEach((l) => l());

export const mediaUrl = (assetId: string) => urls.get(assetId);
export const mediaBlob = (assetId: string) => blobs.get(assetId);
export const getImage = (assetId: string) => {
  const img = images.get(assetId);
  return img && img.complete && img.naturalWidth ? img : null;
};
export const getPeaks = (assetId: string) => peaks.get(assetId) ?? null;

function register(asset: Asset, blob: Blob) {
  blobs.set(asset.id, blob);
  const url = URL.createObjectURL(blob);
  urls.set(asset.id, url);
  if (asset.kind === 'image') {
    const img = new Image();
    img.onload = emit;
    img.src = url;
    images.set(asset.id, img);
  }
}

export function unloadAll() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  blobs.clear();
  urls.clear();
  images.clear();
  peaks.clear();
  peakJobs.clear();
}

/** Load every asset of a project from storage. Returns the ids that could not be found. */
export async function loadProjectMedia(p: Project): Promise<string[]> {
  unloadAll();
  const missing: string[] = [];
  for (const a of p.assets) {
    const blob = await loadMediaBlob(a.id);
    if (!blob) {
      missing.push(a.id);
      continue;
    }
    register(a, blob);
    if (a.kind !== 'image' && a.hasAudio) void ensurePeaks(a.id);
  }
  emit();
  return missing;
}

const EXT: Record<string, AssetKind> = {
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', mkv: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio', opus: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image', svg: 'image',
};

export function kindOf(file: { type: string; name: string }): AssetKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT[ext] ?? null;
}

function once(target: EventTarget, ok: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timed out'));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('could not be decoded'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(ok, onOk);
      target.removeEventListener('error', onErr);
    };
    target.addEventListener(ok, onOk);
    target.addEventListener('error', onErr);
  });
}

async function realDuration(el: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(el.duration)) return el.duration;
  // recorded files often report Infinity until you seek past the end
  const p = once(el, 'durationchange', 4000).catch(() => {});
  el.currentTime = 1e7;
  await p;
  const d = Number.isFinite(el.duration) ? el.duration : 0;
  el.currentTime = 0;
  return d;
}

function thumbFrom(source: CanvasImageSource, sw: number, sh: number): string | undefined {
  if (!sw || !sh) return undefined;
  const w = 240;
  const h = Math.max(1, Math.round((sh / sw) * w));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, w, h);
  try {
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}

function releaseElement(el: HTMLMediaElement) {
  el.pause();
  el.removeAttribute('src');
  el.load();
}

/** Probe a file, store it, and return its asset record. Throws with a readable message if unusable. */
export async function importFile(file: File | Blob, name: string, forcedKind?: AssetKind): Promise<Asset> {
  const kind = forcedKind ?? kindOf({ type: file.type, name });
  if (!kind) throw new Error(`${name}: not a video, image or audio file`);
  const asset: Asset = { id: uid(), kind, name, duration: 0, width: 0, height: 0, hasAudio: kind === 'audio' };
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        throw new Error(`${name}: this image could not be decoded`);
      }
      asset.width = img.naturalWidth || 1024;
      asset.height = img.naturalHeight || 1024;
      asset.thumb = thumbFrom(img, asset.width, asset.height);
    } else if (kind === 'video') {
      const v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      v.src = url;
      try {
        await once(v, 'loadeddata');
      } catch {
        releaseElement(v);
        throw new Error(`${name}: this browser cannot decode that video (try MP4 / H.264 or WebM)`);
      }
      asset.duration = await realDuration(v);
      asset.width = v.videoWidth;
      asset.height = v.videoHeight;
      if (!asset.width || !asset.height) {
        releaseElement(v);
        throw new Error(`${name}: no video picture found in this file`);
      }
      if (!(asset.duration > 0)) {
        releaseElement(v);
        throw new Error(`${name}: could not read the length of this video`);
      }
      try {
        const p = once(v, 'seeked', 5000);
        v.currentTime = Math.min(1, asset.duration / 3);
        await p;
        asset.thumb = thumbFrom(v, asset.width, asset.height);
      } catch {
        /* thumbnail is optional */
      }
      releaseElement(v);
      asset.hasAudio = true; // corrected below once we try to decode it
    } else {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = url;
      try {
        await once(a, 'loadedmetadata');
      } catch {
        releaseElement(a);
        throw new Error(`${name}: this browser cannot decode that audio file`);
      }
      asset.duration = await realDuration(a);
      releaseElement(a);
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  register(asset, file);

  if (kind !== 'image') {
    const pk = await ensurePeaks(asset.id);
    if (kind === 'video' && file.size <= MAX_DECODE_BYTES) asset.hasAudio = !!pk;
    if (kind === 'audio') {
      if (!pk && !(asset.duration > 0)) throw dropAsset(asset.id, `${name}: could not read this audio file`);
      if (pk && !(asset.duration > 0)) asset.duration = pk.length / PEAK_RATE;
    }
  }
  await saveMedia(asset.id, file);
  emit();
  return asset;
}

function dropAsset(id: string, message: string): Error {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  blobs.delete(id);
  peaks.delete(id);
  return new Error(message);
}

/** Decode an asset's audio to 48 kHz. Null if it has none or is too big to hold in memory. */
export async function decodeAudio(assetId: string): Promise<AudioBuffer | null> {
  const blob = blobs.get(assetId);
  if (!blob || blob.size > MAX_DECODE_BYTES) return null;
  try {
    const ctx = new OfflineAudioContext(2, 1, 48000);
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export function ensurePeaks(assetId: string): Promise<Float32Array | null> {
  if (peaks.has(assetId)) return Promise.resolve(peaks.get(assetId) ?? null);
  let job = peakJobs.get(assetId);
  if (!job) {
    job = decodeAudio(assetId).then((buf) => {
      const pk = buf ? computePeaks(buf) : null;
      peaks.set(assetId, pk);
      peakJobs.delete(assetId);
      emit();
      return pk;
    });
    peakJobs.set(assetId, job);
  }
  return job;
}

function computePeaks(buf: AudioBuffer): Float32Array {
  const step = buf.sampleRate / PEAK_RATE;
  const n = Math.ceil(buf.length / step);
  const out = new Float32Array(n);
  for (let ch = 0; ch < Math.min(2, buf.numberOfChannels); ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step);
      const b = Math.min(data.length, Math.floor((i + 1) * step));
      let m = out[i];
      for (let j = a; j < b; j += 4) {
        const v = data[j] < 0 ? -data[j] : data[j];
        if (v > m) m = v;
      }
      out[i] = m;
    }
  }
  return out;
}

/** One frame of a video asset as a PNG. */
export async function grabFrame(assetId: string, time: number): Promise<Blob> {
  const url = urls.get(assetId);
  if (!url) throw new Error('source file is missing');
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  await once(v, 'loadeddata');
  const p = once(v, 'seeked', 8000);
  v.currentTime = Math.max(0, time);
  await p;
  const c = document.createElement('canvas');
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext('2d')!.drawImage(v, 0, 0);
  releaseElement(v);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('could not capture the frame'))), 'image/png'),
  );
}

/** 16-bit PCM WAV from an AudioBuffer. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const bytes = 44 + n * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
