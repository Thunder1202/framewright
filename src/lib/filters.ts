import { Adjust } from '../types';

export interface FilterPreset {
  id: string;
  name: string;
  css: string;
  /** blur in thousandths of canvas width, added on top of css */
  blur?: number;
}

export const FILTERS: FilterPreset[] = [
  { id: 'none', name: 'Original', css: '' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.45) contrast(1.08)' },
  { id: 'punch', name: 'Punch', css: 'contrast(1.3) saturate(1.2) brightness(1.02)' },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.1)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.5) brightness(0.9)' },
  { id: 'golden', name: 'Golden', css: 'sepia(0.3) saturate(1.3) brightness(1.04)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.55) contrast(0.9) brightness(1.06) saturate(0.85)' },
  { id: 'faded', name: 'Faded', css: 'contrast(0.78) brightness(1.12) saturate(0.8)' },
  { id: 'arctic', name: 'Arctic', css: 'hue-rotate(12deg) saturate(0.9) brightness(1.05) contrast(1.05)' },
  { id: 'dusk', name: 'Dusk', css: 'hue-rotate(-14deg) saturate(1.25) contrast(1.1) brightness(0.95)' },
  { id: 'haze', name: 'Haze', css: 'brightness(1.1) saturate(1.15) contrast(0.92)', blur: 1.2 },
  { id: 'neon', name: 'Neon', css: 'saturate(2) contrast(1.2) hue-rotate(20deg)' },
];

const byId = new Map(FILTERS.map((f) => [f.id, f]));

/** Canvas `filter` string for a preset plus manual adjustments. `canvasWidth` scales blur. */
export function filterCss(filterId: string, a: Adjust, canvasWidth: number): string {
  const parts: string[] = [];
  const preset = byId.get(filterId);
  if (preset?.css) parts.push(preset.css);
  if (a.brightness) parts.push(`brightness(${(1 + a.brightness / 200).toFixed(3)})`);
  if (a.contrast) parts.push(`contrast(${(1 + a.contrast / 200).toFixed(3)})`);
  if (a.saturation) parts.push(`saturate(${Math.max(0, 1 + a.saturation / 100).toFixed(3)})`);
  if (a.hue) parts.push(`hue-rotate(${(a.hue * 1.8).toFixed(1)}deg)`);
  const blur = ((preset?.blur ?? 0) + a.blur * 0.2) * (canvasWidth / 1000);
  if (blur > 0.05) parts.push(`blur(${blur.toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** CSS filter for small preview swatches (no canvas scaling). */
export function swatchCss(filterId: string): string {
  const preset = byId.get(filterId);
  if (!preset) return 'none';
  return [preset.css, preset.blur ? `blur(${preset.blur * 0.3}px)` : ''].filter(Boolean).join(' ') || 'none';
}
