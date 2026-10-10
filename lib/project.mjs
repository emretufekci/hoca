// A project is a folder with video.json plus one scene module per entry. This file reads it and
// turns narration into a timeline of scenes, beats (sentences), audio and subtitle cues.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sentences, cuesFor } from './subtitles.mjs';
import { synthesize, loadClip, SAMPLE_RATE } from './tts.mjs';

const LEAD_IN = 0.3, SENTENCE_GAP = 0.2, SCENE_TAIL = 0.6;
const CHARS_PER_SECOND = 15;
const WORDS_PER_SECOND = { tr: 2.1, de: 2.2, en: 2.7, es: 2.7, fr: 2.7 };

const base = lang => String(lang || '').split('-')[0].toLowerCase();

/** Narration words that fit the target duration, leaving room for pauses between sentences and scenes. */
export const wordBudget = config => Math.round(config.video.duration * (WORDS_PER_SECOND[base(config.voiceover.lang)] || 2.3) * 0.88);

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('video.json must be an object');
  if (typeof manifest.language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(manifest.language)) throw new Error('video.json needs "language": the language code of the narration, e.g. "en" or "tr"');
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length < 1 || manifest.scenes.length > 24) throw new Error('video.json needs 1–24 scenes');
  for (const [index, scene] of manifest.scenes.entries()) {
    const n = index + 1;
    if (!scene || typeof scene !== 'object') throw new Error(`Scene ${n} must be an object`);
    if (typeof scene.module !== 'string' || !/^[-\w/]+\.mjs$/.test(scene.module) || scene.module.startsWith('/') || scene.module.split('/').includes('..')) throw new Error(`Scene ${n} needs a project-local .mjs module`);
    const narration = typeof scene.narration === 'string' ? scene.narration.trim() : '';
    if (scene.narration !== undefined && !narration) throw new Error(`Scene ${n}: narration must be a nonempty string`);
    if (narration.length > 1200) throw new Error(`Scene ${n}: narration is ${narration.length} characters; split it (max 1200)`);
    if (scene.duration !== undefined && !(Number.isFinite(scene.duration) && scene.duration > 0 && scene.duration <= 600)) throw new Error(`Scene ${n}: duration must be seconds between 0 and 600`);
    if (!narration && scene.duration === undefined) throw new Error(`Scene ${n} needs narration, or a duration if it is silent`);
    if (scene.subtitle !== undefined && (typeof scene.subtitle !== 'string' || !scene.subtitle.trim())) throw new Error(`Scene ${n}: subtitle must be a nonempty string`);
  }
  return manifest;
}

/**
 * An existing project is spoken in the language its narration was written in, whatever LANGUAGE
 * says today. Subtitles follow along unless SUBTITLE_LANG asks for a specific language.
 */
export function configFor(manifest, config) {
  if (base(manifest.language) === base(config.voiceover.lang)) return config;
  return {
    ...config,
    voiceover: { ...config.voiceover, lang: manifest.language },
    subtitles: { ...config.subtitles, lang: config.subtitles.langSet ? config.subtitles.lang : manifest.language }
  };
}

export async function readProject(projectDir) {
  const dir = path.resolve(projectDir);
  let text;
  try { text = await readFile(path.join(dir, 'video.json'), 'utf8'); } catch { throw new Error(`No video.json in ${dir}`); }
  let manifest;
  try { manifest = JSON.parse(text); } catch (error) { throw new Error(`video.json is not valid JSON: ${error.message}`); }
  return { dir, manifest: validateManifest(manifest) };
}

/** Import every scene module. `fresh` bypasses the module cache for the scene files themselves. */
export async function loadScenes(dir, manifest, { fresh = false } = {}) {
  const renderers = [];
  for (const [index, scene] of manifest.scenes.entries()) {
    const file = path.resolve(dir, scene.module);
    if (!file.startsWith(dir + path.sep)) throw new Error(`Scene ${index + 1} module escapes the project`);
    let module;
    try { module = await import(pathToFileURL(file).href + (fresh ? `?t=${Date.now()}` : '')); } catch (error) { throw new Error(`Scene ${index + 1} (${scene.module}) failed to load: ${error.message}`); }
    if (typeof module.render !== 'function') throw new Error(`Scene ${index + 1} (${scene.module}) must export function render(ctx)`);
    renderers.push(module.render);
  }
  return renderers;
}

/** Text shown as subtitles for a scene, or null when a translation is required but missing. */
export function subtitleText(scene, manifest, config) {
  const wanted = config.subtitles.lang;
  const translated = scene.subtitles?.[wanted] ?? scene.subtitles?.[base(wanted)] ?? scene.subtitle;
  if (translated) return { text: translated, native: false };
  if (base(wanted) === base(manifest.language) && scene.narration) return { text: scene.narration, native: true };
  return null;
}

/**
 * Build the timeline. With `speech`, narration is synthesized sentence by sentence so every beat and
 * subtitle has a measured start and end; otherwise durations are estimated from reading speed.
 */
export async function buildTimeline({ dir, manifest }, config, { speech = true, ui } = {}) {
  const voiced = speech && config.voiceover.enabled;
  const perScene = manifest.scenes.map(scene => (scene.narration ? sentences(scene.narration, manifest.language) : []));
  const flat = perScene.flat();

  let clips = null, provider = null;
  if (voiced && flat.length) {
    const result = await synthesize(flat, config.voiceover, path.join(dir, 'audio'), ui);
    provider = result.provider;
    clips = [];
    for (const file of result.files) clips.push(await loadClip(file, config.voiceover.speed));
  }

  // Silent videos are stretched or squeezed toward VIDEO_DURATION; spoken ones follow the voice.
  let pace = 1;
  if (!voiced && !config.voiceover.enabled && flat.length) {
    const natural = manifest.scenes.reduce((sum, scene, i) => sum + Math.max(scene.duration || 0, LEAD_IN + SCENE_TAIL + perScene[i].reduce((s, text) => s + Math.max(0.9, text.length / CHARS_PER_SECOND) + SENTENCE_GAP, 0)), 0);
    pace = Math.min(1.4, Math.max(0.7, config.video.duration / natural));
  }

  const scenes = [], cues = [], placements = [];
  let cursor = 0, clipIndex = 0;
  for (const [index, scene] of manifest.scenes.entries()) {
    const beats = [];
    let t = LEAD_IN;
    for (const text of perScene[index]) {
      const clip = clips?.[clipIndex++];
      const length = clip ? clip.length / SAMPLE_RATE : Math.max(0.9, text.length / CHARS_PER_SECOND) * pace;
      if (clip) placements.push({ at: cursor + t, clip });
      beats.push({ start: t, end: t + length, text });
      t += length + SENTENCE_GAP;
    }
    const duration = Math.max(scene.duration || 0, beats.length ? beats.at(-1).end + SCENE_TAIL : 0);
    scenes.push({ index, start: cursor, duration, beats });

    if (config.subtitles.enabled) {
      const sub = subtitleText(scene, manifest, config);
      if (!sub && scene.narration) throw new Error(`Scene ${index + 1} has no "${config.subtitles.lang}" subtitle. Narration is "${manifest.language}", so add "subtitle": "<translation>" to the scene, or set SUBTITLE_LANG=${manifest.language}.`);
      if (sub) {
        const lines = sub.native ? beats.map(beat => beat.text) : sentences(sub.text, config.subtitles.lang);
        if (lines.length === beats.length) {
          // One subtitle sentence per spoken sentence: each is shown exactly while it is said.
          beats.forEach((beat, i) => cues.push(...cuesFor(lines[i], cursor + beat.start, cursor + (beats[i + 1]?.start ?? beat.end + 0.25), config.subtitles.chars)));
        } else {
          const from = cursor + (beats[0]?.start ?? LEAD_IN), to = cursor + (beats.at(-1)?.end ?? duration - SCENE_TAIL) + 0.25;
          cues.push(...cuesFor(lines.join(' '), from, Math.max(to, from + 1), config.subtitles.chars));
        }
      }
    }
    cursor += duration;
  }

  let audio = null;
  if (clips) {
    audio = new Int16Array(Math.ceil(cursor * SAMPLE_RATE));
    for (const { at, clip } of placements) audio.set(clip.subarray(0, Math.max(0, audio.length - Math.round(at * SAMPLE_RATE))), Math.round(at * SAMPLE_RATE));
  }
  return { scenes, cues, audio, duration: cursor, provider, estimated: !voiced && config.voiceover.enabled };
}

/** Arguments handed to a scene's render() for a moment `local` seconds into the scene. */
export function sceneContext(scene, local, config, manifest) {
  const { width, height, fps, format, safe } = config.video;
  const band = config.subtitles.enabled && config.subtitles.mode !== 'file' ? config.subtitles.band : 0;
  const seconds = Math.min(Math.max(0, local), scene.duration);
  let beat = -1;
  for (const [i, b] of scene.beats.entries()) if (seconds >= b.start) beat = i;
  return {
    progress: scene.duration > 0 ? Math.min(1, seconds / Math.max(1e-6, scene.duration - 1 / fps)) : 1,
    seconds, duration: scene.duration, width, height, fps, format,
    // Pixels to keep clear on each edge: platform UI plus, at the bottom, the subtitle band.
    safe: { top: Math.round(safe.top * height), right: Math.round(safe.right * width), bottom: Math.round((safe.bottom + band) * height), left: Math.round(safe.left * width) },
    beats: scene.beats, beat,
    language: config.language, scene: scene.index, sceneCount: manifest.scenes.length
  };
}
