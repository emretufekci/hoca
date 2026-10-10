# Brief: animated explainer video

Make a short animated explainer about: **{{TOPIC}}**

You are the researcher, writer, storyboarder and animation coder. The video should explain the way a good mathematical animation does: one idea at a time, each idea shown as a picture that moves, with the narration saying what the picture is doing. Clarity is the measure of success.

## Settings for this video (from .env)

{{SETTINGS}}

## Deliverable

Write these files in `{{PROJECT_DIR}}` and nowhere else:

- `video.json`: the script.
- `scene-1.mjs`, `scene-2.mjs`, ...: one animation module per scene.
- Optionally `shared.mjs` for helpers your scenes share, and `sources.md` for facts you verified.

### video.json

```json
{{MANIFEST_EXAMPLE}}
```

{{SCRIPT_RULES}}

### Scene modules

Each module exports one pure function that returns a complete SVG string for a single frame:

```js
import { scene, C, numberPlane, tex, split, onBeat, duringBeat, since, flash, lerp, linear } from '#kit';

const f = x => x * x;

export function render(ctx) {
  return scene(ctx, { title: 'How steep is a parabola?' }, rect => {
    const [graph, side] = split(rect, rect.vertical ? 'rows' : 'cols', [3, 2], rect.u * 4);
    const plane = numberPlane(graph, { x: [-3, 3], y: [-1, 5], numbers: true });
    const x = lerp(-1.5, 1.5, duringBeat(ctx, 1));           // slides while sentence 2 is spoken
    return plane.svg(onBeat(ctx, 0))                          // grid draws in with sentence 1
      + plane.plot(f, { draw: onBeat(ctx, 0, { delay: 0.6, length: 1.4 }) })
      + (ctx.beat >= 1 ? plane.tangent(f, x) + plane.point(x, f(x)) : '')
      + tex(side.cx, side.cy, String.raw`\frac{d}{dx}\,{\color{#FFFF00}x^2} = 2x`, { size: rect.u * 7, write: onBeat(ctx, 2, { length: 1.8, rate: linear }) })
      + flash(side.cx, side.cy, since(ctx, 2, 1.8) / 0.8);
  });
}
```

`ctx` is the same for every scene:

| Field | Meaning |
| --- | --- |
| `width`, `height` | Frame size in pixels: **{{WIDTH}}×{{HEIGHT}}** for this video. Lay out from these; never hard-code another size. |
| `safe` | `{top, right, bottom, left}` pixels to keep clear (platform buttons, burned-in subtitles). `scene()` and `area(ctx)` already respect it. |
| `seconds`, `duration` | Time into this scene and its total length, measured from the real narration audio. |
| `progress` | `seconds / duration`, 0 to 1. |
| `beats` | One `{start, end, text}` per narration sentence, in seconds. `beat` is the index of the sentence being spoken (−1 before the first). |
| `format`, `fps`, `language`, `scene`, `sceneCount` | Context, if you need it. |

Rules that keep renders working:

- Return a string that starts with `<svg` and is well-formed XML. Pass every piece of text through the kit's `text()`, or `esc()` it yourself: a raw `&` or `<` breaks the frame.
- `render` must be deterministic: no `Math.random()`, no `Date`, no network, no file writes. The same `ctx` must give the same frame.
- Only import from `#kit`, from your own files in the project folder, and from `node:` built-ins. No npm packages.
- No `<foreignObject>`, no CSS animation, no `<animate>`, no external images or fonts. Motion comes from computing positions from `ctx`.
- Tie each reveal to the sentence that talks about it with `onBeat(ctx, i)` (sentence `i`, zero-based) so picture and voice stay in sync whatever the speech rate. If you rewrite the narration, recount the sentences.

### The kit (`#kit`)

{{KIT_REFERENCE}}

## Look and motion

{{STYLE}}

{{FORMAT_NOTES}}

## Workflow

1. Get the facts right. Verify anything that could be out of date or that you are not sure of; record sources in `sources.md`. If you cannot verify a claim, leave it out.
2. Decide the one thing the viewer should understand at the end, then the 3–6 pictures that get them there. Open with a concrete question or example, not a definition.
3. Write `video.json`, then the scene modules.
{{WORKFLOW_TAIL}}
