import { scene, C, fade, text, box, circle, arrow, onBeat, duringBeat, stagger, ramp } from '#kit';
import { K, key, cross, label } from './shared.mjs';

const STEPS = 3;

export function render(ctx) {
  return scene(ctx, { kicker: 'One key per message' }, rect => {
    const u = rect.u, v = rect.vertical;
    // The chain runs down the frame when it is tall and across it when it is wide.
    const pad = v ? rect.h * 0.08 : rect.w * 0.05;
    const main = i => (v ? rect.y + pad + (rect.h - 2 * pad) * i / STEPS : rect.x + pad + (rect.w - 2 * pad) * i / STEPS);
    const spine = v ? rect.x + rect.w * 0.3 : rect.y + rect.h * 0.3;
    const side = v ? rect.x + rect.w * 0.72 : rect.y + rect.h * 0.72;
    const at = (m, cross_) => (v ? [cross_, m] : [m, cross_]);
    const r = u * (v ? 4.6 : 5), fs = u * (v ? 3.4 : 3.2);

    const firstKey = ramp(ctx.seconds, 0.1, 0.8);
    const steps = stagger(duringBeat(ctx, 1) * 1.08, STEPS, 0.15);
    const erase = stagger(onBeat(ctx, 2, { length: 1.6 }), STEPS, 0.4);
    const messages = stagger(onBeat(ctx, 0, { length: 1.4 }), STEPS);

    let out = '';
    for (let i = 0; i <= STEPS; i++) {
      const [cx, cy] = at(main(i), spine);
      const shown = i === 0 ? firstKey : ramp(steps[i - 1], 0.55, 1);
      const gone = i < STEPS ? erase[i] : 0;
      out += fade(shown, circle(cx, cy, r, { fill: C.panel, stroke: gone > 0.5 ? C.dim : K.chain, width: 5 }) + key(cx + r * 0.05, cy, r * 1.15, gone > 0.5 ? C.dim : K.chain), 0);
      out += cross(cx, cy, r * 0.62, gone, C.red);
      if (i === 0) out += fade(shown, v ? label(cx - r - u * 2, cy + fs * 0.35, 'chain key', u, { anchor: 'end', size: fs }) : label(cx, cy - r - u * 2, 'chain key', u, { size: fs }), 0);
    }
    for (let i = 0; i < STEPS; i++) {
      const k = steps[i];
      const [ax, ay] = at(main(i), spine), [bx, by] = at(main(i + 1), spine);
      const [mx, my] = at((main(i) + main(i + 1)) / 2, spine), [sx, sy] = at((main(i) + main(i + 1)) / 2, side);
      const gap = r + u * 1.2, fw = u * (v ? 13 : 11), fh = u * 6;
      // chain key -> one-way function -> next chain key, with a message key branching off
      out += v ? arrow(ax, ay + gap, mx, my - fh / 2 - u, { color: K.chain, draw: ramp(k, 0, 0.3) }) : arrow(ax + gap, ay, mx - fw / 2 - u, my, { color: K.chain, draw: ramp(k, 0, 0.3) });
      out += fade(ramp(k, 0.2, 0.45), box(mx - fw / 2, my - fh / 2, fw, fh, { stroke: C.text, radius: u * 1.4 }) + text(mx, my + fs * 0.36, 'one-way', { size: fs * 0.8, anchor: 'middle', weight: 600 }), 0);
      out += v ? arrow(mx, my + fh / 2 + u, bx, by - gap, { color: K.chain, draw: ramp(k, 0.45, 0.8) }) : arrow(mx + fw / 2 + u, my, bx - gap, by, { color: K.chain, draw: ramp(k, 0.45, 0.8) });
      out += v ? arrow(mx + fw / 2 + u, my, sx - r * 1.5, sy, { color: K.message, draw: ramp(k, 0.45, 0.8) }) : arrow(mx, my + fh / 2 + u, sx, sy - r * 1.3, { color: K.message, draw: ramp(k, 0.45, 0.8) });
      // The message this key will lock is waiting from the first sentence on.
      const lit = ramp(k, 0.75, 1);
      out += fade(messages[i], box(sx - r * 1.35, sy - r * 1.1, r * 2.7, r * 2.2, { stroke: lit > 0.5 ? K.message : C.line, radius: u * 1.6, width: 4 })
        + label(sx, sy + r * 1.1 + fs * 1.25, `message ${i + 1}`, u, { size: fs * 0.92 }));
      out += key(sx, sy, r * 1.25, K.message, lit);
    }
    return out;
  });
}
