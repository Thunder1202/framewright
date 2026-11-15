import { useStore } from '../store';
import { Clip, Project, Track } from '../types';
import { getImage, mediaUrl } from '../lib/media';
import { clamp, clipEnd, fadeGain, projectDuration } from '../lib/timeline';
import { rateAt, sourcePos } from '../lib/ramp';
import { drawFrame, isActive, Sources, sourceTime, visualLayers } from './compose';
import { innerTime, MAX_DEPTH, subProject } from '../lib/compound';

/**
 * Realtime preview. One media element per clip near the playhead, kept in step
 * with the timeline clock, composited onto the preview canvas every frame.
 */

interface Entry {
  el: HTMLMediaElement;
  assetId: string;
  isVideo: boolean;
  node: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}

interface Need {
  clip: Clip;
  track: Track;
  isVideo: boolean;
  duration: number;
  /** time on the timeline this clip sits on, which is the inside of a group for grouped clips */
  t: number;
  /** loudness, speed and silence handed down from the groups around it */
  gain: number;
  rate: number;
  silent: boolean;
  /** true when the groups around it run backwards an odd number of times */
  flipped: boolean;
}

interface Above {
  gain: number;
  rate: number;
  silent: boolean;
  flipped: boolean;
  depth: number;
}

const PREVIEW_MAX = 1280;

class Player {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pool = new Map<string, Entry>();
  private actx: AudioContext | null = null;
  private raf = 0;
  private startPerf = 0;
  private startTime = 0;

  readonly sources: Sources = {
    video: (clip) => {
      const e = this.pool.get(clip.id);
      return e && e.isVideo && (e.el as HTMLVideoElement).videoWidth ? (e.el as HTMLVideoElement) : null;
    },
    image: (assetId) => getImage(assetId),
  };

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.ctx = null;
    this.disposeAll();
  }

  disposeAll() {
    for (const id of [...this.pool.keys()]) this.dispose(id);
  }

  play() {
    const s = useStore.getState();
    if (!s.project) return;
    const dur = projectDuration(s.project);
    if (dur <= 0) return;
    let t = s.time;
    if (t >= dur - 0.01) t = 0;
    if (!this.actx) {
      try {
        this.actx = new AudioContext();
        for (const e of this.pool.values()) this.connect(e);
      } catch {
        this.actx = null;
      }
    }
    void this.actx?.resume();
    this.startPerf = performance.now();
    this.startTime = t;
    useStore.setState({ playing: true, time: t });
  }

  pause() {
    if (!useStore.getState().playing) return;
    useStore.setState({ playing: false });
    for (const e of this.pool.values()) if (!e.el.paused) e.el.pause();
  }

  toggle() {
    if (useStore.getState().playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    const s = useStore.getState();
    if (!s.project) return;
    t = clamp(t, 0, Math.max(0, projectDuration(s.project)));
    this.startPerf = performance.now();
    this.startTime = t;
    useStore.setState({ time: t });
  }

  private connect(e: Entry) {
    if (!this.actx || e.node) return;
    try {
      e.node = this.actx.createMediaElementSource(e.el);
      e.gain = this.actx.createGain();
      e.node.connect(e.gain).connect(this.actx.destination);
      e.el.muted = false;
    } catch {
      /* element stays muted */
    }
  }

  private ensure(clip: Clip, isVideo: boolean): Entry | null {
    const assetId = clip.assetId;
    if (!assetId) return null;
    let e = this.pool.get(clip.id);
    if (e && (e.assetId !== assetId || e.isVideo !== isVideo)) {
      this.dispose(clip.id);
      e = undefined;
    }
    if (e) return e;
    const url = mediaUrl(assetId);
    if (!url) return null;
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    el.preload = 'auto';
    el.muted = true;
    (el as HTMLVideoElement).playsInline = true;
    // speed changes shift pitch, the same way the exporter renders them
    (el as unknown as { preservesPitch: boolean }).preservesPitch = false;
    el.src = url;
    try {
      el.currentTime = clip.offset;
    } catch {
      /* set once metadata is in */
    }
    e = { el, assetId, isVideo, node: null, gain: null };
    this.pool.set(clip.id, e);
    this.connect(e);
    return e;
  }

  private dispose(id: string) {
    const e = this.pool.get(id);
    if (!e) return;
    e.el.pause();
    try {
      e.node?.disconnect();
      e.gain?.disconnect();
    } catch {
      /* already gone */
    }
    e.el.removeAttribute('src');
    e.el.load();
    this.pool.delete(id);
  }

  private needs(p: Project, t: number): Map<string, Need> {
    const out = new Map<string, Need>();
    this.collect(p, t, { gain: 1, rate: 1, silent: false, flipped: false, depth: 0 }, out);
    return out;
  }

  /** Every clip that needs a media element right now, looking inside groups. */
  private collect(p: Project, t: number, up: Above, out: Map<string, Need>) {
    const dur = (c: Clip) => p.assets.find((a) => a.id === c.assetId)?.duration ?? 0;
    const add = (clip: Clip, track: Track, isVideo: boolean, gainMul: number) => {
      if (clip.kind === 'compound') {
        if (!clip.inner || up.depth >= MAX_DEPTH) return;
        this.collect(
          subProject(p, clip),
          innerTime(clip, t),
          {
            gain: up.gain * gainMul * clip.volume * fadeGain(clip, t),
            rate: up.rate * rateAt(clip, t - clip.start),
            silent: up.silent || clip.muted || track.muted,
            flipped: up.flipped !== !!clip.reversed,
            depth: up.depth + 1,
          },
          out,
        );
        return;
      }
      out.set(clip.id, { clip, track, isVideo, duration: dur(clip), t, gain: up.gain * gainMul, rate: up.rate, silent: up.silent, flipped: up.flipped });
    };
    for (const layer of visualLayers(p, t)) {
      if (layer.clip.kind !== 'video' && layer.clip.kind !== 'compound') continue;
      const tp = layer.transition?.p ?? 1;
      add(layer.clip, layer.track, true, layer.role === 'out' ? 1 - tp : layer.role === 'in' ? tp : 1);
    }
    for (const track of p.tracks) {
      if (track.kind === 'visual') {
        // a hidden video track still plays its sound
        if (!track.hidden) continue;
        const c = track.clips.find((x) => (x.kind === 'video' || x.kind === 'compound') && isActive(x, t));
        if (c) add(c, track, true, 1);
        continue;
      }
      const c = track.clips.find((x) => isActive(x, t));
      if (c && c.assetId) add(c, track, false, 1);
    }
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const s = useStore.getState();
    const p = s.project;
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!p || !canvas || !ctx) return;

    let t = s.time;
    let playing = s.playing;
    if (playing) {
      t = this.startTime + (performance.now() - this.startPerf) / 1000;
      const dur = projectDuration(p);
      if (t >= dur) {
        t = dur;
        playing = false;
        useStore.setState({ playing: false, time: t });
        for (const e of this.pool.values()) if (!e.el.paused) e.el.pause();
      } else {
        useStore.setState({ time: t });
      }
    }

    const k = Math.min(1, PREVIEW_MAX / Math.max(p.width, p.height));
    const cw = Math.round(p.width * k);
    const ch = Math.round(p.height * k);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const needed = this.needs(p, t);
    const warm = new Set<string>();

    // clips starting soon get an element early so cuts do not stutter
    for (const track of p.tracks) {
      for (const c of track.clips) {
        if (!c.assetId || (c.kind !== 'video' && c.kind !== 'audio')) continue;
        if (needed.has(c.id)) continue;
        if (c.start > t && c.start - t < 2.5) {
          const e = this.ensure(c, c.kind === 'video' && track.kind === 'visual');
          if (e) {
            warm.add(c.id);
            if (!e.el.paused) e.el.pause();
            const first = sourcePos(c, 0);
            if (!e.el.seeking && Math.abs(e.el.currentTime - first) > 0.02) e.el.currentTime = first;
          }
        } else if (t >= clipEnd(c) && t - clipEnd(c) < 0.5) {
          if (this.pool.has(c.id)) warm.add(c.id);
        }
      }
    }

    for (const [id, n] of needed) {
      const e = this.ensure(n.clip, n.isVideo);
      if (!e) continue;
      const el = e.el;
      const want = sourceTime(n.clip, n.t, n.duration);
      if (playing && n.flipped !== !!n.clip.reversed) {
        // media elements cannot play backwards, so a reversed clip is stepped frame by frame, silently
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - want) > 0.015) el.currentTime = want;
        if (e.gain) e.gain.gain.value = 0;
      } else if (playing) {
        const rate = clamp(n.rate * rateAt(n.clip, n.t - n.clip.start), 0.1, 16);
        if (el.playbackRate !== rate) el.playbackRate = rate;
        const atEnd = n.duration > 0 && want >= n.duration - 0.05;
        if (el.paused) {
          if (!atEnd) {
            if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
            void el.play().catch(() => {});
          }
        } else if (Math.abs(el.currentTime - want) > 0.3 * Math.max(1, rate) && !el.seeking) {
          el.currentTime = want;
        }
        if (e.gain) {
          const silent = n.silent || n.clip.muted || n.track.muted;
          e.gain.gain.value = silent ? 0 : clamp(n.clip.volume * fadeGain(n.clip, n.t) * n.gain, 0, 4);
        }
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - want) > 0.01) el.currentTime = want;
      }
      void id;
    }

    for (const [id, e] of this.pool) {
      if (needed.has(id)) continue;
      if (!e.el.paused) e.el.pause();
      if (!warm.has(id)) this.dispose(id);
    }

    drawFrame(ctx, p, t, this.sources);
  };
}

export const player = new Player();
