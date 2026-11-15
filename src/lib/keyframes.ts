import { Clip, Key, KeyProp } from '../types';

/**
 * Keyframes: a property that changes over the life of a clip.
 * Key times are seconds from the clip's start. Pure, so it is unit tested.
 */

export const KEY_PROPS: KeyProp[] = ['x', 'y', 'scale', 'rotation', 'opacity'];

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Value of a keyed property at a time. Holds the first and last values outside the keys. */
export function valueAt(keys: Key[], local: number): number {
  if (local <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (local >= last.t) return last.v;
  let i = 1;
  while (keys[i].t < local) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const span = b.t - a.t;
  return span <= 0 ? b.v : a.v + (b.v - a.v) * smooth((local - a.t) / span);
}

export function propAt(clip: Clip, prop: KeyProp, local: number): number {
  const keys = clip.keys?.[prop];
  return keys && keys.length ? valueAt(keys, local) : clip[prop];
}

export const hasKeys = (clip: Clip, prop?: KeyProp): boolean =>
  prop ? !!clip.keys?.[prop]?.length : !!clip.keys && KEY_PROPS.some((p) => clip.keys![p]?.length);

/** The clip as it looks at timeline time t, with every keyed property worked out. */
export function resolveClip(clip: Clip, t: number): Clip {
  if (!hasKeys(clip)) return clip;
  const local = t - clip.start;
  const out = { ...clip };
  for (const p of KEY_PROPS) out[p] = propAt(clip, p, local);
  return out;
}

function indexNear(keys: Key[], local: number, fps: number): number {
  const half = 0.5 / fps;
  return keys.findIndex((k) => Math.abs(k.t - local) <= half);
}

export function keyAt(clip: Clip, prop: KeyProp, local: number, fps: number): boolean {
  const keys = clip.keys?.[prop];
  return !!keys && indexNear(keys, local, fps) >= 0;
}

/** Set a property. If it is keyed, this writes the key under the playhead (adding one if needed). */
export function setProp(clip: Clip, prop: KeyProp, value: number, local: number, fps: number): void {
  const keys = clip.keys?.[prop];
  if (!keys || !keys.length) {
    clip[prop] = value;
    return;
  }
  const i = indexNear(keys, local, fps);
  if (i >= 0) keys[i].v = value;
  else {
    keys.push({ t: local, v: value });
    keys.sort((a, b) => a.t - b.t);
  }
}

/** Add a key at this time holding the current value, or remove the one already there. */
export function toggleKey(clip: Clip, prop: KeyProp, local: number, fps: number): void {
  const keys = clip.keys?.[prop] ?? [];
  const i = indexNear(keys, local, fps);
  if (i >= 0) {
    const [gone] = keys.splice(i, 1);
    // with the last key gone the property is fixed again, at the value it had
    if (!keys.length) clip[prop] = gone.v;
  } else {
    keys.push({ t: local, v: propAt(clip, prop, local) });
    keys.sort((a, b) => a.t - b.t);
  }
  clip.keys = { ...clip.keys, [prop]: keys };
  if (!keys.length) delete clip.keys[prop];
}

/** Move every key (after the clip's start edge was trimmed). */
export function shiftKeys(clip: Clip, delta: number): void {
  if (!clip.keys) return;
  for (const p of KEY_PROPS) clip.keys[p]?.forEach((k) => (k.t += delta));
}

/** Stretch key times (after the clip's speed, and so its length, changed). */
export function scaleKeys(clip: Clip, factor: number): void {
  if (!clip.keys) return;
  for (const p of KEY_PROPS) clip.keys[p]?.forEach((k) => (k.t *= factor));
}

/** All key times on a clip, for drawing dots on the timeline. */
export function keyTimes(clip: Clip): number[] {
  if (!clip.keys) return [];
  const set = new Set<number>();
  for (const p of KEY_PROPS) clip.keys[p]?.forEach((k) => set.add(Math.round(k.t * 1000) / 1000));
  return [...set];
}
