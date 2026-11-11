// Builds the authoring brief from the resolved settings. Every agent (interactive, headless CLI or
// plain chat model) gets the same brief, so one .env produces the same kind of video everywhere.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { wordBudget } from './project.mjs';
import { readInputs, INPUT_DIR } from './inputs.mjs';
import { availableEngines } from './engines.mjs';

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });
export const languageName = code => { try { return LANGUAGE_NAMES.of(code) || code; } catch { return code; } };

const KIT_REFERENCE = `The kit ports manim's palette, rate functions and core animations to SVG. Sizes are in pixels; use \`rect.u\` (1% of the frame's shorter side) so a scene works at any resolution. An amount \`k\` runs 0 to 1.

**Colors.** \`C\`: bg (black), text, muted, dim, line, panel, blue, teal, green, yellow, gold, orange, red, maroon, pink, purple. \`M\` has manim's full set with shades: \`M.BLUE_A\` (lightest) to \`M.BLUE_E\` (darkest), likewise TEAL, GREEN, YELLOW, GOLD, RED, MAROON, PURPLE, GREY.

**Frame and layout.** \`scene(ctx, {kicker, title}, rect => svg)\` draws the background, writes the heading and gives you the remaining \`rect\` \`{x, y, w, h, cx, cy, right, bottom, u, vertical}\`. \`area(ctx)\` is the whole safe rectangle. \`split(rect, 'rows'|'cols', [weights], gap)\`, \`inset(rect, margin)\`. \`camera(ctx, {zoom, x, y}, svg)\` zooms the view.

**Timing.** \`onBeat(ctx, i, {delay, length, rate})\` starts with sentence i. \`duringBeat(ctx, i)\` runs 0→1 across sentence i. \`since(ctx, i, delay)\` is seconds since sentence i began, for one-shot effects. \`ramp(t, from, to)\`. \`stagger(k, count, lag)\` → one amount per item.
Rate functions (manim's): \`smooth\` (default), \`linear\`, \`rushInto\`, \`rushFrom\`, \`slowInto\`, \`doubleSmooth\`, \`thereAndBack\`, \`thereAndBackWithPause\`, \`runningStart\`, \`overshoot\`, \`wiggle\`, \`lingering\`, \`exponentialDecay\`; plus \`lerp(a, b, k)\`, \`clamp\`.

**Text and math.**
- \`tex(x, y, String.raw\`\\\\frac{d}{dx} x^2 = 2x\`, {size, fill, anchor, valign: 'center', write})\`: real LaTeX math in Computer Modern. Color a part with \`\\\\color{#58C4DD}{...}\`. \`write: k\` traces each glyph's outline and then fills it (manim's Write); give it \`rate: linear\` and 1–2 seconds. \`texSize(latex, size)\` → \`{w, h, ascent, descent}\` for layout. Invalid LaTeX throws, and \`check\` reports it.
- \`text(x, y, str, {size, fill, anchor, weight, italic, font: 'serif'|'sans'|'mono', opacity, write, typed})\`: Computer Modern text; \`write\` works word by word. \`paragraph(x, y, str, width, opts)\` wraps. \`number(x, y, value, {decimals, prefix, suffix})\` for a changing value.

**Appearing and moving.** \`fadeIn(k, svg, {shift: [dx, dy], scale})\`, \`fade(k, svg)\`, \`fadeOut(k, svg)\`, \`grow(k, x, y, svg)\` (from a point, with overshoot), \`about(x, y, svg, {scale, rotate})\`.

**Shapes.** \`line\`, \`polyline(points, {color, width, draw, from, dash, closed, fill, fillOpacity})\`, \`arrow(x1, y1, x2, y2, {draw, bend, color})\`, \`arc(x, y, r, a0, a1, {draw})\`, \`box(x, y, w, h, {stroke, fill, radius, draw})\`, \`circle(x, y, r, {fill, stroke, draw})\`, \`dot(x, y, {r, color})\` (glowing point), \`card(x, y, w, h, title, {sub, color})\`. \`draw: k\` is manim's ShowCreation: the stroke is traced from its start.
- \`brace(x1, y1, x2, y2, {k})\` → \`{svg, tip}\`; put a label at \`tip\`. Left-to-right gives a brace above the span, right-to-left one below.
- Transform: \`polyline(morph(shapeA, shapeB, k), {closed: true})\` with point lists from \`shape.circle(cx, cy, r)\`, \`shape.square(cx, cy, side)\`, \`shape.rect(x, y, w, h)\`, \`shape.polygon(cx, cy, r, sides)\`.

**Drawing attention** (one-shot: pass \`since(ctx, i) / seconds\`). \`indicate(k, x, y, svg)\` swells and returns. \`flash(x, y, k)\` burst of lines. \`flashAround(x, y, w, h, k)\` highlight running round a box. \`passingFlash(points, k)\` along a path. Lasting: \`surround(x, y, w, h, {draw})\`, \`underline(x, y, w, {draw})\`.

**Coordinates.** \`axes(rect, {x: [min, max], y: [min, max], numbers, step})\` or \`numberPlane(rect, {...})\` (with the blue grid) → \`{svg(k), x(v), y(v), p(vx, vy), plot(fn, {draw, color, from, to}), fill(fn, a, b, {k, color}), riemann(fn, a, b, count, {k}), tangent(fn, at), vector(vx, vy, {draw}), point(vx, vy), label(vx, vy, str)}\`. \`numberLine(x, y, w, {range, step})\` → \`{svg(k), x(v)}\`.

**The user's images.** \`image(ctx.inputs['shot.png'], rect, {fit: 'contain'|'cover', crop: [x, y, w, h], radius, border, opacity})\` → \`{svg, x, y, w, h, scale, at(px, py)}\`; it also works directly in a string. \`crop\` is a region in image pixels: animate it with \`lerp\` to pan and zoom into a screenshot. \`at(px, py)\` turns image pixels into frame pixels, so arrows, \`surround\` and \`flashAround\` can point at a button or a line in the picture.

\`esc(str)\` for any text you put into SVG by hand.`;

const STYLES = {
  '3b1b': `The look is that of a 3Blue1Brown video, built with a port of its open-source animation library (manim). The mathematical-animation vocabulary is yours to use; the channel's characters (the pi creatures), logo and name are not.

- **Black background, Computer Modern type, manim's palette.** White for the object under discussion, \`C.muted\` grey for context, and one saturated color per concept that stays with it in every scene: if the derivative is yellow in the formula, the tangent line is yellow too. Color parts of a formula with \`\\\\color\` to tie symbols to the picture.
- **Things are written and drawn, not shown.** Formulas and titles appear with \`write\`; lines, graphs and arrows with \`draw\`; objects \`fadeIn\` with a small shift or \`grow\` from a point. Nothing pops into existence, and nothing appears before the sentence that introduces it.
- **Transform instead of replacing.** When an idea changes form, move the same object: slide a tangent along a curve, \`morph\` one shape into another, count a \`number\` up, sweep an area in, let a formula's term \`fadeIn\` beside the picture it describes. A continuous change the viewer can follow is the whole point.
- **Show the mechanism on a real object**: a graph on a \`numberPlane\`, a number line, a grid of squares, vectors, a tree, tokens flowing through boxes, a worked example with actual numbers. No bullet lists; on-screen words are short labels and the formula.
- **Direct the eye.** When the narration refers to something already on screen, \`indicate\` it, \`flash\` at the point, or run \`flashAround\` the term. Use \`brace\` with a label to name a quantity.
- **Timing.** About one new element per sentence, each tied to its sentence with \`onBeat\`. Typical lengths: write a formula 1.5–2 s, draw a curve 1–1.5 s, fade or move 0.7–1 s. Keep the default \`smooth\` easing; let things rest for a moment after they arrive.
- **Composition.** Generous margins, a few large elements rather than many small ones, and the same object in the same place when it returns in a later scene.`
};

function settingsList(config) {
  const { video, voiceover, subtitles } = config;
  const lines = [
    `- **Format:** ${video.format}, ${video.width}×${video.height}, ${video.fps} fps`,
    `- **Target length:** about ${video.duration} seconds`,
    `- **On-screen text language:** ${languageName(config.language)} (\`${config.language}\`)`,
    voiceover.enabled
      ? `- **Voice-over:** yes, in ${languageName(voiceover.lang)} (\`${voiceover.lang}\`). The renderer synthesizes it from your narration.`
      : '- **Voice-over:** none. The video is silent, so the pictures and on-screen text must carry the explanation.',
    subtitles.enabled
      ? `- **Subtitles:** yes, in ${languageName(subtitles.lang)} (\`${subtitles.lang}\`), ${subtitles.mode === 'file' ? 'as a separate .srt file' : 'burned into the bottom of the frame by the renderer'}. Do not draw captions yourself.`
      : '- **Subtitles:** none.'
  ];
  return lines.join('\n');
}

function scriptRules(config) {
  const { voiceover, subtitles, video } = config;
  const narrationLang = voiceover.enabled ? voiceover.lang : config.language;
  const translate = subtitles.enabled && subtitles.lang.split('-')[0] !== narrationLang.split('-')[0];
  const rules = [
    `- \`language\` is the language of \`narration\`: \`${narrationLang}\`.`,
    `- \`narration\` is ${voiceover.enabled ? 'what the voice says during the scene' : 'the script the scene follows; it sets the pacing even though nothing is spoken'}, in ${languageName(narrationLang)}. Write for the ear: short sentences, one idea each, numbers and symbols spelled the way they are spoken. Each sentence becomes a beat the animation can key on.`,
    `- Budget: about **${wordBudget(config)} words** of narration in total for ${video.duration} seconds, across ${video.duration <= 60 ? '3–5' : video.duration <= 150 ? '4–8' : '6–12'} scenes. Going over makes the video too long.`
  ];
  if (translate) rules.push(`- Because subtitles are in ${languageName(subtitles.lang)} and narration is in ${languageName(narrationLang)}, every scene also needs \`"subtitle"\`: a faithful ${languageName(subtitles.lang)} translation of its narration with the **same number of sentences in the same order**, so each subtitle appears with the sentence it translates.`);
  if (!voiceover.enabled) rules.push('- A scene may add `"duration": <seconds>` to hold longer than its text needs.');
  if (config.language.split('-')[0] !== narrationLang.split('-')[0]) rules.push(`- Labels and titles drawn in the scenes are in ${languageName(config.language)}, even though the narration is in ${languageName(narrationLang)}.`);
  return rules.join('\n');
}

function manifestExample(config) {
  const narrationLang = config.voiceover.enabled ? config.voiceover.lang : config.language;
  const translate = config.subtitles.enabled && config.subtitles.lang.split('-')[0] !== narrationLang.split('-')[0];
  const scene = n => ({ module: `scene-${n}.mjs`, narration: `<${languageName(narrationLang)} narration for scene ${n}>`, ...(translate ? { subtitle: `<${languageName(config.subtitles.lang)} translation, sentence for sentence>` } : {}) });
  return JSON.stringify({ title: '<short title>', language: narrationLang, scenes: [scene(1), scene(2)] }, null, 2);
}

function formatNotes(config) {
  const { video } = config;
  if (video.format === 'vertical') return `### Vertical video (Reels, TikTok, Shorts)

- The frame is tall and narrow. Stack things top to bottom; never place two wide panels side by side. \`rect.vertical\` is true, and \`split(rect, 'rows', ...)\` is your main tool.
- The first two seconds decide whether people keep watching: open on the most surprising picture or question, already moving. No title card, no "in this video".
- Make everything big. Body text at least \`rect.u * 4.2\`, key labels larger, strokes at least 6 px. A phone is held at arm's length.
- One idea, one payoff. About ${video.duration} seconds is 3–5 quick scenes; cut anything that is not needed for the single takeaway, and end on the takeaway rather than a summary.
- Platform buttons and captions cover the top and bottom of the frame; \`ctx.safe\` already excludes those areas, so stay inside \`rect\`.`;
  if (video.format === 'square') return `### Square video

- Compose around the centre; keep diagrams compact and text at least \`rect.u * 3.6\`.`;
  return `### Landscape video

- Use the width: diagram on one side with labels on the other, or a wide graph. Body text at least \`rect.u * 3\`.`;
}

/** The section on the user's images, or nothing when there are none. */
function inputsSection(projectDir, rel, mode) {
  const inputs = readInputs(projectDir);
  const names = Object.keys(inputs);
  if (!names.length) return '';
  const list = names.map(name => `- \`${rel}/${INPUT_DIR}/${name}\` (${inputs[name].width}×${inputs[name].height}): \`ctx.inputs['${name}']\``).join('\n');
  const look = mode === 'llm'
    ? 'They are attached to this message. Look at each one closely before you write anything.'
    : 'Open each one and look at it closely before you write anything: read its text, find the parts that matter and note their pixel positions.';
  return `## The user's images

The user gave these images for this video. They are the subject: explain what they show, and show them on screen.

${list}

${look}

- Show each image with \`image()\` from the kit at the moment the narration talks about it, and point at the parts being discussed (\`at()\` with \`surround\`, \`arrow\`, \`flashAround\`), or zoom into them with \`crop\`.
- Keep a screenshot large enough to read; a small one with labels around it reads worse than a big one with a highlight on it.
- Draw your own diagrams around the images where they help. Do not copy text out of an image as a wall of words.
- Do not edit, move or rename anything in \`${INPUT_DIR}/\`.
`;
}

/** Remotion and Blender scenes, described only when they are installed. */
function enginesSection(config) {
  const { remotion, blender } = availableEngines(config);
  if (!remotion && !blender) return '';
  const parts = [`### Other scene engines

Most scenes should be SVG modules drawn with the kit: they render fastest and match the look. This machine can also render a scene with ${[remotion && 'Remotion', blender && 'Blender'].filter(Boolean).join(' or ')}; use one only where it does something the kit cannot, and mix freely: each scene picks its own engine by its file extension. Every engine keys its motion on the same narration beats, and subtitles are burned over all of them.`];
  if (remotion) parts.push(`**Remotion** (\`scene-N.tsx\`): a React component for rich layout and typography, UI mock-ups, CSS effects and the user's images in HTML. Default-export a component; it gets no props. \`useHoca()\` from \`'#hoca'\` returns the scene's context for the current frame (\`width\`, \`height\`, \`seconds\`, \`beat\`, \`beats\`, \`progress\`, \`area\` (the safe rectangle), \`inputs\`) with \`onBeat(i, {delay, length})\`, \`duringBeat(i)\`, \`since(i)\` and \`image(name)\` (a URL for \`<Img>\`). \`C\` and \`FONT\` are the kit's palette and fonts. Import only from \`react\`, \`remotion\` and \`#hoca\`; no network, no randomness except \`random(seed)\` from \`remotion\`.

\`\`\`tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useHoca, C, FONT } from '#hoca';

export default function Scene() {
  const h = useHoca();
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: 'center', alignItems: 'center', fontFamily: FONT.serif }}>
      <div style={{ color: C.text, fontSize: h.height * 0.06, opacity: h.onBeat(0) }}>Step one</div>
      <div style={{ width: h.area.w * 0.6 * h.onBeat(1, { length: 1.5 }), height: h.height * 0.03, background: C.blue }} />
    </AbsoluteFill>
  );
}
\`\`\``);
  if (blender) parts.push(`**Blender** (\`scene-N.py\`): real 3D (solids, surfaces, molecules, orbits, a camera moving through space), rendered with ${config.engines.blenderRender === 'cycles' ? `Cycles on the CPU at ${config.engines.blenderSamples} samples` : config.engines.blenderRender}. It is by far the slowest engine, often seconds per frame, so keep Blender scenes short (under about 10 seconds of narration) and simple: a few objects, one light, no heavy volumes or glass. Define \`build(ctx, hoca)\`; it runs once in an empty scene with a black background. Create objects with \`bpy\` and animate them with keyframes; \`ctx\` has \`width\`, \`height\`, \`fps\`, \`duration\`, \`beats\` (each \`{start, end, text}\`) and \`inputs\` (each with a \`path\`). Optionally define \`update(ctx, hoca, seconds)\`, called before each frame. \`hoca\` helps: \`hoca.beat(i, delay)\` → seconds, \`hoca.key(obj, 'location', (x, y, z), seconds)\` sets and keyframes a property, \`hoca.paint(obj, hoca.C['blue'], emission=0, roughness=0.5)\`, \`hoca.text(body, location, size, color)\` (upright, facing the camera), \`hoca.camera(location, look_at, lens)\`, \`hoca.sun(strength)\`, \`hoca.image_plane(name, location, height)\` for one of the user's images. Without a camera, one is placed at (0, -8, 3) looking at the origin. Leave room for the subtitles at the bottom of the frame.

\`\`\`python
import math
import bpy

def build(ctx, hoca):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 1))
    planet = bpy.context.object
    hoca.paint(planet, hoca.C["blue"])
    hoca.key(planet, "rotation_euler", (0, 0, 0), hoca.beat(0))
    hoca.key(planet, "rotation_euler", (0, 0, math.radians(360)), ctx["duration"])
    hoca.text("Earth", location=(0, 0, 2.6), size=0.5, color=hoca.C["yellow"])
    hoca.sun()
    hoca.camera(location=(0, -9, 3), look_at=(0, 0, 1))
\`\`\``);
  return parts.join('\n\n');
}

export function buildBrief(config, topic, projectDir, { mode }) {
  // An MCP client may be working in any folder, so it gets the full path; the others run inside the repo.
  const rel = mode === 'mcp' ? projectDir : path.relative(ROOT, projectDir) || '.';
  const named = STYLES[config.video.style.toLowerCase()];
  const style = named || `${STYLES['3b1b']}\n- **Extra direction from the user:** ${config.video.style.replace(/^3b1b[\s,;:]*/i, '')}`;
  const tails = {
    // An agent working in the repo by hand: it can run the tools and should deliver the MP4.
    interactive: `4. Run \`node bin/hoca.mjs check ${rel}\`. Fix every ERROR and consider every WARN. It needs no speech synthesis, so it is fast; run it often.
5. Open \`${rel}/preview/contact-sheet.png\` (one row per scene, time left to right) and the individual \`preview/scene-NN-K.png\` frames. Look for overlapping or clipped text, things outside the frame, empty stretches, and pictures that do not match the sentence being spoken. Fix and re-check until it reads clearly.
6. Render with \`node bin/hoca.mjs render ${rel}\`. Read the reported duration; if it is far from the target, edit the narration and render again (unchanged sentences reuse cached audio).
7. Report the MP4 path, the duration, and anything you could not verify.`,
    // An agent reaching the pipeline through the MCP server: the same steps, as tool calls.
    mcp: `4. Call \`hoca_check\` with project \`${rel}\`. Fix every ERROR and consider every WARN. It needs no speech synthesis, so it is fast; call it often.
5. Look at the contact sheet it returns (one row per scene, time left to right) and the individual \`${rel}/preview/scene-NN-K.png\` frames. Look for overlapping or clipped text, things outside the frame, empty stretches, and pictures that do not match the sentence being spoken. Fix and re-check until it reads clearly.
6. Call \`hoca_render\` with project \`${rel}\`. Read the reported duration; if it is far from the target, edit the narration and render again (unchanged sentences reuse cached audio).
7. Report the MP4 path, the duration, and anything you could not verify.`,
    // A headless coding agent: it authors and checks; the orchestrator renders afterwards.
    cli: `4. Run \`node bin/hoca.mjs check ${rel}\`. Fix every ERROR and consider every WARN. Run it as often as you like.
5. Open \`${rel}/preview/contact-sheet.png\` (one row per scene, time left to right). Look for overlapping or clipped text, things outside the frame, empty stretches, and pictures that do not match the narration. Fix and re-check until it reads clearly.
6. Stop when the check passes and the frames look right. Do not render the final video and do not edit anything outside \`${rel}\`; the pipeline renders it after you finish.`,
    // A chat model with no tools: its reply is parsed into files.
    llm: `4. Reply with the files and nothing else, each in this exact form:

\`\`\`
=== FILE: video.json ===
{ ... }
=== FILE: scene-1.mjs ===
import { scene } from '#kit';
export function render(ctx) { ... }
=== END ===
\`\`\`

No commentary before, between or after the files, and no Markdown code fences inside them. You cannot run anything; the pipeline will check your files and send back any errors for you to fix.`
  };
  const values = {
    TOPIC: topic, SETTINGS: settingsList(config), PROJECT_DIR: rel, MANIFEST_EXAMPLE: manifestExample(config), SCRIPT_RULES: scriptRules(config),
    INPUTS: inputsSection(projectDir, rel, mode), ENGINES: enginesSection(config), WIDTH: config.video.width, HEIGHT: config.video.height, KIT_REFERENCE, STYLE: style, FORMAT_NOTES: formatNotes(config), WORKFLOW_TAIL: tails[mode]
  };
  return readFileSync(path.join(ROOT, 'prompts/brief.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
}
