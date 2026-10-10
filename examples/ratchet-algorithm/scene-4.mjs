import { scene, C, fade, text, box, circle, arrow, line, onBeat, duringBeat, stagger, ramp, lerp } from '#kit';
import { K, key, cross, label } from './shared.mjs';

function phone(cx, cy, w, h, name, u, size) {
  return box(cx - w / 2, cy - h / 2, w, h, { stroke: C.text, radius: w * 0.16, width: 5 }) + line(cx - w * 0.16, cy - h / 2 + h * 0.07, cx + w * 0.16, cy - h / 2 + h * 0.07, { color: C.dim, width: 5 })
    + text(cx, cy + h / 2 + size * 1.3, name, { size, anchor: 'middle', fill: C.muted });
}

export function render(ctx) {
  return scene(ctx, { kicker: 'Healing the chain' }, rect => {
    const u = rect.u, v = rect.vertical, fs = u * (v ? 3.5 : 3);
    const topY = rect.y + rect.h * (v ? 0.3 : 0.33), chainY = rect.y + rect.h * (v ? 0.72 : 0.7);
    const pw = Math.min(rect.w * 0.17, rect.h * 0.2), ph = pw * 1.7;
    const leftX = rect.x + rect.w * 0.14, rightX = rect.right - rect.w * 0.14;
    const r = u * (v ? 3.6 : 3.8);
    const dot = i => rect.x + rect.w * (0.08 + 0.84 * i / 5);

    const follow = stagger(duringBeat(ctx, 0), 3, 0.2);
    const swap = duringBeat(ctx, 1);
    const mixed = ramp(swap, 0.62, 0.95);
    const restart = stagger(onBeat(ctx, 2, { length: 1.5 }), 3, 0.3);
    const locked = onBeat(ctx, 2, { delay: 1.6, length: 0.6 });

    let out = '';
    // The old chain, with the thief following each new key.
    for (let i = 0; i < 3; i++) {
      out += fade(follow[i], circle(dot(i), chainY, r, { fill: C.panel, stroke: K.chain, width: 5 }) + key(dot(i), chainY, r * 1.1, K.chain), 0);
      if (i < 2) out += arrow(dot(i) + r * 1.3, chainY, dot(i + 1) - r * 1.3, chainY, { color: K.chain, draw: follow[i + 1] });
    }
    const eye = follow[0] + follow[1] + follow[2];
    const thiefX = eye <= 1 ? dot(0) : eye <= 2 ? lerp(dot(0), dot(1), eye - 1) : lerp(dot(1), dot(2), eye - 2);
    out += fade(follow[0], circle(thiefX, chainY, r * 1.5, { fill: 'none', stroke: K.thief, width: 5 }) + label(thiefX, chainY + r * 1.5 + fs * 1.3, 'thief', u, { fill: K.thief, weight: 700, size: fs }), 0);

    // Two phones swap fresh public keys...
    out += fade(ramp(ctx.seconds, 0.1, 0.9), phone(leftX, topY, pw, ph, 'you', u, fs) + phone(rightX, topY, pw, ph, 'friend', u, fs), 0);
    const go = ramp(swap, 0.05, 0.55), a = leftX + pw * 0.8, b = rightX - pw * 0.8;
    out += arrow(a, topY - ph * 0.22, b, topY - ph * 0.22, { color: C.teal, draw: go }) + arrow(b, topY + ph * 0.22, a, topY + ph * 0.22, { color: C.pink, draw: go });
    out += key(lerp(a, b, go * 0.5) + pw * 0.2, topY - ph * 0.22 - u * 3.2, u * 5, C.teal, go > 0 ? 1 - mixed : 0) + key(lerp(b, a, go * 0.5) - pw * 0.2, topY + ph * 0.22 + u * 3.6, u * 5, C.pink, go > 0 ? 1 - mixed : 0);
    // ...and mix them into a new shared secret.
    out += fade(mixed, circle(rect.cx, topY, u * 5, { fill: C.panel, stroke: K.fresh, width: 6 }) + key(rect.cx, topY, u * 5.6, K.fresh)
      + label(rect.cx, topY - u * 7, 'new shared secret', u, { fill: K.fresh, weight: 700, size: fs }), 0);

    // The chain restarts from that secret; the thief cannot follow.
    out += arrow(rect.cx, topY + u * 6.2, dot(3), chainY - r * 1.5, { color: K.fresh, draw: restart[0], bend: v ? -40 : -60 });
    for (let i = 0; i < 3; i++) {
      out += fade(restart[i], circle(dot(3 + i), chainY, r, { fill: C.panel, stroke: K.fresh, width: 5 }) + key(dot(3 + i), chainY, r * 1.1, K.fresh), 0);
      if (i < 2) out += arrow(dot(3 + i) + r * 1.3, chainY, dot(4 + i) - r * 1.3, chainY, { color: K.fresh, draw: restart[i + 1] });
    }
    out += cross((dot(2) + dot(3)) / 2, chainY, u * 2.4, locked);
    out += fade(locked, text(rect.cx, rect.y + rect.h * (v ? 0.93 : 0.99), 'Locked out again', { size: u * (v ? 5.2 : 4.2), anchor: 'middle', weight: 700, fill: K.safe }));
    return out;
  });
}
