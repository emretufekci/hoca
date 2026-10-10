import { scene, C, fade, text, circle, line, arc, arrow, onBeat, ramp, smooth, lerp } from '#kit';
import { K, cross } from './shared.mjs';

const TEETH = 12;

// Saw-tooth wheel: each tooth has one steep face and one sloped face, so a pawl only lets it turn one way.
function wheel(cx, cy, inner, outer, angle, color) {
  let d = '';
  for (let i = 0; i < TEETH; i++) {
    const a0 = angle + i * 2 * Math.PI / TEETH, a1 = a0 + 2 * Math.PI / TEETH;
    d += `${i ? 'L' : 'M'}${(cx + outer * Math.cos(a0)).toFixed(1)} ${(cy + outer * Math.sin(a0)).toFixed(1)}L${(cx + inner * Math.cos(a0)).toFixed(1)} ${(cy + inner * Math.sin(a0)).toFixed(1)}`
      + `L${(cx + outer * Math.cos(a1)).toFixed(1)} ${(cy + outer * Math.sin(a1)).toFixed(1)}`;
  }
  return `<path d="${d}Z" fill="${C.panel2}" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>` + circle(cx, cy, inner * 0.22, { fill: C.bg, stroke: color, width: 6 });
}

export function render(ctx) {
  return scene(ctx, { kicker: 'Forward only' }, rect => {
    const u = rect.u, v = rect.vertical;
    const cx = rect.cx, cy = rect.y + rect.h * (v ? 0.4 : 0.44);
    const outer = Math.min(rect.w * 0.3, rect.h * 0.3), inner = outer * 0.78;
    const step = 2 * Math.PI / TEETH;

    // One click per 0.8 s until the thief pushes back; then it strains against the pawl and holds.
    const pushStart = ctx.beats[1]?.start ?? ctx.duration * 0.5;
    const clicks = Math.min(ctx.seconds, pushStart) / 0.8;
    const turned = Math.floor(clicks) + smooth((clicks % 1) * 2.2);
    const push = onBeat(ctx, 1, { delay: 1.2, length: 0.5 });
    const strain = push * Math.sin(ctx.seconds * 9) * 0.012;
    const angle = turned * step + strain;

    // Pawl resting in the tooth at the top, lifting as each tooth slides under it.
    const lift = (1 - smooth((clicks % 1) * 2.2)) * (ctx.seconds < pushStart ? 1 : 0) * 0.0 + Math.sin(Math.min(1, (clicks % 1) * 2.2) * Math.PI) * (ctx.seconds < pushStart ? outer * 0.07 : 0);
    const tipX = cx + outer * 0.16, tipY = cy - inner - outer * 0.06 - lift;
    const pivotX = cx + outer * 1.05, pivotY = cy - outer * 1.08;

    let out = fade(ramp(ctx.seconds, 0, 0.6), wheel(cx, cy, inner, outer, angle, K.chain)
      + line(pivotX, pivotY, tipX, tipY, { color: C.text, width: 10 }) + circle(pivotX, pivotY, u * 1.4, { fill: C.text }), 0);

    // Allowed direction.
    const fwd = onBeat(ctx, 0, { delay: 0.2, length: 0.9 });
    out += arc(cx, cy, outer * 1.28, Math.PI * 0.95, Math.PI * 0.62, { color: K.safe, width: 7, draw: fwd });
    out += fade(ramp(fwd, 0.7, 1), arrow(cx + outer * 1.28 * Math.cos(Math.PI * 0.64), cy - outer * 1.28 * Math.sin(Math.PI * 0.64), cx + outer * 1.28 * Math.cos(Math.PI * 0.6), cy - outer * 1.28 * Math.sin(Math.PI * 0.6), { color: K.safe, width: 7 }), 0);
    out += fade(fwd, text(cx - outer * 1.32, cy - outer * 0.72, 'next key', { size: u * (v ? 3.8 : 3.2), anchor: 'end', fill: K.safe, weight: 600 }), 0);

    // The thief pushes the other way and is stopped.
    const back = onBeat(ctx, 1, { delay: 0.3, length: 0.9 });
    out += arc(cx, cy, outer * 1.28, -Math.PI * 0.05, -Math.PI * 0.38, { color: K.thief, width: 7, draw: back });
    out += fade(back, text(cx + outer * 1.34, cy + outer * 0.95, 'previous key', { size: u * (v ? 3.8 : 3.2), anchor: v ? 'middle' : 'start', fill: K.thief, weight: 600 }), 0);
    out += cross(cx + outer * 1.28 * Math.cos(-Math.PI * 0.4), cy + outer * 1.28 * Math.sin(Math.PI * 0.4), u * 2.6, push);

    const caption = rect.y + rect.h * (v ? 0.84 : 0.9);
    out += fade(onBeat(ctx, 1, { delay: 1.6 }), text(cx, caption, 'Easy forward. Impossible back.', { size: u * (v ? 5.2 : 4.2), anchor: 'middle', weight: 700 }));
    return out;
  });
}
