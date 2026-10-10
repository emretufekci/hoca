// Render a project to MP4: scene modules -> SVG frames -> PNG (librsvg) -> H.264/AAC (FFmpeg).
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { writeFile, mkdir, mkdtemp, rm, rmdir, link, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { run, pool } from './proc.mjs';
import { outputFiles, describeConfig, slugify } from './config.mjs';
import { readProject, loadScenes, buildTimeline, sceneContext, configFor } from './project.mjs';
import { burnIn, toSrt } from './subtitles.mjs';
import { wavFile } from './tts.mjs';
import { fontEnv } from './fonts.mjs';
import { createUi } from './progress.mjs';

export const BACKGROUND = '#000000';

/** One finished SVG frame for global time `t`, including burned-in subtitles when enabled. */
export function frameSvg(renderers, timeline, t, config, manifest) {
  const scene = timeline.scenes.findLast(s => t >= s.start) || timeline.scenes[0];
  const svg = renderers[scene.index](sceneContext(scene, t - scene.start, config, manifest));
  if (typeof svg !== 'string' || !svg.trimStart().startsWith('<svg')) throw new Error(`Scene ${scene.index + 1} at ${(t - scene.start).toFixed(2)} s: render() must return an <svg> string`);
  if (!config.subtitles.enabled || config.subtitles.mode === 'file') return svg;
  const cue = timeline.cues.find(c => t >= c.start && t < c.end);
  return burnIn(svg, cue, { width: config.video.width, height: config.video.height, safe: config.video.safe, size: config.subtitles.size, band: config.subtitles.band });
}

export const rasterize = (svgFile, pngFile, width, height) => run('rsvg-convert', ['-w', String(width), '-h', String(height), '--keep-aspect-ratio', '-o', pngFile, svgFile], { env: fontEnv() });

/** Scale to fit and pad, so scenes drawn for another aspect ratio are letterboxed instead of stretched. */
export const fitFilter = (width, height) => `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${BACKGROUND.replace('#', '0x')},setsar=1`;

/** outputs/<topic>/<agent>/ is named after its topic; any other folder is named after itself. */
export function topicOf(dir, config) {
  const inside = path.relative(config.outputDir, dir).split(path.sep);
  return slugify(inside.length === 2 && inside[0] !== '..' ? inside[0] : path.basename(dir), { keepAll: true });
}

export async function renderProject(projectDir, config, { log = console.log, output, ui = createUi(log) } = {}) {
  const project = await readProject(projectDir);
  const { dir, manifest } = project;
  config = configFor(manifest, config);
  const files = outputFiles(config, dir, topicOf(dir, config));
  if (output) files.video = path.resolve(output);
  const { width, height, fps } = config.video;

  const renderers = await loadScenes(dir, manifest);
  const timeline = await buildTimeline(project, config, { ui });
  const frameCount = Math.max(1, Math.round(timeline.duration * fps));

  // Work inside the project so sandboxed agents, which may only write to the workspace, can render too.
  await mkdir(path.join(dir, '.work'), { recursive: true });
  const work = await mkdtemp(path.join(dir, '.work', 'render-'));
  try {
    const jobs = pool(Math.max(2, availableParallelism() - 1));
    const seen = new Map();
    const frames = ui.bar('Frames', frameCount, 'frames');
    for (let frame = 0; frame < frameCount; frame++) {
      const svg = frameSvg(renderers, timeline, frame / fps, config, manifest);
      const png = path.join(work, `${String(frame).padStart(6, '0')}.png`);
      const key = createHash('sha1').update(svg).digest('base64');
      const first = seen.get(key);
      if (first) {
        // Held frames are identical; reuse the first rasterization instead of redoing it.
        await jobs.add(async () => { await first.done; await link(first.png, png).catch(() => copyFile(first.png, png)); frames.tick(); });
      } else {
        const entry = { png };
        const source = png.replace(/\.png$/, '.svg');
        let resolve, reject;
        entry.done = new Promise((res, rej) => { resolve = res; reject = rej; });
        entry.done.catch(() => {});
        seen.set(key, entry);
        await jobs.add(async () => {
          try { await writeFile(source, svg); await rasterize(source, png, width, height); await rm(source); resolve(); frames.tick(); }
          catch (error) { const wrapped = new Error(`Frame ${frame} (${(frame / fps).toFixed(2)} s) is not valid SVG: ${error.message}`); reject(wrapped); throw wrapped; }
        });
      }
    }
    await jobs.done();
    frames.done(`${manifest.scenes.length} scenes, ${timeline.duration.toFixed(1)} s at ${width}x${height}`);

    const audioArgs = timeline.audio
      ? ['-i', path.join(work, 'voice.wav')]
      : ['-f', 'lavfi', '-t', timeline.duration.toFixed(3), '-i', 'anullsrc=channel_layout=mono:sample_rate=48000'];
    if (timeline.audio) await writeFile(path.join(work, 'voice.wav'), wavFile(timeline.audio));
    await mkdir(path.dirname(files.video), { recursive: true });
    const encode = ui.bar('Encoding', frameCount, 'frames');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-framerate', String(fps), '-i', path.join(work, '%06d.png'), ...audioArgs,
      '-vf', fitFilter(width, height), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(config.video.crf), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', files.video], { onLine: line => { const frame = line.match(/^frame=\s*(\d+)/); if (frame) encode.set(Number(frame[1])); } });
    encode.done();
  } finally {
    await rm(work, { recursive: true, force: true });
    await rmdir(path.join(dir, '.work')).catch(() => {});
  }

  const sidecar = config.subtitles.enabled && config.subtitles.mode !== 'burn' && timeline.cues.length;
  if (sidecar) await writeFile(files.srt, toSrt(timeline.cues));

  const target = config.video.duration, off = (timeline.duration - target) / target;
  const warnings = [];
  if (Math.abs(off) > 0.2) warnings.push(`Video is ${timeline.duration.toFixed(0)} s but VIDEO_DURATION is ${target} s. ${off > 0 ? 'Trim' : 'Extend'} the narration by about ${Math.abs(Math.round(off / (1 + off) * 100))}%${config.voiceover.enabled ? ' or adjust TTS_SPEED' : ''}.`);
  await writeFile(files.report, JSON.stringify({
    video: path.basename(files.video), subtitles: sidecar ? path.basename(files.srt) : null,
    duration: Number(timeline.duration.toFixed(2)), frames: frameCount, ttsProvider: timeline.provider, settings: describeConfig(config), warnings,
    scenes: timeline.scenes.map(scene => ({ module: manifest.scenes[scene.index].module, start: Number(scene.start.toFixed(2)), duration: Number(scene.duration.toFixed(2)), beats: scene.beats.map(beat => ({ start: Number(beat.start.toFixed(2)), end: Number(beat.end.toFixed(2)), text: beat.text })) }))
  }, null, 2) + '\n');
  for (const warning of warnings) log(`Warning: ${warning}`);
  log(`\nVideo      ${path.relative(process.cwd(), files.video)}  (${timeline.duration.toFixed(0)} s)${sidecar ? `\nSubtitles  ${path.relative(process.cwd(), files.srt)}` : ''}`);
  return { ...files, srt: sidecar ? files.srt : null, duration: timeline.duration, warnings };
}
