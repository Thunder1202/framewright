import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { Clip, Project } from '../types';
import { decodeAudio, encodeWav, getImage, mediaUrl } from '../lib/media';
import { clipEnd, projectDuration } from '../lib/timeline';
import { rateAt } from '../lib/ramp';
import { drawFrame, Sources, videoLeaves } from './compose';
import { subProject } from '../lib/compound';

/**
 * Offline render. Every frame is seeked exactly, drawn by the same compositor the
 * preview uses, encoded with WebCodecs and muxed to MP4. Nothing leaves the machine.
 */

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  /** bits per pixel per frame; ~0.1 is good quality H.264 */
  quality: number;
}

export interface ExportProgress {
  stage: 'audio' | 'video' | 'finishing';
  /** 0..1 */
  ratio: number;
}

export function exportSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

const SAMPLE_RATE = 48000;

function waitFor(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(event, done);
      el.removeEventListener('error', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    el.addEventListener(event, done);
    el.addEventListener('error', done);
  });
}

/** A private set of video elements, seeked frame by frame. */
class FrameSource implements Sources {
  private els = new Map<string, HTMLVideoElement>();

  video = (clip: Clip) => this.els.get(clip.id) ?? null;
  image = (assetId: string) => getImage(assetId);

  async prepare(p: Project, t: number): Promise<void> {
    const live = new Set<string>();
    const jobs: Promise<void>[] = [];
    for (const { clip, time } of videoLeaves(p, t)) {
      live.add(clip.id);
      jobs.push(this.seek(clip, time));
    }
    for (const [id, el] of this.els) {
      if (live.has(id)) continue;
      // keep elements whose clip is still ahead of us or only just passed
      const clip = p.tracks.flatMap((tr) => tr.clips).find((c) => c.id === id);
      if (clip && t < clipEnd(clip) + 0.1) continue;
      release(el);
      this.els.delete(id);
    }
    await Promise.all(jobs);
  }

  private async seek(clip: Clip, time: number): Promise<void> {
    let el = this.els.get(clip.id);
    if (!el) {
      const url = mediaUrl(clip.assetId!);
      if (!url) return;
      el = document.createElement('video');
      el.muted = true;
      el.preload = 'auto';
      el.playsInline = true;
      el.src = url;
      this.els.set(clip.id, el);
      if (el.readyState < 2) await waitFor(el, 'loadeddata', 15000);
    }
    if (Math.abs(el.currentTime - time) < 0.0005 && !el.seeking && el.readyState >= 2) return;
    const seeked = waitFor(el, 'seeked', 8000);
    el.currentTime = time;
    await seeked;
  }

  dispose() {
    this.els.forEach(release);
    this.els.clear();
  }
}

function release(el: HTMLVideoElement) {
  el.pause();
  el.removeAttribute('src');
  el.load();
}

/** Mix every audible clip to a stereo buffer. Null when the project is silent. */
async function mixAudio(p: Project, duration: number, onProgress: (r: number) => void): Promise<AudioBuffer | null> {
  const items: { clip: Clip }[] = [];
  for (const track of p.tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      if (clip.muted || clip.volume <= 0) continue;
      if (clip.kind === 'compound' && clip.inner) {
        items.push({ clip });
        continue;
      }
      if (!clip.assetId) continue;
      if (clip.kind !== 'audio' && clip.kind !== 'video') continue;
      const asset = p.assets.find((a) => a.id === clip.assetId);
      if (!asset || !asset.hasAudio) continue;
      items.push({ clip });
    }
  }
  if (!items.length) return null;

  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
  const decoded = new Map<string, AudioBuffer | null>();
  let any = false;
  let done = 0;
  for (const { clip } of items) {
    let buf: AudioBuffer | null | undefined;
    if (clip.kind === 'compound') {
      // a group is mixed down on its own first, then treated as one sound
      buf = await mixAudio(subProject(p, clip), clip.inner!.duration, () => {});
    } else {
      const id = clip.assetId!;
      if (!decoded.has(id)) decoded.set(id, await decodeAudio(id));
      buf = decoded.get(id);
    }
    onProgress(++done / items.length);
    if (!buf) continue;
    any = true;
    const src = ctx.createBufferSource();
    const span = clip.duration * clip.speed;
    const ramped = !!clip.ramp && clip.ramp !== 'none';
    let from = Math.min(clip.offset, buf.duration);
    if (clip.reversed) {
      // play a back-to-front copy of just the stretch this clip uses
      const a = Math.floor(from * buf.sampleRate);
      const n = Math.max(1, Math.min(buf.length - a, Math.ceil(span * buf.sampleRate)));
      const flipped = ctx.createBuffer(buf.numberOfChannels, n, buf.sampleRate);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const out = flipped.getChannelData(ch);
        out.set(buf.getChannelData(ch).subarray(a, a + n));
        out.reverse();
      }
      src.buffer = flipped;
      from = 0;
    } else {
      src.buffer = buf;
    }
    if (ramped && clip.duration > 0.01) {
      const steps = 64;
      const curve = new Float32Array(steps);
      for (let i = 0; i < steps; i++) curve[i] = Math.max(0.05, rateAt(clip, (i / (steps - 1)) * clip.duration));
      src.playbackRate.setValueCurveAtTime(curve, clip.start, clip.duration);
    } else {
      src.playbackRate.value = clip.speed;
    }
    const gain = ctx.createGain();
    const end = clipEnd(clip);
    const v = clip.volume;
    const fi = Math.min(clip.fadeIn, clip.duration);
    const fo = Math.min(clip.fadeOut, clip.duration - fi);
    gain.gain.setValueAtTime(fi > 0 ? 0 : v, clip.start);
    if (fi > 0) gain.gain.linearRampToValueAtTime(v, clip.start + fi);
    if (fo > 0) {
      gain.gain.setValueAtTime(v, end - fo);
      gain.gain.linearRampToValueAtTime(0, end);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(clip.start, from, span);
  }
  if (!any) return null;
  return ctx.startRendering();
}

async function pickVideoConfig(o: ExportOptions): Promise<{ config: VideoEncoderConfig; muxCodec: 'avc' | 'vp9' }> {
  const bitrate = Math.round(o.width * o.height * o.fps * o.quality);
  const base = { width: o.width, height: o.height, bitrate, framerate: o.fps };
  const candidates: { codec: string; muxCodec: 'avc' | 'vp9' }[] = [
    { codec: 'avc1.640034', muxCodec: 'avc' }, // High 5.2
    { codec: 'avc1.640033', muxCodec: 'avc' }, // High 5.1
    { codec: 'avc1.64002A', muxCodec: 'avc' }, // High 4.2
    { codec: 'avc1.4D402A', muxCodec: 'avc' }, // Main 4.2
    { codec: 'avc1.42E034', muxCodec: 'avc' }, // Baseline 5.2
    { codec: 'vp09.00.51.08', muxCodec: 'vp9' },
    { codec: 'vp09.00.40.08', muxCodec: 'vp9' },
  ];
  for (const c of candidates) {
    const config: VideoEncoderConfig = { ...base, codec: c.codec };
    try {
      const res = await VideoEncoder.isConfigSupported(config);
      if (res.supported) return { config, muxCodec: c.muxCodec };
    } catch {
      /* try the next one */
    }
  }
  throw new Error('This browser has no video encoder for that size. Try a smaller resolution.');
}

async function pickAudioConfig(): Promise<{ config: AudioEncoderConfig; muxCodec: 'aac' | 'opus' } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  const candidates: { codec: string; muxCodec: 'aac' | 'opus'; bitrate: number }[] = [
    { codec: 'mp4a.40.2', muxCodec: 'aac', bitrate: 192000 },
    { codec: 'opus', muxCodec: 'opus', bitrate: 160000 },
  ];
  for (const c of candidates) {
    const config: AudioEncoderConfig = { codec: c.codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: c.bitrate };
    try {
      const res = await AudioEncoder.isConfigSupported(config);
      if (res.supported) return { config, muxCodec: c.muxCodec };
    } catch {
      /* next */
    }
  }
  return null;
}

export interface ExportResult {
  blob: Blob;
  /** set when sound had to be left out */
  warning?: string;
}

export async function exportVideo(
  p: Project,
  opts: ExportOptions,
  onProgress: (pr: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (!exportSupported()) {
    throw new Error('This browser cannot encode video. Use a current Chrome or Edge, or the desktop app.');
  }
  const duration = projectDuration(p);
  if (duration <= 0) throw new Error('The timeline is empty.');
  // H.264 needs even dimensions
  const o = { ...opts, width: opts.width & ~1, height: opts.height & ~1 };
  const aborted = () => {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  };

  onProgress({ stage: 'audio', ratio: 0 });
  let warning: string | undefined;
  let mixed = await mixAudio(p, duration, (r) => onProgress({ stage: 'audio', ratio: r * 0.9 }));
  aborted();
  const audioCfg = mixed ? await pickAudioConfig() : null;
  if (mixed && !audioCfg) {
    warning = 'No audio encoder is available here, so the file has no sound.';
    mixed = null;
  }
  const videoCfg = await pickVideoConfig(o);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: videoCfg.muxCodec, width: o.width, height: o.height, frameRate: o.fps },
    audio: mixed && audioCfg ? { codec: audioCfg.muxCodec, sampleRate: SAMPLE_RATE, numberOfChannels: 2 } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(videoCfg.config);

  const canvas = document.createElement('canvas');
  canvas.width = o.width;
  canvas.height = o.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const source = new FrameSource();
  const total = Math.max(1, Math.round(duration * o.fps));
  const frameUs = 1e6 / o.fps;

  try {
    for (let i = 0; i < total; i++) {
      aborted();
      if (failure) throw failure;
      // sample mid-frame so a cut on a frame boundary lands on the right side
      const t = (i + 0.001) / o.fps;
      await source.prepare(p, t);
      drawFrame(ctx, p, t, source);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % Math.round(o.fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 3 === 0) onProgress({ stage: 'video', ratio: i / total });
    }
    await encoder.flush();
    if (failure) throw failure;
    encoder.close();

    if (mixed && audioCfg) {
      onProgress({ stage: 'finishing', ratio: 0.2 });
      const aenc = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          failure = e;
        },
      });
      aenc.configure(audioCfg.config);
      const l = mixed.getChannelData(0);
      const r = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : l;
      const step = 4800;
      for (let i = 0; i < mixed.length; i += step) {
        aborted();
        const n = Math.min(step, mixed.length - i);
        const data = new Float32Array(n * 2);
        data.set(l.subarray(i, i + n), 0);
        data.set(r.subarray(i, i + n), n);
        const ad = new AudioData({
          format: 'f32-planar',
          sampleRate: SAMPLE_RATE,
          numberOfFrames: n,
          numberOfChannels: 2,
          timestamp: Math.round((i / SAMPLE_RATE) * 1e6),
          data,
        });
        aenc.encode(ad);
        ad.close();
        while (aenc.encodeQueueSize > 20) await new Promise((res) => setTimeout(res, 2));
      }
      await aenc.flush();
      if (failure) throw failure;
      aenc.close();
    }

    onProgress({ stage: 'finishing', ratio: 0.9 });
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    onProgress({ stage: 'finishing', ratio: 1 });
    return { blob, warning };
  } finally {
    source.dispose();
    if (encoder.state !== 'closed') {
      try {
        encoder.close();
      } catch {
        /* already closed */
      }
    }
  }
}

/** Just the mixed sound of the timeline, as an uncompressed WAV. */
export async function exportAudio(p: Project, onProgress: (pr: ExportProgress) => void): Promise<Blob> {
  const duration = projectDuration(p);
  if (duration <= 0) throw new Error('The timeline is empty.');
  onProgress({ stage: 'audio', ratio: 0 });
  const mixed = await mixAudio(p, duration, (r) => onProgress({ stage: 'audio', ratio: r }));
  if (!mixed) throw new Error('Nothing on the timeline makes a sound.');
  onProgress({ stage: 'finishing', ratio: 0.5 });
  return encodeWav(mixed);
}

/** The current frame at full project resolution, as a PNG. */
export async function exportStill(p: Project, t: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const source = new FrameSource();
  try {
    await source.prepare(p, t);
    drawFrame(ctx, p, t, source);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the frame'))), 'image/png'),
    );
  } finally {
    source.dispose();
  }
}
