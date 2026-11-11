// Hoca's timeline inside a Remotion scene: import { useHoca, C } from '#hoca'.
// The same ctx an SVG scene gets (seconds, beats, beat, progress, safe, inputs...) for the current frame,
// plus the beat timing helpers, so a React scene keys its motion on the narration the same way.
import { getInputProps, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';

export type Beat = { start: number; end: number; text: string };
export type Input = { href: string; width: number; height: number };
export type HocaContext = {
  width: number; height: number; fps: number; format: string; language: string;
  duration: number; durationInFrames: number; scene: number; sceneCount: number;
  safe: { top: number; right: number; bottom: number; left: number };
  beats: Beat[]; inputs: Record<string, Input>;
};

/** manim's palette, the same colors as the SVG kit's C. */
export const C = {
  bg: '#000000', panel: '#141414', line: '#444444', text: '#FFFFFF', muted: '#BBBBBB', dim: '#888888',
  blue: '#58C4DD', teal: '#5CD0B3', green: '#83C167', yellow: '#FFFF00', gold: '#F0AC5F', orange: '#FF862F',
  red: '#FC6255', maroon: '#C55F73', pink: '#DC75CD', purple: '#B189C6'
};
export const FONT = { serif: "'Latin Modern Roman', 'CMU Serif', 'Times New Roman', serif", sans: "'Helvetica Neue', Helvetica, Arial, sans-serif", mono: "'Latin Modern Mono', Menlo, monospace" };

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); const s = 1 - x; return x ** 3 * (10 * s * s + 5 * s * x + x * x); };

export function useHoca() {
  const ctx = (getInputProps() as { ctx: HocaContext }).ctx;
  const frame = useCurrentFrame();
  const seconds = frame / ctx.fps;
  let beat = -1;
  ctx.beats.forEach((b, i) => { if (seconds >= b.start) beat = i; });
  const at = (i: number) => ctx.beats[Math.min(Math.max(0, i), ctx.beats.length - 1)]?.start ?? 0;
  return {
    ...ctx, frame, seconds, beat,
    progress: Math.min(1, seconds / Math.max(1e-6, ctx.duration)),
    /** The usable area: the frame minus platform UI and the subtitle band. */
    area: { x: ctx.safe.left, y: ctx.safe.top, w: ctx.width - ctx.safe.left - ctx.safe.right, h: ctx.height - ctx.safe.top - ctx.safe.bottom },
    /** 0 → 1 over `length` seconds, starting `delay` seconds after sentence i begins. */
    onBeat: (i: number, { delay = 0, length = 1 } = {}) => smooth((seconds - at(i) - delay) / length),
    /** 0 → 1 across the whole of sentence i. */
    duringBeat: (i: number) => { const b = ctx.beats[i]; return b ? smooth((seconds - b.start) / Math.max(1e-6, b.end - b.start)) : 0; },
    /** Seconds since sentence i began (negative before it). */
    since: (i: number, delay = 0) => seconds - at(i) - delay,
    /** URL of one of the user's images, for <Img src={...}/>. */
    image: (name: string) => staticFile(ctx.inputs[name].href)
  };
}

export { interpolate, Easing };
