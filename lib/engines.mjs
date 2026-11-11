// Scene engines. Most scenes are SVG modules drawn with the kit; a scene can instead be a Remotion
// component (scene-N.tsx) or a Blender script (scene-N.py). Those render their frames to PNG files
// first, and the renderer then treats each file as a finished frame (and burns subtitles over it).
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { run } from './proc.mjs';
import { INPUT_DIR, stageInputs } from './inputs.mjs';

export const REMOTION_DIR = path.join(ROOT, 'engines/remotion');
const MAC_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';

/** 'svg', 'remotion' or 'blender', from "engine" in video.json or the module's extension. */
export function sceneEngine(scene) {
  if (scene.engine) return scene.engine;
  if (/\.(tsx|jsx)$/.test(scene.module)) return 'remotion';
  if (/\.py$/.test(scene.module)) return 'blender';
  return 'svg';
}

export const remotionInstalled = () => existsSync(path.join(REMOTION_DIR, 'node_modules/@remotion/renderer/package.json'));

/** The Blender executable: BLENDER_PATH, then `blender` on PATH, then the macOS app. */
export function blenderPath(config) {
  const onPath = name => (process.env.PATH || '').split(path.delimiter).map(folder => path.join(folder, name)).find(file => existsSync(file));
  const set = config?.engines?.blender;
  if (set) return existsSync(set) ? set : onPath(set) || null;
  return onPath('blender') || (existsSync(MAC_BLENDER) ? MAC_BLENDER : null);
}

/** Which optional engines are ready, for the brief, setup and doctor. */
export const availableEngines = config => ({ remotion: remotionInstalled(), blender: Boolean(blenderPath(config)) });

/** Everything an external scene knows about itself: the SVG ctx minus the per-frame fields. */
export function externalContext(scene, config, manifest, inputs, dir) {
  const { width, height, fps, format, safe } = config.video;
  const band = config.subtitles.enabled && config.subtitles.mode !== 'file' ? config.subtitles.band : 0;
  return {
    width, height, fps, format, language: config.language,
    duration: scene.duration, durationInFrames: Math.max(1, Math.ceil(scene.duration * fps) + 1),
    scene: scene.index, sceneCount: manifest.scenes.length,
    safe: { top: Math.round(safe.top * height), right: Math.round(safe.right * width), bottom: Math.round((safe.bottom + band) * height), left: Math.round(safe.left * width) },
    beats: scene.beats,
    // href for Remotion's staticFile(), path for Blender's image loader.
    inputs: Object.fromEntries(Object.entries(inputs || {}).map(([name, info]) => [name, { ...info, path: path.join(dir, INPUT_DIR, name) }]))
  };
}

/**
 * Render the given local frame numbers of one external scene into `outDir` as <frame>.png.
 * `scale` renders smaller (previews). `tick` is called once per finished frame.
 */
export async function renderExternal({ engine, dir, entry, scene, config, manifest, inputs, frames, outDir, scale = 1, tick = () => {}, signal }) {
  const unique = [...new Set(frames)].sort((a, b) => a - b);
  if (!unique.length) return;
  await mkdir(outDir, { recursive: true });
  const ctx = externalContext(scene, config, manifest, inputs, dir);
  const module = path.resolve(dir, entry.module);
  const jobFile = path.join(outDir, 'job.json');
  const recent = [];
  const onLine = line => { if (line.trim() === 'FRAME_DONE') tick(); else { recent.push(line); if (recent.length > 80) recent.shift(); } };
  const label = `Scene ${scene.index + 1} (${entry.module})`;
  try {
    if (engine === 'remotion') {
      if (!remotionInstalled()) throw new Error(`${label} is a Remotion scene, but Remotion is not installed. Run: npm run setup -- --engines remotion`);
      // Remotion copies its public folder into the bundle, so it gets the user's images and nothing else.
      const publicDir = path.join(outDir, '.public');
      await mkdir(publicDir, { recursive: true });
      await stageInputs(dir, publicDir, inputs);
      await writeFile(jobFile, JSON.stringify({ module, publicDir, ctx, frames: unique, outDir, scale }));
      await run(process.execPath, [path.join(REMOTION_DIR, 'render.mjs'), jobFile], { cwd: REMOTION_DIR, onLine, signal });
    } else if (engine === 'blender') {
      const blender = blenderPath(config);
      if (!blender) throw new Error(`${label} is a Blender scene, but Blender is not installed. Run: npm run setup -- --engines blender (or set BLENDER_PATH)`);
      const { blenderRender, blenderSamples } = config.engines;
      await writeFile(jobFile, JSON.stringify({ module, ctx, frames: unique, outDir, scale, engine: blenderRender, samples: blenderSamples }));
      await run(blender, ['-b', '--factory-startup', '-noaudio', '-P', path.join(ROOT, 'engines/blender/render.py'), '--', jobFile], { cwd: dir, onLine, signal });
    } else throw new Error(`${label}: unknown engine "${engine}"`);
  } catch (error) {
    // Keep the scene author's own error (a Python traceback, a webpack message), not the wrapper's.
    const text = `${recent.join('\n')}\n${error.message}`;
    const python = text.lastIndexOf('Traceback (most recent call last)');
    const detail = python >= 0 ? text.slice(python).split('\n').filter(line => line.trim() && !/^Blender quit|^HOCA_ERROR/.test(line)).slice(0, 14).join('\n')
      : text.split('\n').filter(line => /Error|error|ERR!|failed/.test(line)).slice(-8).join('\n') || error.message.slice(-800);
    throw new Error(`${label} failed to render:\n${detail}`);
  } finally { await rm(jobFile, { force: true }); await rm(path.join(outDir, '.public'), { recursive: true, force: true }); }
  const missing = unique.filter(frame => !existsSync(path.join(outDir, `${frame}.png`)));
  if (missing.length) throw new Error(`${label} did not write frame${missing.length > 1 ? 's' : ''} ${missing.slice(0, 5).join(', ')}`);
}

/** An SVG frame that shows a pre-rendered PNG, so subtitles burn in over it like any other frame. */
export function pictureFrame(href, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#000000"/><image href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`;
}
