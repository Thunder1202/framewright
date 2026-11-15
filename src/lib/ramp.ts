import { Clip, RampKind } from '../types';

/**
 * Speed ramps and reverse. A ramp bends time inside a clip without changing its
 * length or how much of the source it uses: the clip's speed stays the average.
 * Pure, so it is unit tested.
 */

export const RAMPS: { id: RampKind; name: string }[] = [
  { id: 'none', name: 'Steady' },
  { id: 'speed-up', name: 'Speed up (slow to fast)' },
  { id: 'slow-down', name: 'Slow down (fast to slow)' },
  { id: 'hero', name: 'Hero moment (fast, slow, fast)' },
  { id: 'rush', name: 'Rush (slow, fast, slow)' },
];

/** Fraction of the source span covered after fraction u of the clip. f(0) = 0, f(1) = 1, always rising. */
export function rampPos(kind: RampKind | undefined, u: number): number {
  const c = (2 * u - 1) ** 3 + 1;
  switch (kind) {
    case 'speed-up':
      return 0.4 * u + 0.6 * u * u;
    case 'slow-down':
      return 1.6 * u - 0.6 * u * u;
    case 'hero':
      return 0.4 * u + (1.8 * c) / 6;
    case 'rush':
      return 1.45 * u - (1.35 * c) / 6;
    default:
      return u;
  }
}

/** Speed multiplier at fraction u (the slope of rampPos). Averages to 1 over the clip. */
export function rampRate(kind: RampKind | undefined, u: number): number {
  const d = (2 * u - 1) ** 2;
  switch (kind) {
    case 'speed-up':
      return 0.4 + 1.2 * u;
    case 'slow-down':
      return 1.6 - 1.2 * u;
    case 'hero':
      return 0.4 + 1.8 * d;
    case 'rush':
      return 1.45 - 1.35 * d;
    default:
      return 1;
  }
}

const bent = (clip: Clip) => !!clip.reversed || (!!clip.ramp && clip.ramp !== 'none');

/** Seconds into the source shown at `local` seconds into the clip. */
export function sourcePos(clip: Clip, local: number): number {
  if (!bent(clip)) return clip.offset + local * clip.speed;
  let u = clip.duration > 0 ? Math.min(1, Math.max(0, local / clip.duration)) : 0;
  if (clip.reversed) u = 1 - u;
  return clip.offset + clip.duration * clip.speed * rampPos(clip.ramp, u);
}

/** How fast the source is moving at `local`, as a positive rate. */
export function rateAt(clip: Clip, local: number): number {
  if (!clip.ramp || clip.ramp === 'none') return clip.speed;
  let u = clip.duration > 0 ? Math.min(1, Math.max(0, local / clip.duration)) : 0;
  if (clip.reversed) u = 1 - u;
  return clip.speed * rampRate(clip.ramp, u);
}
