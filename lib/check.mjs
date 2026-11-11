// Fast validation and visual previews that need no speech synthesis. Agents run this while authoring.
import { writeFile, mkdir, rm, rmdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { run } from './proc.mjs';
import { readProject, loadScenes, buildTimeline, wordBudget, configFor } from './project.mjs';
import { frameSvg, rasterize, fitFilter, externalFrames } from './render.mjs';
import { renderExternal } from './engines.mjs';
import { EXTERNAL_DIR } from './project.mjs';
import { stageInputs, INPUT_DIR } from './inputs.mjs';

const SAMPLES = [0.04, 0.25, 0.5, 0.75, 0.98];

/** Returns { errors, warnings, timeline }. Errors must be fixed before a render can succeed. */
export async function checkProject(projectDir, config, { previews = true, log = () => {} } = {}) {
  const errors = [], warnings = [];
  let project, renderers, timeline;
  try {
    project = await readProject(projectDir);
    config = configFor(project.manifest, config);
    renderers = await loadScenes(project.dir, project.manifest, { fresh: true });
    timeline = await buildTimeline(project, config, { speech: false });
  } catch (error) {
    return { errors: [error.message], warnings };
  }
  const { dir, manifest } = project;
  const { width, height } = config.video;

  const words = manifest.scenes.reduce((sum, scene) => sum + (scene.narration?.split(/\s+/).filter(Boolean).length || 0), 0);
  const budget = wordBudget(config);
  if (words > budget * 1.25) warnings.push(`Narration has ${words} words; about ${budget} fit the ${config.video.duration} s target. Trim it.`);
  if (words && words < budget * 0.6) warnings.push(`Narration has ${words} words; about ${budget} fit the ${config.video.duration} s target. It will run short.`);

  const previewDir = path.join(dir, 'preview');
  if (previews) {
    await mkdir(previewDir, { recursive: true });
    // Replace only our own earlier previews; anything else in the folder belongs to the author.
    for (const name of await readdir(previewDir)) if (/^(scene-\d\d-\d\.png|contact-sheet\.png)$/.test(name)) await rm(path.join(previewDir, name));
  }
  // Frames are written to a scratch folder beside the user's images, so image() works in previews too.
  const scratch = path.join(dir, '.work', 'check');
  if (previews) { await mkdir(scratch, { recursive: true }); await stageInputs(dir, scratch, timeline.inputs); }
  // Remotion and Blender scenes render just the sampled frames, at preview size.
  if (previews) {
    const times = timeline.scenes.flatMap(scene => SAMPLES.map(fraction => scene.start + scene.duration * fraction));
    for (const [index, frames] of externalFrames(renderers, timeline, config, manifest, times)) {
      try { await renderExternal({ engine: renderers[index].engine, dir, entry: manifest.scenes[index], scene: timeline.scenes[index], config, manifest, inputs: timeline.inputs, frames, outDir: path.join(scratch, EXTERNAL_DIR, `scene-${index + 1}`), scale: 0.5 }); }
      catch (error) { errors.push(error.message); }
    }
  }
  const inputNames = Object.keys(timeline.inputs || {});
  let usesInputs = false;
  const shots = [];
  for (const scene of timeline.scenes) {
    const frames = new Set();
    for (const [k, fraction] of SAMPLES.entries()) {
      const t = scene.start + scene.duration * fraction;
      let svg;
      try { svg = frameSvg(renderers, timeline, t, config, manifest); } catch (error) { errors.push(`Scene ${scene.index + 1} (${manifest.scenes[scene.index].module}) threw at progress ${fraction}: ${error.message}`); break; }
      frames.add(svg);
      if (svg.includes(`"${INPUT_DIR}/`)) usesInputs = true;
      const size = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
      if (k === 0 && size && Math.abs(size[1] / size[2] - width / height) > 0.02) warnings.push(`Scene ${scene.index + 1} draws a ${size[1]}x${size[2]} canvas but the video is ${width}x${height}; it will be letterboxed. Use ctx.width and ctx.height.`);
      if (!previews) continue;
      const name = `scene-${String(scene.index + 1).padStart(2, '0')}-${k + 1}`, source = path.join(scratch, `${name}.svg`), png = path.join(previewDir, `${name}.png`);
      await writeFile(source, svg);
      try { await rasterize(source, png, Math.round(width / 2), Math.round(height / 2)); shots.push(png); }
      catch (error) { errors.push(`Scene ${scene.index + 1} produces invalid SVG at progress ${fraction}: ${error.message.slice(0, 300)}`); break; }
      finally { await rm(source, { force: true }); }
    }
    if (frames.size === 1 && scene.duration > 2) warnings.push(`Scene ${scene.index + 1} never changes; animate it with ctx.progress or ctx.beats.`);
  }

  if (previews) { await rm(scratch, { recursive: true, force: true }); await rmdir(path.join(dir, '.work')).catch(() => {}); }
  if (inputNames.length && !usesInputs && !errors.length) warnings.push(`The user gave ${inputNames.length === 1 ? 'an image' : `${inputNames.length} images`} (${inputNames.map(n => `${INPUT_DIR}/${n}`).join(', ')}) but no sampled frame shows ${inputNames.length === 1 ? 'it' : 'any of them'}. Place ${inputNames.length === 1 ? 'it' : 'them'} with image(ctx.inputs['<name>'], rect).`);
  let sheet = null;
  if (previews && shots.length && !errors.length) {
    // Contact sheet: one row per scene, time running left to right.
    sheet = path.join(previewDir, 'contact-sheet.png');
    const cell = fitFilter(Math.round(width / 4), Math.round(height / 4));
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(previewDir, 'scene-??-?.png'), '-vf', `${cell},tile=${SAMPLES.length}x${timeline.scenes.length}:padding=6:margin=6:color=0x30363d`, '-frames:v', '1', sheet]);
    } catch (error) { sheet = null; log(`Contact sheet skipped: ${error.message.slice(0, 200)}`); }
  }
  return { errors, warnings, timeline, previewDir: previews ? previewDir : null, sheet, estimatedDuration: timeline.duration, words, budget };
}

export function formatCheck(result, root) {
  const lines = [];
  for (const error of result.errors) lines.push(`ERROR  ${error}`);
  for (const warning of result.warnings) lines.push(`WARN   ${warning}`);
  if (!result.errors.length) {
    lines.push(`OK     ${result.timeline.scenes.length} scenes, about ${result.estimatedDuration.toFixed(0)} s estimated, ${result.words} narration words (budget ${result.budget})`);
    if (result.sheet) lines.push(`LOOK   ${path.relative(root, result.sheet)} (rows = scenes, columns = time) and ${path.relative(root, result.previewDir)}/scene-NN-K.png`);
  }
  return lines.join('\n');
}
