/**
 * Camera-shake removal, the simple kind: measure how far the picture slides from
 * one frame to the next, find the smooth path through that wobble, and work out
 * the shift that puts each frame back on the smooth path. Handles sliding only,
 * not rotation or rolling-shutter warp. Pure, so it is unit tested.
 */

/** Analysis frames are shrunk to this size, in grey. */
export const STAB_W = 96;
export const STAB_H = 54;
const SEARCH = 7;

/** How far `b` has moved relative to `a`, in analysis pixels. Positive x is rightwards. */
export function estimateShift(a: Uint8Array, b: Uint8Array, w = STAB_W, h = STAB_H): { dx: number; dy: number } {
  const m = SEARCH + 1;
  let best = Infinity;
  let bx = 0;
  let by = 0;
  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      let sum = 0;
      // every other pixel is plenty, and stopping early once a guess is worse keeps this quick
      for (let y = m; y < h - m && sum <= best; y += 2) {
        const ra = y * w;
        const rb = (y + dy) * w + dx;
        for (let x = m; x < w - m; x += 2) {
          const d = a[ra + x] - b[rb + x];
          sum += d < 0 ? -d : d;
        }
      }
      // on a tie prefer the smaller move, so a flat picture reads as still
      if (sum < best || (sum === best && Math.abs(dx) + Math.abs(dy) < Math.abs(bx) + Math.abs(by))) {
        best = sum;
        bx = dx;
        by = dy;
      }
    }
  }
  return { dx: bx, dy: by };
}

/**
 * From frame-to-frame moves to per-frame corrections.
 * `radius` is how many samples either side are averaged into the smooth path.
 */
export function corrections(steps: number[], radius: number): number[] {
  const path: number[] = [0];
  for (const s of steps) path.push(path[path.length - 1] + s);
  return path.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(path.length - 1, i + radius); j++) {
      sum += path[j];
      n++;
    }
    return sum / n - p;
  });
}

/** Grey, shrunken copy of RGBA pixels that are already STAB_W x STAB_H. */
export function toGrey(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return out;
}
