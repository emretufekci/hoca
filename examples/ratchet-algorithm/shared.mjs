import { C, circle, line, arc, box, text } from '#kit';

// One color per idea, used the same way in every scene.
export const K = { chain: C.blue, message: C.yellow, thief: C.red, safe: C.green, fresh: C.purple };

/** Padlock centred on (x, y); `s` is its width. */
export function lock(x, y, s, color, opacity = 1) {
  if (opacity <= 0) return '';
  const w = Math.max(3, s * 0.11);
  return `<g opacity="${opacity}">` + arc(x, y - s * 0.12, s * 0.27, 0, Math.PI, { color, width: w })
    + line(x - s * 0.27, y - s * 0.12, x - s * 0.27, y + s * 0.02, { color, width: w }) + line(x + s * 0.27, y - s * 0.12, x + s * 0.27, y + s * 0.02, { color, width: w })
    + box(x - s * 0.42, y, s * 0.84, s * 0.62, { fill: color, stroke: color, radius: s * 0.1, width: 0 }) + circle(x, y + s * 0.3, s * 0.08, { fill: C.bg }) + '</g>';
}

/** Key centred on (x, y) pointing right; `s` is its length. */
export function key(x, y, s, color, opacity = 1) {
  if (opacity <= 0) return '';
  const w = Math.max(3, s * 0.1), r = s * 0.2;
  return `<g opacity="${opacity}">` + circle(x - s * 0.3, y, r, { fill: 'none', stroke: color, width: w })
    + line(x - s * 0.1, y, x + s * 0.5, y, { color, width: w }) + line(x + s * 0.28, y, x + s * 0.28, y + s * 0.18, { color, width: w }) + line(x + s * 0.46, y, x + s * 0.46, y + s * 0.14, { color, width: w }) + '</g>';
}

/** A red cross of size `s`, drawn in as k goes 0..1. */
export const cross = (x, y, s, k, color = C.red) => k <= 0 ? '' : line(x - s, y - s, x + s, y + s, { color, width: s * 0.36, draw: Math.min(1, k * 2) }) + line(x + s, y - s, x - s, y + s, { color, width: s * 0.36, draw: Math.max(0, k * 2 - 1) });

/** Small caption under or beside a diagram element. */
export const label = (x, y, value, u, opts = {}) => text(x, y, value, { size: u * 3.8, anchor: 'middle', fill: C.muted, ...opts });
