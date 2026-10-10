import { scene, C, fade, text, box, arrow, onBeat, duringBeat, ramp, lerp, stagger } from '#kit';
import { K, lock, key, cross, label } from './shared.mjs';

const DAYS = ['Mon', 'Tue', 'Wed', 'Yesterday', 'Today'];

export function render(ctx) {
  return scene(ctx, {}, rect => {
    const u = rect.u, count = DAYS.length;
    const size = Math.min(rect.w / (count + 0.6), rect.h * 0.3);
    const rowY = rect.y + rect.h * (rect.vertical ? 0.38 : 0.46);
    const x = i => rect.x + rect.w * (i + 0.5) / count;
    // Already on screen in the first frame: a short video has no time for an empty opening.
    const appear = stagger(ramp(ctx.seconds, -0.6, 0.5), count);
    const stolen = onBeat(ctx, 0, { delay: 0.5, length: 0.8 });
    const reach = duringBeat(ctx, 1);
    const sealed = onBeat(ctx, 2, { length: 0.6 });

    let out = '';
    DAYS.forEach((day, i) => {
      const today = i === count - 1;
      const color = today ? lerp(0, 1, stolen) > 0.5 ? K.thief : K.chain : sealed > 0.5 ? K.safe : K.chain;
      out += fade(appear[i], box(x(i) - size * 0.42, rowY - size * 0.5, size * 0.84, size, { stroke: color, radius: size * 0.16, width: 4 })
        + lock(x(i), rowY - size * 0.08, size * 0.42, color)
        + label(x(i), rowY + size * 0.5 + u * 4.6, day, u, { fill: today ? C.text : C.muted, size: u * (rect.vertical ? 2.9 : 3.2) }));
    });

    // The stolen key drops onto today's message.
    const last = x(count - 1), keyY = lerp(rowY - size * 1.9, rowY - size * 0.95, stolen);
    out += key(last, keyY, size * 0.62, K.thief, stolen);
    out += fade(stolen, label(last, rowY - size * 1.35 - u * 3, 'stolen', u, { fill: K.thief, weight: 700 }), 0);

    // The thief reaches back toward older messages... and is stopped.
    const from = last - size * 0.5, to = x(count - 2) + size * 0.5;
    const arrowY = rowY + size * 0.5 + u * (rect.vertical ? 11 : 8.5);
    out += arrow(last, arrowY, lerp(last, x(0), reach * (1 - sealed * 0.72)), arrowY, { color: K.thief, width: 6, draw: reach > 0 ? 1 : 0, opacity: reach > 0 ? 1 : 0 });
    out += cross((from + to) / 2, arrowY, u * 2.6, sealed);

    const caption = rect.vertical ? rect.y + rect.h * 0.8 : rect.y + rect.h * 0.97;
    out += fade(ramp(reach, 0.1, 0.5) * (1 - sealed), text(rect.cx, caption, 'Can they read the old ones?', { size: u * (rect.vertical ? 5.4 : 4.4), anchor: 'middle', weight: 600 }));
    out += fade(sealed, text(rect.cx, caption, 'Old messages stay sealed', { size: u * (rect.vertical ? 5.4 : 4.4), anchor: 'middle', weight: 700, fill: K.safe }));
    return out;
  });
}
