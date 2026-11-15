import { Anim, BlendMode, Clip, Project, Stab, TextStyle, Track, TransitionKind } from '../types';
import { filterCss } from '../lib/filters';
import { applyChroma } from '../lib/chroma';
import { resolveClip } from '../lib/keyframes';
import { sourcePos } from '../lib/ramp';
import { clamp, clipEnd, EPS } from '../lib/timeline';
import { innerTime, MAX_DEPTH, subProject } from '../lib/compound';

/** Where the compositor gets pixels from. The preview and the exporter each supply their own. */
export interface Sources {
  video(clip: Clip): HTMLVideoElement | null;
  image(assetId: string): HTMLImageElement | null;
}

export interface Layer {
  clip: Clip;
  track: Track;
  role: 'main' | 'in' | 'out';
  transition?: { kind: TransitionKind; p: number };
}

interface Mod {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rot: number;
  wipe?: number;
}

const IDENT: Mod = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 };
const ease = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);

/** Source time for a clip at timeline time t, kept inside the source. */
export function sourceTime(clip: Clip, t: number, sourceDuration?: number): number {
  const s = sourcePos(clip, t - clip.start);
  const hi = sourceDuration && sourceDuration > 0.05 ? sourceDuration - 0.04 : Infinity;
  return clamp(s, 0, hi);
}

export const isActive = (c: Clip, t: number) => t >= c.start - EPS && t < clipEnd(c) - EPS;

/** Visible layers at time t, bottom first. Includes the outgoing clip of a running transition. */
export function visualLayers(p: Project, t: number): Layer[] {
  const out: Layer[] = [];
  for (let i = p.tracks.length - 1; i >= 0; i--) {
    const track = p.tracks[i];
    if (track.kind !== 'visual' || track.hidden) continue;
    const b = track.clips.find((c) => isActive(c, t));
    if (!b) continue;
    const local = t - b.start;
    if (b.transition.kind !== 'none' && b.transition.duration > 0 && local < b.transition.duration) {
      const a = track.clips.find((c) => c.id !== b.id && Math.abs(clipEnd(c) - b.start) < 0.002);
      if (a) {
        const tr = { kind: b.transition.kind, p: clamp(local / b.transition.duration, 0, 1) };
        out.push({ clip: a, track, role: 'out', transition: tr });
        out.push({ clip: b, track, role: 'in', transition: tr });
        continue;
      }
    }
    out.push({ clip: b, track, role: 'main' });
  }
  return out;
}

function animValue(anim: Anim, e: number): Mod {
  // e runs 0 (fully off) to 1 (fully settled)
  const k = 1 - e;
  switch (anim.kind) {
    case 'fade':
      return { ...IDENT, alpha: e };
    case 'slide-left':
      return { ...IDENT, dx: k * 0.35, alpha: e };
    case 'slide-right':
      return { ...IDENT, dx: -k * 0.35, alpha: e };
    case 'slide-up':
      return { ...IDENT, dy: k * 0.35, alpha: e };
    case 'slide-down':
      return { ...IDENT, dy: -k * 0.35, alpha: e };
    case 'zoom-in':
      return { ...IDENT, scale: 0.6 + 0.4 * e, alpha: e };
    case 'zoom-out':
      return { ...IDENT, scale: 1.5 - 0.5 * e, alpha: e };
    case 'spin':
      return { ...IDENT, rot: -k * 180, scale: 0.3 + 0.7 * e, alpha: e };
    default:
      return IDENT;
  }
}

function animMod(clip: Clip, t: number, skipIn: boolean): Mod {
  const local = t - clip.start;
  const left = clipEnd(clip) - t;
  let m = IDENT;
  if (!skipIn && clip.animIn.kind !== 'none' && clip.animIn.duration > 0 && local < clip.animIn.duration) {
    m = animValue(clip.animIn, ease(local / clip.animIn.duration));
  }
  if (clip.animOut.kind !== 'none' && clip.animOut.duration > 0 && left < clip.animOut.duration) {
    const o = animValue(clip.animOut, ease(left / clip.animOut.duration));
    m = {
      alpha: m.alpha * o.alpha,
      dx: m.dx - o.dx,
      dy: m.dy - o.dy,
      scale: m.scale * o.scale,
      rot: m.rot - o.rot,
    };
  }
  return m;
}

function transitionMod(kind: TransitionKind, p: number, role: 'in' | 'out'): Mod {
  const e = ease(p);
  switch (kind) {
    case 'crossfade':
      return role === 'out' ? IDENT : { ...IDENT, alpha: p };
    case 'dip-black':
      return role === 'out'
        ? { ...IDENT, alpha: clamp(1 - p * 2, 0, 1) }
        : { ...IDENT, alpha: clamp(p * 2 - 1, 0, 1) };
    case 'slide':
      return role === 'out' ? IDENT : { ...IDENT, dx: 1 - e };
    case 'push':
      return role === 'out' ? { ...IDENT, dx: -e } : { ...IDENT, dx: 1 - e };
    case 'wipe':
      return role === 'out' ? IDENT : { ...IDENT, wipe: e };
    case 'zoom':
      return role === 'out'
        ? { ...IDENT, scale: 1 + e * 0.6, alpha: 1 - p }
        : { ...IDENT, scale: 0.8 + 0.2 * e, alpha: p };
    default:
      return IDENT;
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

interface TextLayout {
  lines: string[];
  fontPx: number;
  lineH: number;
  w: number;
  h: number;
  pad: number;
  font: string;
}

function layoutText(ctx: CanvasRenderingContext2D, text: TextStyle, H: number, scale: number): TextLayout {
  const fontPx = Math.max(1, (text.size / 100) * H * scale);
  const font = `${text.italic ? 'italic ' : ''}${text.bold ? 700 : 400} ${fontPx}px ${text.font}`;
  ctx.font = font;
  const lines = (text.content || ' ').split('\n');
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l || ' ').width);
  const lineH = fontPx * 1.25;
  const pad = text.backgroundOn ? fontPx * 0.35 : 0;
  return { lines, fontPx, lineH, w, h: lines.length * lineH, pad, font };
}

/** Unrotated size of a clip on a canvas of W x H, at the clip's own scale. */
export function clipSize(p: Project, clip: Clip, W: number, H: number, src?: Sources): { w: number; h: number } | null {
  if (clip.kind === 'audio') return null;
  if (clip.kind === 'text') {
    if (!clip.text) return null;
    const l = layoutText(getMeasureCtx(), clip.text, H, clip.scale);
    return { w: l.w + l.pad * 2, h: l.h + l.pad * 2 };
  }
  if (clip.kind === 'compound') {
    // a group is a whole canvas of its own
    const cr = cropRect(clip);
    return { w: W * clip.scale * cr.w, h: H * clip.scale * cr.h };
  }
  const asset = p.assets.find((a) => a.id === clip.assetId);
  let sw = asset?.width ?? 0;
  let sh = asset?.height ?? 0;
  if (clip.kind === 'video' && src) {
    const el = src.video(clip);
    if (el && el.videoWidth) {
      sw = el.videoWidth;
      sh = el.videoHeight;
    }
  }
  if (!sw || !sh) return null;
  const fit = Math.min(W / sw, H / sh);
  const cr = cropRect(clip);
  return { w: sw * fit * clip.scale * cr.w, h: sh * fit * clip.scale * cr.h };
}

/** The part of the source that is kept, as fractions. Never smaller than 5% either way. */
export function cropRect(clip: Clip): { l: number; t: number; w: number; h: number } {
  const c = clip.crop;
  if (!c) return { l: 0, t: 0, w: 1, h: 1 };
  const l = clamp(c.l, 0, 0.95);
  const t = clamp(c.t, 0, 0.95);
  return { l, t, w: clamp(1 - l - c.r, 0.05, 1 - l), h: clamp(1 - t - c.b, 0.05, 1 - t) };
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  screen: 'screen',
  multiply: 'multiply',
  overlay: 'overlay',
  lighten: 'lighten',
  darken: 'darken',
  add: 'lighter',
};

type Ctx2D = CanvasRenderingContext2D;

/** The correction for one moment of the source, blended between the two nearest samples. */
function stabAt(stab: Stab, srcT: number): { dx: number; dy: number } {
  const n = stab.dx.length;
  if (!n) return { dx: 0, dy: 0 };
  const f = clamp((srcT - stab.t0) * stab.rate, 0, n - 1);
  const i = Math.floor(f);
  const j = Math.min(n - 1, i + 1);
  const k = f - i;
  return { dx: stab.dx[i] + (stab.dx[j] - stab.dx[i]) * k, dy: stab.dy[i] + (stab.dy[j] - stab.dy[i]) * k };
}
/** One surface per nesting level for a group to draw its contents on. */
const groupCtx: Ctx2D[] = [];
function groupSurface(depth: number, w: number, h: number): Ctx2D {
  const c = (groupCtx[depth] ??= document.createElement('canvas').getContext('2d')!);
  if (c.canvas.width !== w || c.canvas.height !== h) {
    c.canvas.width = w;
    c.canvas.height = h;
  }
  return c;
}
let keyCtx: Ctx2D | null = null;
let mixCtx: Ctx2D | null = null;
function scratch(which: 'key' | 'mix', w: number, h: number): Ctx2D {
  let c = which === 'key' ? keyCtx : mixCtx;
  if (!c) {
    c = document.createElement('canvas').getContext('2d', { willReadFrequently: which === 'key' })!;
    if (which === 'key') keyCtx = c;
    else mixCtx = c;
  }
  if (c.canvas.width !== w || c.canvas.height !== h) {
    c.canvas.width = w;
    c.canvas.height = h;
  } else {
    c.clearRect(0, 0, w, h);
  }
  return c;
}

/** Warmth and vignette, painted over the rectangle the picture was just drawn into. */
function overlays(ctx: Ctx2D, clip: Clip, x: number, y: number, w: number, h: number) {
  const temp = clip.adjust.temperature;
  if (temp) {
    const before = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = temp > 0 ? `rgba(255,150,20,${(temp / 100) * 0.6})` : `rgba(20,120,255,${(-temp / 100) * 0.6})`;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = before;
  }
  if (clip.adjust.vignette > 0) {
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(x + w / 2, y + h / 2, r * 0.45, x + w / 2, y + h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(clip.adjust.vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
}

/** Draw a video frame or picture, centred on the origin at w x h. */
function drawMedia(ctx: Ctx2D, clip: Clip, el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, w: number, h: number, W: number, srcT: number) {
  const natW = el instanceof HTMLVideoElement ? el.videoWidth : el instanceof HTMLCanvasElement ? el.width : el.naturalWidth;
  const natH = el instanceof HTMLVideoElement ? el.videoHeight : el instanceof HTMLCanvasElement ? el.height : el.naturalHeight;
  if (!natW || !natH) return;
  const cr = cropRect(clip);
  let sx = cr.l * natW;
  let sy = cr.t * natH;
  let sw = cr.w * natW;
  let sh = cr.h * natH;
  if (clip.stab && clip.kind === 'video') {
    // steady the shot: zoom in a little and slide the window against the shake
    const fix = stabAt(clip.stab, srcT);
    const zw = sw / clip.stab.zoom;
    const zh = sh / clip.stab.zoom;
    sx = clamp(sx + (sw - zw) / 2 - fix.dx * natW, cr.l * natW, cr.l * natW + sw - zw);
    sy = clamp(sy + (sh - zh) / 2 - fix.dy * natH, cr.t * natH, cr.t * natH + sh - zh);
    sw = zw;
    sh = zh;
  }
  const blend = clip.blend && clip.blend !== 'normal' ? BLEND[clip.blend] : null;
  const keyed = !!clip.chroma?.on;
  const mask = clip.mask && clip.mask.shape !== 'none' ? clip.mask : null;

  if (!blend && !keyed && !mask) {
    ctx.filter = filterCss(clip.filter, clip.adjust, W);
    ctx.drawImage(el, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
    ctx.filter = 'none';
    overlays(ctx, clip, -w / 2, -h / 2, w, h);
    return;
  }

  // Keying and blending need the finished picture on its own surface first,
  // so the warmth and vignette do not leak onto whatever is underneath.
  const cw = Math.round(clamp(Math.min(w, sw), 1, 4096));
  const ch = Math.round(clamp(Math.min(h, sh), 1, 4096));
  let cut: HTMLCanvasElement | null = null;
  if (keyed) {
    const k = scratch('key', cw, ch);
    k.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
    const img = k.getImageData(0, 0, cw, ch);
    applyChroma(img.data, clip.chroma!);
    k.putImageData(img, 0, 0);
    cut = k.canvas;
  }
  const m = scratch('mix', cw, ch);
  m.globalCompositeOperation = 'source-over';
  m.filter = filterCss(clip.filter, clip.adjust, (W * cw) / w);
  if (cut) m.drawImage(cut, 0, 0);
  else m.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
  m.filter = 'none';
  overlays(m, clip, 0, 0, cw, ch);
  // put back the see-through parts the overlays just painted on
  m.globalCompositeOperation = 'destination-in';
  if (cut) m.drawImage(cut, 0, 0);
  else m.drawImage(el, sx, sy, sw, sh, 0, 0, cw, ch);
  if (mask) {
    m.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in';
    if (mask.feather > 0) m.filter = `blur(${((mask.feather / 100) * 0.15 * Math.min(cw, ch)).toFixed(2)}px)`;
    const mw = clamp(mask.w, 0.02, 2) * cw;
    const mh = clamp(mask.h, 0.02, 2) * ch;
    const mx = (0.5 + mask.x) * cw;
    const my = (0.5 + mask.y) * ch;
    m.fillStyle = '#000';
    m.beginPath();
    if (mask.shape === 'ellipse') m.ellipse(mx, my, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    else m.rect(mx - mw / 2, my - mh / 2, mw, mh);
    m.fill();
    m.filter = 'none';
  }
  m.globalCompositeOperation = 'source-over';

  if (blend) ctx.globalCompositeOperation = blend;
  ctx.drawImage(m.canvas, -w / 2, -h / 2, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

/** Scale at which a clip exactly covers the canvas. */
export function coverScale(p: Project, clip: Clip): number {
  const asset = p.assets.find((a) => a.id === clip.assetId);
  if (!asset?.width || !asset.height) return 1;
  const fit = Math.min(p.width / asset.width, p.height / asset.height);
  const cr = cropRect(clip);
  return Math.max(p.width / (asset.width * cr.w), p.height / (asset.height * cr.h)) / fit;
}

function drawLayer(ctx: CanvasRenderingContext2D, p: Project, layer: Layer, t: number, src: Sources, depth: number) {
  const clip = resolveClip(layer.clip, t);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  let mod = animMod(clip, t, layer.role === 'in');
  if (layer.role === 'out') mod = IDENT;
  if (layer.transition && layer.role !== 'main') {
    const tm = transitionMod(layer.transition.kind, layer.transition.p, layer.role);
    mod = {
      alpha: mod.alpha * tm.alpha,
      dx: mod.dx + tm.dx,
      dy: mod.dy + tm.dy,
      scale: mod.scale * tm.scale,
      rot: mod.rot + tm.rot,
      wipe: tm.wipe,
    };
  }
  const alpha = clamp(clip.opacity * mod.alpha, 0, 1);
  if (alpha <= 0.001) return;

  // a group paints its own little timeline first, then is treated like any other picture
  let group: HTMLCanvasElement | null = null;
  if (clip.kind === 'compound' && clip.inner && depth < MAX_DEPTH) {
    const g = groupSurface(depth, W, H);
    drawTracks(g, subProject(p, clip), innerTime(clip, t), src, depth + 1, false);
    group = g.canvas;
  }

  ctx.save();
  if (mod.wipe !== undefined) {
    ctx.beginPath();
    ctx.rect(0, 0, W * mod.wipe, H);
    ctx.clip();
  }
  ctx.translate(W / 2 + (clip.x + mod.dx) * W, H / 2 + (clip.y + mod.dy) * H);
  ctx.rotate(((clip.rotation + mod.rot) * Math.PI) / 180);
  ctx.scale(mod.scale * (clip.flipH ? -1 : 1), mod.scale);
  ctx.globalAlpha = alpha;

  if (clip.kind === 'text' && clip.text) {
    if (clip.blend && clip.blend !== 'normal') ctx.globalCompositeOperation = BLEND[clip.blend];
    drawText(ctx, clip.text, H, clip.scale);
  } else if (clip.kind === 'video' || clip.kind === 'image') {
    const el = clip.kind === 'video' ? src.video(clip) : clip.assetId ? src.image(clip.assetId) : null;
    const size = clipSize(p, clip, W, H, src);
    if (el && size) {
      try {
        const asset = p.assets.find((a) => a.id === clip.assetId);
        drawMedia(ctx, clip, el, size.w, size.h, W, sourceTime(clip, t, asset?.duration));
      } catch {
        /* source not decodable yet */
      }
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
  } else if (group) {
    const size = clipSize(p, clip, W, H, src);
    if (size) drawMedia(ctx, clip, group, size.w, size.h, W, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, text: TextStyle, H: number, scale: number) {
  const l = layoutText(ctx, text, H, scale);
  if (text.backgroundOn) {
    ctx.fillStyle = text.background;
    const r = l.fontPx * 0.18;
    ctx.beginPath();
    ctx.roundRect(-l.w / 2 - l.pad, -l.h / 2 - l.pad, l.w + l.pad * 2, l.h + l.pad * 2, r);
    ctx.fill();
  }
  ctx.font = l.font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = text.align;
  ctx.lineJoin = 'round';
  const x = text.align === 'left' ? -l.w / 2 : text.align === 'right' ? l.w / 2 : 0;
  if (text.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = l.fontPx * 0.14;
    ctx.shadowOffsetY = l.fontPx * 0.05;
  }
  l.lines.forEach((line, i) => {
    const y = -l.h / 2 + l.lineH * (i + 0.5);
    if (text.strokeWidth > 0) {
      ctx.strokeStyle = text.stroke;
      ctx.lineWidth = (l.fontPx * text.strokeWidth) / 50;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = text.color;
    ctx.fillText(line, x, y);
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Draw the whole timeline at time t. Resolution independent: uses the canvas size it is given. */
export function drawFrame(ctx: CanvasRenderingContext2D, p: Project, t: number, src: Sources): void {
  drawTracks(ctx, p, t, src, 0, true);
}

function drawTracks(ctx: CanvasRenderingContext2D, p: Project, t: number, src: Sources, depth: number, backdrop: boolean): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  if (backdrop) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  } else {
    // the inside of a group is see-through where nothing is drawn
    ctx.clearRect(0, 0, W, H);
  }
  for (const layer of visualLayers(p, t)) drawLayer(ctx, p, layer, t, src, depth);
}

/** Every video clip showing at time t, with the moment of its file it needs, looking inside groups. */
export function videoLeaves(p: Project, t: number, out: { clip: Clip; time: number }[] = [], depth = 0): { clip: Clip; time: number }[] {
  for (const { clip } of visualLayers(p, t)) {
    if (clip.kind === 'video' && clip.assetId) {
      const asset = p.assets.find((a) => a.id === clip.assetId);
      out.push({ clip, time: sourceTime(clip, t, asset?.duration) });
    } else if (clip.kind === 'compound' && clip.inner && depth < MAX_DEPTH) {
      videoLeaves(subProject(p, clip), innerTime(clip, t), out, depth + 1);
    }
  }
  return out;
}

/** Topmost clip under a point given as fractions of the canvas (0..1). */
export function hitTest(p: Project, t: number, fx: number, fy: number, src?: Sources): Clip | null {
  const W = p.width;
  const H = p.height;
  const layers = visualLayers(p, t).filter((l) => l.role !== 'out' && !l.track.locked);
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = resolveClip(layers[i].clip, t);
    const size = clipSize(p, c, W, H, src);
    if (!size) continue;
    const dx = fx * W - (W / 2 + c.x * W);
    const dy = fy * H - (H / 2 + c.y * H);
    const a = (-c.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= size.w / 2 && Math.abs(ly) <= size.h / 2) return c;
  }
  return null;
}
