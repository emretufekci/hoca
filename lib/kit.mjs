// Scene kit: math-explainer animation in SVG. Import with `from '#kit'`.
//
// The palette, rate functions and the behaviour of the animations (Write, ShowCreation, Indicate,
// Flash, ShowPassingFlash, Transform...) are ported from manim by 3Blue1Brown (MIT, see NOTICE.md).
// Everything returns SVG strings; anything animated takes an amount k that runs 0 -> 1.
import { typeset } from './tex.mjs';

// --- palette (manimlib default_config.yml) -------------------------------------------------------
export const M = {
  BLUE_E: '#1C758A', BLUE_D: '#29ABCA', BLUE_C: '#58C4DD', BLUE_B: '#9CDCEB', BLUE_A: '#C7E9F1',
  TEAL_E: '#49A88F', TEAL_D: '#55C1A7', TEAL_C: '#5CD0B3', TEAL_B: '#76DDC0', TEAL_A: '#ACEAD7',
  GREEN_E: '#699C52', GREEN_D: '#77B05D', GREEN_C: '#83C167', GREEN_B: '#A6CF8C', GREEN_A: '#C9E2AE',
  YELLOW_E: '#E8C11C', YELLOW_D: '#F4D345', YELLOW_C: '#FFFF00', YELLOW_B: '#FFEA94', YELLOW_A: '#FFF1B6',
  GOLD_E: '#C78D46', GOLD_D: '#E1A158', GOLD_C: '#F0AC5F', GOLD_B: '#F9B775', GOLD_A: '#F7C797',
  RED_E: '#CF5044', RED_D: '#E65A4C', RED_C: '#FC6255', RED_B: '#FF8080', RED_A: '#F7A1A3',
  MAROON_E: '#94424F', MAROON_D: '#A24D61', MAROON_C: '#C55F73', MAROON_B: '#EC92AB', MAROON_A: '#ECABC1',
  PURPLE_E: '#644172', PURPLE_D: '#715582', PURPLE_C: '#9A72AC', PURPLE_B: '#B189C6', PURPLE_A: '#CAA3E8',
  GREY_E: '#222222', GREY_D: '#444444', GREY_C: '#888888', GREY_B: '#BBBBBB', GREY_A: '#DDDDDD',
  WHITE: '#FFFFFF', BLACK: '#000000', PINK: '#D147BD', LIGHT_PINK: '#DC75CD', ORANGE: '#FF862F', GREY_BROWN: '#736357'
};
/** Everyday names for the same palette. One accent color per idea, kept across scenes. */
export const C = {
  bg: M.BLACK, panel: '#141414', panel2: M.GREY_E, line: M.GREY_D,
  text: M.WHITE, muted: M.GREY_B, dim: M.GREY_C,
  blue: M.BLUE_C, teal: M.TEAL_C, green: M.GREEN_C, yellow: M.YELLOW_C, gold: M.GOLD_C, orange: M.ORANGE,
  red: M.RED_C, maroon: M.MAROON_C, pink: M.LIGHT_PINK, purple: M.PURPLE_B
};
export const FONT = { serif: "'Latin Modern Roman', 'CMU Serif', 'Times New Roman', serif", sans: "'Helvetica Neue', Helvetica, Arial, sans-serif", mono: "'Latin Modern Mono', Menlo, Consolas, monospace" };

// --- rate functions (manimlib/utils/rate_functions.py) -------------------------------------------
export const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const linear = t => clamp(t);
/** Zero first and second derivatives at both ends: the default feel of every motion. */
export const smooth = t => { t = clamp(t); const s = 1 - t; return t ** 3 * (10 * s * s + 5 * s * t + t * t); };
export const rushInto = t => 2 * smooth(0.5 * clamp(t));
export const rushFrom = t => 2 * smooth(0.5 * (clamp(t) + 1)) - 1;
export const slowInto = t => Math.sqrt(1 - (1 - clamp(t)) ** 2);
export const doubleSmooth = t => { t = clamp(t); return t < 0.5 ? 0.5 * smooth(2 * t) : 0.5 * (1 + smooth(2 * t - 1)); };
export const thereAndBack = t => { t = clamp(t); return smooth(t < 0.5 ? 2 * t : 2 * (1 - t)); };
export function thereAndBackWithPause(t, pause = 1 / 3) {
  t = clamp(t);
  const a = 2 / (1 - pause);
  return t < 0.5 - pause / 2 ? smooth(a * t) : t < 0.5 + pause / 2 ? 1 : smooth(a - a * t);
}
function bezier(points, t) {
  let p = points.slice();
  while (p.length > 1) p = p.slice(1).map((v, i) => lerp(p[i], v, t));
  return p[0];
}
/** Pulls back a little before going. */
export const runningStart = (t, pull = -0.5) => bezier([0, 0, pull, pull, 1, 1, 1], clamp(t));
/** Goes past the target and settles back. */
export const overshoot = (t, pull = 1.5) => bezier([0, 0, pull, pull, 1, 1], clamp(t));
export const wiggle = (t, wiggles = 2) => thereAndBack(t) * Math.sin(wiggles * Math.PI * clamp(t));
export const lingering = t => clamp(clamp(t) / 0.8);
export const exponentialDecay = (t, halfLife = 0.1) => 1 - Math.exp(-clamp(t) / halfLife);
export const easeOut = rushFrom, easeInOut = smooth;

// --- timing --------------------------------------------------------------------------------------
/** 0 before `from`, 1 after `to`, smoothed in between. Works on progress or on seconds. */
export const ramp = (t, from, to, rate = smooth) => rate((t - from) / Math.max(1e-6, to - from));
/** Amount that starts when sentence `i` of the narration starts. `delay` and `length` are seconds. */
export function onBeat(ctx, i, { delay = 0, length = 1, rate = smooth } = {}) {
  const beat = ctx.beats[Math.min(i, ctx.beats.length - 1)];
  // Silent scenes have no beats: space reveals a fifth of the scene apart.
  const start = beat ? beat.start + delay : ctx.duration * Math.min(0.9, i * 0.2) + delay;
  return rate((ctx.seconds - start) / length);
}
/** 0..1 travel across the whole of sentence `i` (linear; wrap in smooth() if you want easing). */
export function duringBeat(ctx, i) {
  const beat = ctx.beats[Math.min(i, ctx.beats.length - 1)];
  return beat ? clamp((ctx.seconds - beat.start) / Math.max(1e-6, beat.end - beat.start)) : ctx.progress;
}
/** Seconds since sentence `i` started (negative before it). For one-shot effects: flash(x, y, since(ctx, 2) / 0.8). */
export const since = (ctx, i, delay = 0) => ctx.seconds - ((ctx.beats[Math.min(i, ctx.beats.length - 1)]?.start ?? 0) + delay);
/** Amounts for `count` items animating one after another as k goes 0..1 (manim's lag_ratio). */
export function stagger(k, count, lag = 0.5) {
  const total = 1 + (count - 1) * lag;
  return Array.from({ length: count }, (_, i) => clamp(k * total - i * lag));
}

// --- layout --------------------------------------------------------------------------------------
const rectOf = (x, y, w, h, extra = {}) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2, right: x + w, bottom: y + h, ...extra });
/** The drawable area inside the safe margins, plus `u`: 1% of the shorter side, for sizes that scale. */
export function area(ctx) {
  return rectOf(ctx.safe.left, ctx.safe.top, ctx.width - ctx.safe.left - ctx.safe.right, ctx.height - ctx.safe.top - ctx.safe.bottom, { u: Math.min(ctx.width, ctx.height) / 100, vertical: ctx.height > ctx.width * 1.2 });
}
/** Split a rectangle into rows or columns: split(rect, 'rows', [1, 2]) -> two rects, the second twice as tall. */
export function split(rect, direction, weights, gap = 0) {
  const total = weights.reduce((a, b) => a + b, 0), rows = direction === 'rows';
  const room = (rows ? rect.h : rect.w) - gap * (weights.length - 1);
  let offset = 0;
  return weights.map(weight => {
    const size = room * weight / total;
    const r = rows ? rectOf(rect.x, rect.y + offset, rect.w, size) : rectOf(rect.x + offset, rect.y, size, rect.h);
    offset += size + gap;
    return { ...r, u: rect.u, vertical: rect.vertical };
  });
}
/** Shrink a rect by a margin on every side. */
export const inset = (rect, m) => ({ ...rect, ...rectOf(rect.x + m, rect.y + m, rect.w - 2 * m, rect.h - 2 * m) });

// --- generic animation wrappers ------------------------------------------------------------------
export const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = value => Number(value.toFixed(2));
const op = opacity => (opacity < 1 ? ` opacity="${n(clamp(opacity))}"` : '');

/** FadeIn: fade while sliding in from `shift` pixels away (default: up from 0.25 units below). */
export function fadeIn(k, content, { shift = [0, 18], scale = 1 } = {}) {
  k = clamp(k);
  if (k <= 0 || !content) return '';
  if (k >= 1) return content;
  const s = lerp(scale, 1, k);
  return `<g opacity="${n(k)}" transform="translate(${n((1 - k) * shift[0])} ${n((1 - k) * shift[1])})${s !== 1 ? ` scale(${n(s)})` : ''}">${content}</g>`;
}
/** Short form: fade(k, svg) fades and settles upward; fade(k, svg, 0) fades in place. */
export const fade = (k, content, rise = 16) => fadeIn(k, content, { shift: [0, rise] });
/** FadeOut: 1 -> gone as k goes 0..1. */
export const fadeOut = (k, content, { shift = [0, -18] } = {}) => { k = clamp(k); return k >= 1 || !content ? '' : k <= 0 ? content : `<g opacity="${n(1 - k)}" transform="translate(${n(k * shift[0])} ${n(k * shift[1])})">${content}</g>`; };
/** Scale and rotate content about a point. */
export const about = (x, y, content, { scale = 1, rotate = 0 } = {}) => !content ? '' : `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rotate)}) scale(${n(scale)}) translate(${n(-x)} ${n(-y)})">${content}</g>`;
/** GrowFromCenter: scale up from a point with a slight overshoot. */
export const grow = (k, x, y, content) => clamp(k) <= 0 ? '' : about(x, y, content, { scale: Math.max(0.001, overshoot(k, 1.25)) });
/** Indicate: briefly swell (and wobble if `wobble`) to draw the eye, then return. k is a one-shot 0..1. */
export const indicate = (k, x, y, content, { scale = 1.2, wobble = 0 } = {}) => about(x, y, content, { scale: 1 + (scale - 1) * thereAndBack(k), rotate: wobble * wiggle(k) });
/** Move the camera: zoom toward (x, y), given in frame pixels. Wrap the whole scene body. */
export const camera = (ctx, { zoom = 1, x = ctx.width / 2, y = ctx.height / 2 }, content) => `<g transform="translate(${n(ctx.width / 2)} ${n(ctx.height / 2)}) scale(${n(zoom)}) translate(${n(-x)} ${n(-y)})">${content}</g>`;

// --- text and formulas ---------------------------------------------------------------------------
/** DrawBorderThenFill for one piece at amount a: outline traced in the first half, filled in the second. */
function borderThenFill(a, outline, strokeWidth) {
  if (a >= 1) return '';
  if (a <= 0) return ' fill-opacity="0" stroke-opacity="0"';
  const first = Math.min(1, a * 2), second = Math.max(0, a * 2 - 1);
  return ` fill-opacity="${n(second)}" stroke-opacity="${n(1 - second)}" stroke-width="${n(strokeWidth)}" stroke-dasharray="${n(Math.max(0.01, first * outline))} ${n(outline + 10)}"`;
}

/**
 * Text in a Computer Modern face.
 * opts: size, fill, anchor (start|middle|end), weight, font (serif|sans|mono), italic, opacity,
 *       write (0..1: each word's outline is drawn, then filled, like manim's Write), typed (0..1 typewriter).
 */
export function text(x, y, value, opts = {}) {
  const { size = 36, fill = C.text, anchor = 'start', weight = 400, font = 'serif', italic = false, opacity = 1, write = 1, typed = 1, spacing = 0 } = opts;
  if (opacity <= 0 || write <= 0 || typed <= 0) return '';
  let string = String(value);
  if (typed < 1) string = string.slice(0, Math.ceil(string.length * clamp(typed)));
  const attrs = `x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" font-family="${FONT[font] || font}" font-size="${n(size)}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''}${spacing ? ` letter-spacing="${spacing}"` : ''} fill="${fill}"${op(opacity)}`;
  if (write >= 1) return `<text ${attrs}>${esc(string)}</text>`;
  const words = string.split(/(?<=\s)(?=\S)/);
  const amounts = stagger(write, words.length, Math.min(4 / (words.length + 1), 0.35));
  return `<text ${attrs} stroke="${fill}" xml:space="preserve">${words.map((word, i) => `<tspan${borderThenFill(amounts[i], size * 4.2, Math.max(1, size * 0.028)) || ' stroke-opacity="0"'}>${esc(word)}</tspan>`).join('')}</text>`;
}

/** Greedy word wrap; pair with paragraph(). Roughly maxChars ≈ width / (size * 0.46). */
export function wrap(value, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(value).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
/** Multi-line text that wraps to `width` pixels; lines are 1.3 em apart. `write` runs line after line. */
export function paragraph(x, y, value, width, opts = {}) {
  const size = opts.size || 36;
  const lines = wrap(value, Math.max(6, Math.floor(width / (size * 0.46))));
  const amounts = stagger(opts.write ?? 1, lines.length, 0.6);
  return lines.map((row, i) => text(x, y + i * size * 1.3, row, { ...opts, write: amounts[i] })).join('');
}

/** Size in pixels of a formula at a font size: { w, h, ascent, descent }. Use it to lay formulas out. */
export function texSize(latex, size = 48) {
  const t = typeset(latex), s = size / 1000;
  return { w: t.width * s, h: t.height * s, ascent: -t.minY * s, descent: (t.height + t.minY) * s };
}
/**
 * Real LaTeX math: tex(x, y, String.raw`\int_0^1 x^2\,dx = \frac{1}{3}`, { size, fill, write }).
 * (x, y) is the baseline at the anchor (start|middle|end); valign: 'center' centres it on y instead.
 * Color a part with \color{#58C4DD}{...}. `write` draws each glyph's outline then fills it.
 */
export function tex(x, y, latex, opts = {}) {
  const { size = 48, fill = C.text, anchor = 'middle', valign = 'baseline', write = 1, opacity = 1 } = opts;
  if (opacity <= 0 || write <= 0) return '';
  const t = typeset(latex), s = size / 1000;
  const left = x - (anchor === 'middle' ? t.width / 2 : anchor === 'end' ? t.width : 0) * s - t.minX * s;
  const base = valign === 'center' ? y - (t.minY + t.height / 2) * s : y;
  const count = t.parts.length;
  const amounts = write >= 1 ? null : stagger(write, count, Math.min(4 / (count + 1), 0.2));
  const body = t.body.replace(/\u0000(\d+)\u0000/g, (_, i) => (amounts ? borderThenFill(amounts[i], t.parts[i].length || 2000, 1.8 / s) : ''));
  return `<g transform="translate(${n(left)} ${n(base)}) scale(${s})" color="${fill}"${op(opacity)}>${body}</g>`;
}
/** Quick inline math without LaTeX: formula(x, y, 'a^2 + b^2 = c^2'). Prefer tex() for anything real. */
export function formula(x, y, value, opts = {}) {
  const { size = 44, fill = C.text, anchor = 'middle', opacity = 1 } = opts;
  if (opacity <= 0) return '';
  let out = '', shift = 0;
  for (const token of String(value).match(/[\^_]\{[^}]*\}|[\^_].|[^\^_]+/g) || []) {
    const script = token[0] === '^' ? -0.42 : token[0] === '_' ? 0.22 : 0;
    const body = script ? (token[1] === '{' ? token.slice(2, -1) : token.slice(1)) : token;
    out += `<tspan dy="${n((script - shift) * size)}"${script ? ` font-size="${n(size * 0.66)}"` : ''}>${esc(body)}</tspan>`;
    shift = script;
  }
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" font-family="${FONT.serif}" font-style="italic" font-size="${n(size)}" fill="${fill}"${op(opacity)} xml:space="preserve">${out}</text>`;
}
/** A number that counts: DecimalNumber. number(x, y, lerp(0, 3.14, k), { decimals: 2 }). */
export const number = (x, y, value, opts = {}) => text(x, y, `${opts.prefix || ''}${value.toFixed(opts.decimals ?? 0)}${opts.suffix || ''}`, { font: 'serif', ...opts });

// --- shapes --------------------------------------------------------------------------------------
const lengthsOf = points => points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
/** The part of a polyline between fractions a and b of its length (pointwise_become_partial). */
export function partial(points, a, b) {
  if (b <= a || points.length < 2) return [];
  const lengths = lengthsOf(points), total = lengths.reduce((x, y) => x + y, 0);
  const from = a * total, to = b * total, out = [];
  let walked = 0;
  for (const [i, length] of lengths.entries()) {
    const start = walked, end = walked + length;
    const at = d => { const k = length ? (d - start) / length : 0; return [lerp(points[i][0], points[i + 1][0], k), lerp(points[i][1], points[i + 1][1], k)]; };
    if (end >= from && start <= to) {
      if (!out.length) out.push(at(Math.max(from, start)));
      out.push(at(Math.min(to, end)));
    }
    walked = end;
  }
  return out;
}
/**
 * A path through [x, y] points. opts: color, width, draw (0..1 ShowCreation from the start),
 * from (0..1 start of the drawn part), dash, fill, closed, opacity, fillOpacity.
 */
export function polyline(points, opts = {}) {
  const { color = C.blue, width = 4, draw = 1, from = 0, opacity = 1, dash = '', fill = 'none', closed = false, fillOpacity = 1 } = opts;
  if (draw <= 0 || opacity <= 0 || points.length < 2) return '';
  const whole = draw >= 1 && from <= 0;
  const shown = whole ? points : partial(closed ? [...points, points[0]] : points, clamp(from), clamp(draw));
  if (shown.length < 2) return '';
  return `<path d="M${shown.map(p => `${n(p[0])} ${n(p[1])}`).join('L')}${closed && whole ? 'Z' : ''}" fill="${whole ? fill : 'none'}"${fill !== 'none' && whole && fillOpacity < 1 ? ` fill-opacity="${n(fillOpacity)}"` : ''} stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${op(opacity)}/>`;
}
export const line = (x1, y1, x2, y2, opts = {}) => polyline([[x1, y1], [x2, y2]], opts);
/** ShowPassingFlash: a short bright stretch that travels along the path once as k goes 0..1. */
export function passingFlash(points, k, { color = C.yellow, width = 5, timeWidth = 0.2, closed = false } = {}) {
  k = clamp(k);
  if (k <= 0 || k >= 1) return '';
  const upper = lerp(0, 1 + timeWidth, k);
  return polyline(closed ? [...points, points[0]] : points, { color, width, from: Math.max(0, upper - timeWidth), draw: Math.min(1, upper) });
}

/** Point lists for basic shapes, for polyline() and morph(). */
export const shape = {
  circle: (cx, cy, r, steps = 64) => Array.from({ length: steps }, (_, i) => [cx + r * Math.cos(-Math.PI / 2 + 2 * Math.PI * i / steps), cy + r * Math.sin(-Math.PI / 2 + 2 * Math.PI * i / steps)]),
  rect: (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
  square: (cx, cy, side) => [[cx - side / 2, cy - side / 2], [cx + side / 2, cy - side / 2], [cx + side / 2, cy + side / 2], [cx - side / 2, cy + side / 2]],
  polygon: (cx, cy, r, sides, rotation = -Math.PI / 2) => Array.from({ length: sides }, (_, i) => [cx + r * Math.cos(rotation + 2 * Math.PI * i / sides), cy + r * Math.sin(rotation + 2 * Math.PI * i / sides)]),
  graph: (fn, from, to, toX, toY, steps = 120) => Array.from({ length: steps + 1 }, (_, i) => { const v = lerp(from, to, i / steps); return [toX(v), toY(fn(v))]; })
};
/** Resample a closed outline to `count` evenly spaced points. */
export function resample(points, count, closed = true) {
  const loop = closed ? [...points, points[0]] : points;
  const lengths = lengthsOf(loop), total = lengths.reduce((a, b) => a + b, 0);
  const out = [];
  let segment = 0, walked = 0;
  for (let i = 0; i < count; i++) {
    const d = total * i / (closed ? count : count - 1);
    while (segment < lengths.length - 1 && walked + lengths[segment] < d) walked += lengths[segment++];
    const k = lengths[segment] ? clamp((d - walked) / lengths[segment]) : 0;
    out.push([lerp(loop[segment][0], loop[segment + 1][0], k), lerp(loop[segment][1], loop[segment + 1][1], k)]);
  }
  return out;
}
/** Transform: points of shape `a` on their way to shape `b`. Draw with polyline(morph(a, b, k), { closed: true }). */
export function morph(a, b, k, count = 96) {
  const p = resample(a, count), q = resample(b, count), t = smooth(k);
  return p.map((point, i) => [lerp(point[0], q[i][0], t), lerp(point[1], q[i][1], t)]);
}

export function box(x, y, w, h, opts = {}) {
  const { fill = C.panel, stroke = C.line, radius = 12, width = 4, opacity = 1, dash = '', draw = 1 } = opts;
  if (opacity <= 0 || draw <= 0) return '';
  if (draw < 1) return polyline(shape.rect(x, y, w, h), { color: stroke, width, draw, closed: true });
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" rx="${n(radius)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(width)}"${dash ? ` stroke-dasharray="${dash}"` : ''}${op(opacity)}/>`;
}
export function circle(x, y, r, opts = {}) {
  const { fill = C.blue, stroke = 'none', width = 4, opacity = 1, draw = 1 } = opts;
  if (opacity <= 0 || r <= 0 || draw <= 0) return '';
  if (draw < 1) return polyline(shape.circle(x, y, r), { color: stroke === 'none' ? fill : stroke, width, draw, closed: true });
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(width)}"${op(opacity)}/>`;
}
/** A point with a soft glow, for marking a position on a graph or a moving value. */
export function dot(x, y, opts = {}) {
  const { r = 9, color = C.yellow, glow = true, opacity = 1 } = opts;
  if (opacity <= 0) return '';
  const halo = glow ? [3.2, 2.3, 1.6].map((m, i) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * m)}" fill="${color}" opacity="${[0.07, 0.11, 0.18][i]}"/>`).join('') : '';
  return `<g${op(opacity)}>${halo}<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}"/></g>`;
}

/** Arrow that grows from its tail (GrowArrow). `bend` curves it by that many pixels of sideways bulge. */
export function arrow(x1, y1, x2, y2, opts = {}) {
  const { color = C.blue, width = 5, draw = 1, opacity = 1, bend = 0, head = width * 3.6, dash = '' } = opts;
  if (draw <= 0 || opacity <= 0) return '';
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx - (y2 - y1) / length * bend, cy = my + (x2 - x1) / length * bend;
  const at = k => [(1 - k) ** 2 * x1 + 2 * (1 - k) * k * cx + k * k * x2, (1 - k) ** 2 * y1 + 2 * (1 - k) * k * cy + k * k * y2];
  const d = clamp(draw), steps = bend ? 32 : 1;
  const [tx, ty] = at(d), [px, py] = at(Math.max(0, d - 0.04));
  const angle = Math.atan2(ty - py, tx - px), spread = 0.42, size = Math.min(head, length * d * 0.6);
  // The shaft stops inside the tip so the point stays sharp.
  const shaftEnd = Math.max(0, d - size * 0.7 / length);
  const shaft = polyline(Array.from({ length: steps + 1 }, (_, i) => at(shaftEnd * i / steps)), { color, width, dash });
  const back = [tx - size * 0.72 * Math.cos(angle), ty - size * 0.72 * Math.sin(angle)];
  const tip = `<path d="M${n(tx)} ${n(ty)}L${n(tx - size * Math.cos(angle - spread))} ${n(ty - size * Math.sin(angle - spread))}L${n(back[0])} ${n(back[1])}L${n(tx - size * Math.cos(angle + spread))} ${n(ty - size * Math.sin(angle + spread))}Z" fill="${color}"/>`;
  return `<g${op(opacity)}>${shaft}${tip}</g>`;
}
/** Arc of a circle from angle a0 to a1 (radians, counter-clockwise from +x), drawn up to `draw`. */
export function arc(x, y, r, a0, a1, opts = {}) {
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * 20));
  return polyline(Array.from({ length: steps + 1 }, (_, i) => { const a = lerp(a0, a1, i / steps); return [x + r * Math.cos(a), y - r * Math.sin(a)]; }), opts);
}
/** A labelled card: outlined box with a centred title and optional second line. */
export function card(x, y, w, h, title, opts = {}) {
  const { color = C.blue, sub = '', size = Math.min(h * 0.3, w * 0.13), fill = C.panel, opacity = 1 } = opts;
  if (opacity <= 0) return '';
  const body = box(x, y, w, h, { stroke: color, fill }) + text(x + w / 2, y + h / 2 + (sub ? -size * 0.15 : size * 0.33), title, { size, anchor: 'middle' })
    + (sub ? text(x + w / 2, y + h / 2 + size * 0.95, sub, { size: size * 0.62, anchor: 'middle', fill: C.muted }) : '');
  return opacity < 1 ? `<g opacity="${n(opacity)}">${body}</g>` : body;
}

/**
 * Curly brace spanning (x1, y1)-(x2, y2), bulging to the left of that direction (so left-to-right
 * gives a brace above; swap the ends for one below). Returns { svg, tip: [x, y] } to place a label.
 */
export function brace(x1, y1, x2, y2, opts = {}) {
  const { color = C.text, width = 3.5, k = 1, depth = 18 } = opts;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / length, uy = (y2 - y1) / length, nx = uy, ny = -ux;
  const P = (along, out) => [x1 + ux * along * length + nx * out * depth, y1 + uy * along * length + ny * out * depth];
  const q = Math.min(0.12, depth * 1.4 / length);
  const d = [P(0, 0), P(0, 0.55), P(q, 0.5), P(0.5 - q, 0.5), P(0.5, 0.5), P(0.5, 1), P(0.5, 0.5), P(0.5 + q, 0.5), P(1 - q, 0.5), P(1, 0.55), P(1, 0)].map(p => `${n(p[0])} ${n(p[1])}`);
  const path = `M${d[0]}Q${d[1]} ${d[2]}L${d[3]}Q${d[4]} ${d[5]}Q${d[6]} ${d[7]}L${d[8]}Q${d[9]} ${d[10]}`;
  const [mx, my] = P(0.5, 0);
  const svg = clamp(k) <= 0 ? '' : about(mx, my, `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${op(clamp(k * 2))}/>`, { scale: Math.max(0.001, smooth(k)) });
  return { svg, tip: P(0.5, 1.9) };
}

// --- attention -----------------------------------------------------------------------------------
/** Flash: short lines bursting out from a point. One-shot: pass k = since(ctx, i) / 0.8. */
export function flash(x, y, k, { color = C.yellow, radius = 34, lines = 12, length = 22, width = 4 } = {}) {
  k = clamp(k);
  if (k <= 0 || k >= 1) return '';
  const upper = lerp(0, 1.5, k), from = Math.max(0, upper - 0.5), to = Math.min(1, upper);
  let out = '';
  for (let i = 0; i < lines; i++) {
    const a = 2 * Math.PI * i / lines, r0 = radius - length + length * from, r1 = radius - length + length * to;
    out += line(x + r0 * Math.cos(a), y + r0 * Math.sin(a), x + r1 * Math.cos(a), y + r1 * Math.sin(a), { color, width });
  }
  return out;
}
/** FlashAround: a highlight that runs once around a rectangle. One-shot k. */
export const flashAround = (x, y, w, h, k, opts = {}) => passingFlash(shape.rect(x - (opts.buff ?? 10), y - (opts.buff ?? 10), w + 2 * (opts.buff ?? 10), h + 2 * (opts.buff ?? 10)), k, { timeWidth: 0.5, closed: true, ...opts });
/** SurroundingRectangle drawn around something, staying once drawn. */
export const surround = (x, y, w, h, opts = {}) => polyline(shape.rect(x - (opts.buff ?? 12), y - (opts.buff ?? 12), w + 2 * (opts.buff ?? 12), h + 2 * (opts.buff ?? 12)), { color: C.yellow, width: 4, closed: true, ...opts });
/** Underline drawn under a span of width w starting at x. */
export const underline = (x, y, w, opts = {}) => line(x, y, x + w, y, { color: C.yellow, width: 4, ...opts });

// --- coordinate systems --------------------------------------------------------------------------
/**
 * Axes inside `rect` for the given data ranges. opts: x, y ([min, max]), color, width, ticks,
 * numbers (label the ticks), grid (true for a NumberPlane), step ([sx, sy] tick spacing).
 * Returns { svg(k), x(v), y(v), p(vx, vy), plot, fill, riemann, vector, point, label, tangent }.
 */
export function axes(rect, { x: xr = [-1, 1], y: yr = [-1, 1], color = M.GREY_B, ticks = true, numbers = false, grid = false, width = 3, step = [1, 1], numberSize } = {}) {
  const X = v => rect.x + (v - xr[0]) / (xr[1] - xr[0]) * rect.w;
  const Y = v => rect.y + rect.h - (v - yr[0]) / (yr[1] - yr[0]) * rect.h;
  const zeroX = X(clamp(0, xr[0], xr[1])), zeroY = Y(clamp(0, yr[0], yr[1]));
  const marks = (range, s) => { const out = []; for (let v = Math.ceil(range[0] / s) * s; v <= range[1] + 1e-9 && out.length < 60; v += s) out.push(Number(v.toFixed(6))); return out; };
  const xs = marks(xr, step[0]), ys = marks(yr, step[1]);
  const size = numberSize || Math.max(18, Math.min(rect.w, rect.h) * 0.04);
  const api = {
    x: X, y: Y, p: (vx, vy) => [X(vx), Y(vy)], rect,
    svg(k = 1) {
      k = clamp(k);
      if (k <= 0) return '';
      let out = '';
      if (grid) {
        // NumberPlane: blue lines sweep in from the centre, with fainter lines halfway between.
        const g = ramp(k, 0, 0.8);
        const lineAt = (a, b, c, d, o, w) => { const mx = (a + c) / 2, my = (b + d) / 2; return line(lerp(mx, a, g), lerp(my, b, g), lerp(mx, c, g), lerp(my, d, g), { color: M.BLUE_D, width: w, opacity: o }); };
        for (const s of [0.5, 1]) {
          for (const v of marks(xr, step[0] * s)) if (v && (s === 1 || Math.abs(v / step[0] % 1) > 1e-6)) out += lineAt(X(v), rect.y, X(v), rect.bottom ?? rect.y + rect.h, s === 1 ? 0.85 : 0.35, s === 1 ? 2.5 : 1.5);
          for (const v of marks(yr, step[1] * s)) if (v && (s === 1 || Math.abs(v / step[1] % 1) > 1e-6)) out += lineAt(rect.x, Y(v), rect.x + rect.w, Y(v), s === 1 ? 0.85 : 0.35, s === 1 ? 2.5 : 1.5);
        }
      }
      out += arrow(rect.x, zeroY, rect.x + rect.w, zeroY, { color, width, draw: k }) + arrow(zeroX, rect.y + rect.h, zeroX, rect.y, { color, width, draw: k });
      const t = ramp(k, 0.5, 1), mark = width * 2.4;
      if (ticks && t > 0 && !grid) {
        for (const v of xs) if (v && X(v) < rect.x + rect.w - mark * 3) out += line(X(v), zeroY - mark, X(v), zeroY + mark, { color, width: width * 0.7, opacity: t });
        for (const v of ys) if (v && Y(v) > rect.y + mark * 3) out += line(zeroX - mark, Y(v), zeroX + mark, Y(v), { color, width: width * 0.7, opacity: t });
      }
      if (numbers && t > 0) {
        for (const v of xs) if (v && X(v) < rect.x + rect.w - size) out += text(X(v), zeroY + size * 1.35, String(v), { size, anchor: 'middle', fill: color, opacity: t });
        for (const v of ys) if (v && Y(v) > rect.y + size) out += text(zeroX - size * 0.6, Y(v) + size * 0.33, String(v), { size, anchor: 'end', fill: color, opacity: t });
      }
      return out;
    },
    /** Graph of y = fn(x), drawn left to right up to `draw`. opts.from / opts.to limit the domain. */
    plot(fn, opts = {}) {
      const from = opts.from ?? xr[0], to = opts.to ?? xr[1], span = yr[1] - yr[0], points = [];
      for (let i = 0, steps = opts.steps || 200; i <= steps; i++) {
        const vx = lerp(from, to, i / steps), vy = fn(vx);
        if (Number.isFinite(vy) && vy >= yr[0] - span * 0.02 && vy <= yr[1] + span * 0.02) points.push([X(vx), Y(vy)]);
      }
      const { from: _f, to: _t, steps: _s, ...style } = opts;
      return polyline(points, { color: C.yellow, width: 5, ...style });
    },
    /** Shaded area between the graph and the x-axis from a to b; `k` sweeps it in from the left. */
    fill(fn, a, b, { color = C.blue, opacity = 0.35, k = 1 } = {}) {
      k = clamp(k);
      if (k <= 0) return '';
      const end = lerp(a, b, k), points = shape.graph(fn, a, end, X, Y, 80);
      return `<path d="M${n(X(a))} ${n(Y(0))}L${points.map(p => `${n(p[0])} ${n(p[1])}`).join('L')}L${n(X(end))} ${n(Y(0))}Z" fill="${color}" fill-opacity="${opacity}" stroke="none"/>`;
    },
    /** Riemann rectangles under the graph: `count` bars from a to b, growing in one after another. */
    riemann(fn, a, b, count, { color = C.blue, k = 1, opacity = 0.55 } = {}) {
      const dx = (b - a) / count, amounts = stagger(k, count, 0.3);
      let out = '';
      for (let i = 0; i < count; i++) {
        const v = a + i * dx, h = fn(v) * smooth(amounts[i]);
        if (amounts[i] > 0) out += `<rect x="${n(X(v))}" y="${n(Math.min(Y(h), Y(0)))}" width="${n(X(v + dx) - X(v))}" height="${n(Math.abs(Y(h) - Y(0)))}" fill="${color}" fill-opacity="${opacity}" stroke="${C.bg}" stroke-width="1.5"/>`;
      }
      return out;
    },
    /** Arrow from (fx, fy) (default the origin) to (vx, vy) in data coordinates. */
    vector: (vx, vy, opts = {}) => arrow(X(opts.fromX ?? 0), Y(opts.fromY ?? 0), X(vx), Y(vy), { color: C.yellow, ...opts }),
    point: (vx, vy, opts = {}) => dot(X(vx), Y(vy), opts),
    label: (vx, vy, value, opts = {}) => text(X(vx) + (opts.dx || 0), Y(vy) + (opts.dy || 0), value, { size, fill: C.muted, anchor: 'middle', ...opts }),
    /** Tangent line to fn at x = at, `length` data units long. */
    tangent(fn, at, { length = (xr[1] - xr[0]) * 0.3, h = 1e-4, ...opts } = {}) {
      const slope = (fn(at + h) - fn(at - h)) / (2 * h), half = length / 2 / Math.hypot(1, slope * (rect.h / (yr[1] - yr[0])) / (rect.w / (xr[1] - xr[0])));
      return line(X(at - half), Y(fn(at) - slope * half), X(at + half), Y(fn(at) + slope * half), { color: C.teal, width: 4, ...opts });
    }
  };
  return api;
}
/** NumberPlane: axes with a grid. Same helpers as axes(). */
export const numberPlane = (rect, opts = {}) => axes(rect, { grid: true, ...opts });
/** A horizontal number line with labelled ticks. Returns { svg(k), x(v), y } . */
export function numberLine(x, y, w, { range = [0, 10], step = 1, color = M.GREY_B, size = 26, numbers = true } = {}) {
  const X = v => x + (v - range[0]) / (range[1] - range[0]) * w;
  return {
    x: X, y,
    svg(k = 1) {
      let out = line(x, y, x + w, y, { color, width: 3, draw: k });
      const t = ramp(k, 0.4, 1);
      for (let v = Math.ceil(range[0] / step) * step; v <= range[1] + 1e-9; v += step) {
        if (X(v) > x + w * clamp(k)) continue;
        out += line(X(v), y - 9, X(v), y + 9, { color, width: 2.5, opacity: t }) + (numbers ? text(X(v), y + size * 1.5, String(Number(v.toFixed(6))), { size, anchor: 'middle', fill: color, opacity: t }) : '');
      }
      return out;
    }
  };
}

// --- the frame -----------------------------------------------------------------------------------
/**
 * Wrap scene content in the complete <svg>: background, an optional heading written in at the start,
 * and a short fade at the end so scenes cut softly. `body` receives the rect left below the heading.
 *   return scene(ctx, { title: 'Why it works' }, rect => ...svg for rect...);
 * opts: title, kicker (small label above), accent, fadeOut (seconds, 0 to hold the last frame).
 */
export function scene(ctx, opts = {}, body) {
  const { title = '', kicker = '', accent = C.blue, fadeOut: out = 0.3 } = opts;
  const a = area(ctx), u = a.u;
  const titleSize = (a.vertical ? 6.6 : 5.4) * u, kickerSize = (a.vertical ? 3.6 : 3.1) * u;
  let y = a.y, head = '';
  if (kicker) {
    y += kickerSize;
    head += text(a.vertical ? a.cx : a.x, y, kicker, { size: kickerSize, fill: accent, font: 'serif', italic: true, anchor: a.vertical ? 'middle' : 'start', write: ramp(ctx.seconds, 0, 0.7, linear) });
    y += kickerSize * 0.6;
  }
  if (title) {
    const rows = wrap(title, Math.floor(a.w / (titleSize * 0.46)));
    const amounts = stagger(ramp(ctx.seconds, 0.05, 1.1, linear), rows.length, 0.6);
    for (const [i, row] of rows.entries()) { y += titleSize; head += text(a.vertical ? a.cx : a.x, y, row, { size: titleSize, anchor: a.vertical ? 'middle' : 'start', write: amounts[i] }); y += titleSize * 0.2; }
    y += titleSize * 0.45;
  }
  const rect = { ...rectOf(a.x, y, a.w, a.bottom - y), u, vertical: a.vertical };
  const content = typeof body === 'function' ? body(rect) : body || '';
  // The last scene holds its final frame; the others dip out so the cut is soft.
  const last = ctx.scene === ctx.sceneCount - 1;
  const leaving = out > 0 && !last ? 1 - ramp(ctx.seconds, ctx.duration - out, ctx.duration) : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.width}" height="${ctx.height}" viewBox="0 0 ${ctx.width} ${ctx.height}"><rect width="${ctx.width}" height="${ctx.height}" fill="${C.bg}"/><g${op(leaving)}>${head}${content}</g></svg>`;
}
