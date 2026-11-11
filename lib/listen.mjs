// Listening back: every new narration clip is transcribed by a local speech recognizer and compared
// with the sentence it should say (lib/normalize.mjs). A clip that drops, slurs or garbles words is
// voiced again with another take, up to VOICE_CHECK_RETRIES times, and the best take is kept. Results
// are cached beside each clip, so only sentences whose text, voice or checker changed are listened to.
import { existsSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { run } from './proc.mjs';
import { pythonHas } from './voices.mjs';
import { compareSpeech, NORMALIZER_VERSION } from './normalize.mjs';

/** Is the recognizer installed? */
export const listenerInstalled = v => pythonHas(v.python, 'faster_whisper');

/** Will clips be checked? VOICE_CHECK=auto checks whenever the recognizer is installed. */
export function listening(v) {
  const mode = v.check?.mode || 'auto';
  if (mode === 'off') return false;
  if (listenerInstalled(v)) return true;
  if (mode === 'on') throw new Error('VOICE_CHECK=on needs the speech recognizer. Run: npm run setup -- --voices ' + v.lang.split('-')[0]);
  return false;
}

export const checkerId = v => `faster-whisper:${v.check?.model || 'small'}:n${NORMALIZER_VERSION}`;
const sidecar = file => file.replace(/\.wav$/, '.check.json');

/** The stored check of a clip, if it was made by the current checker. */
export async function storedCheck(file, v) {
  try {
    const data = JSON.parse(await readFile(sidecar(file), 'utf8'));
    return data.checker === checkerId(v) ? data : null;
  } catch { return null; }
}
export const storeCheck = (file, data) => writeFile(sidecar(file), JSON.stringify(data, null, 2) + '\n');
export const dropCheck = file => rm(sidecar(file), { force: true });

/** Transcribe audio files in one recognizer run; returns one text per file. */
export async function transcribe(files, v, tick = () => {}) {
  if (!files.length) return [];
  const jobs = files.map(audio => ({ audio, out: `${audio}.heard.txt` }));
  const list = `${files[0]}.listen.json`;
  await writeFile(list, JSON.stringify(jobs));
  try {
    await run(v.python, [path.join(ROOT, 'scripts/asr_local.py'), '--jobs', list, '--lang', v.lang, '--model', v.check?.model || 'small'], { cwd: ROOT, onLine: line => { if (line === 'CLIP_DONE') tick(); } });
    return await Promise.all(jobs.map(async job => (existsSync(job.out) ? (await readFile(job.out, 'utf8')).trim() : '')));
  } finally {
    await Promise.all([rm(list, { force: true }), ...jobs.map(job => rm(job.out, { force: true }))]);
  }
}

/** Judge a clip: what it should say against what was heard. */
export function judge(text, heard, v, take = 0) {
  const result = compareSpeech(text, heard, v.lang);
  return { checker: checkerId(v), take, ok: result.ok, score: result.score, missing: result.missing, garbled: result.garbled, text, heard };
}

/** Is take `a` better than take `b`? A passing take wins, then the smaller damage, then the lower error rate. */
export const better = (a, b) => !b || (a.ok !== b.ok ? a.ok : a.garbled !== b.garbled ? a.garbled < b.garbled : a.score < b.score);

/**
 * The text a provider reads for a retake. Engines that take a seed or a pace vary the sound on their own
 * (take 1); after that, and for engines that read the same text the same way every time, commas that
 * are not inside numbers become plain spaces, which changes the phrasing the engine plans.
 */
export function takeText(text, take, engineVaries) {
  if (take === 0 || (engineVaries && take < 2)) return text;
  return text.replace(/(?<!\d),(?!\d)/g, '').replace(/\s{2,}/g, ' ');
}
