import { Chroma } from '../types';

/** Green screen maths on raw RGBA pixels. Pure, so it is unit tested. */

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 208, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// colour without brightness, so shadows on the backdrop still key out
const cb = (r: number, g: number, b: number) => -0.169 * r - 0.331 * g + 0.5 * b;
const cr = (r: number, g: number, b: number) => 0.5 * r - 0.419 * g - 0.081 * b;

/**
 * Make pixels near the key colour transparent, in place.
 * Tolerance is how far from the key still counts; softness is the width of the feathered edge.
 */
export function applyChroma(data: Uint8ClampedArray, chroma: Chroma): void {
  const [kr, kg, kb] = hexToRgb(chroma.color);
  const kcb = cb(kr, kg, kb);
  const kcr = cr(kr, kg, kb);
  const tol = (Math.min(100, Math.max(0, chroma.tolerance)) / 100) * 120;
  const soft = Math.max(1, (Math.min(100, Math.max(0, chroma.softness)) / 100) * 80);
  const spillEdge = tol + soft * 2.5;
  const greenKey = kg >= kr && kg >= kb;
  const blueKey = !greenKey && kb >= kr;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const d = Math.hypot(cb(r, g, b) - kcb, cr(r, g, b) - kcr);
    if (d >= spillEdge) continue;
    if (d <= tol) {
      data[i + 3] = 0;
      continue;
    }
    const a = (d - tol) / soft;
    if (a < 1) data[i + 3] = Math.round(data[i + 3] * a);
    // pull the backdrop's tint out of the edge pixels that stay
    if (greenKey) data[i + 1] = Math.min(g, Math.max(r, b));
    else if (blueKey) data[i + 2] = Math.min(b, Math.max(r, g));
  }
}
