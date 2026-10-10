// Text-to-speech providers. Every provider turns a list of { text, out } jobs into audio files;
// the caller normalises them to WAV and caches by content hash.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { run, has } from './proc.mjs';
import { ROOT } from './config.mjs';

export const SAMPLE_RATE = 48000;
const SAY_VOICES = { tr: 'Yelda', en: 'Samantha', de: 'Anna', fr: 'Thomas', es: 'Monica', it: 'Alice', pt: 'Luciana', nl: 'Xander', ru: 'Milena', ja: 'Kyoko', ko: 'Yuna', zh: 'Tingting', ar: 'Maged' };

const KOKORO_LANGS = ['en', 'es', 'fr', 'it', 'pt', 'hi', 'ja', 'zh'];
const freyaInstalled = () => existsSync(path.join(ROOT, '.cache/FreyaTTS/freyatts/pipeline.py'));
const kokoroInstalled = () => existsSync(path.join(ROOT, 'voices/kokoro/kokoro-v1.0.onnx')) && existsSync(path.join(ROOT, 'voices/kokoro/voices-v1.0.bin'));

/** Is a Python package present in the project's virtual environment? */
function pythonHas(v, module) {
  const lib = path.join(path.dirname(path.dirname(v.python)), 'lib');
  if (!existsSync(v.python) || !existsSync(lib)) return false;
  return readdirSync(lib).some(version => existsSync(path.join(lib, version, 'site-packages', module)));
}

/** Local engines that run through scripts/tts_local.py: what they speak and whether they are installed. */
const PYTHON_ENGINES = {
  ema: { langs: ['tr'], ready: v => pythonHas(v, 'ema_lightning') },
  antalia: { langs: ['tr'], ready: v => pythonHas(v, 'antalia_mini') },
  freya: { langs: ['tr'], ready: v => freyaInstalled() && existsSync(v.python) },
  kokoro: { langs: KOKORO_LANGS, ready: v => kokoroInstalled() && pythonHas(v, 'kokoro_onnx') }
};
// Preference order for TTS_PROVIDER=auto.
const AUTO_ORDER = ['ema', 'antalia', 'kokoro', 'freya'];

async function pythonEngine(engine, jobs, v, tick) {
  const base = v.lang.split('-')[0];
  if (!PYTHON_ENGINES[engine].langs.includes(base)) throw new Error(`TTS_PROVIDER=${engine} speaks ${PYTHON_ENGINES[engine].langs.join(', ')}; choose another provider for VOICEOVER_LANG=${v.lang}`);
  if (!PYTHON_ENGINES[engine].ready(v)) throw new Error(`The ${engine} voice is not installed. Run: npm run setup${engine === 'freya' ? ' -- freya' : ''}`);
  const list = `${jobs[0].out}.jobs.json`;
  await writeFile(list, JSON.stringify(jobs));
  try {
    await run(v.python, [path.join(ROOT, 'scripts/tts_local.py'), '--engine', engine, '--jobs', list, '--lang', v.lang, '--device', v.device, ...(v.voice ? ['--voice', v.voice] : []), ...(v.model ? ['--model', v.model] : [])], { onLine: line => { if (line === 'CLIP_DONE') tick(); } });
  } finally { await rm(list, { force: true }); }
}

function piperVoice(v) {
  if (v.voice) {
    const direct = [v.voice, path.join(v.voicesDir, v.voice), path.join(v.voicesDir, `${v.voice}.onnx`)].find(file => file.endsWith('.onnx') && existsSync(file));
    if (direct) return direct;
  }
  if (!existsSync(v.voicesDir)) return null;
  const base = v.lang.split('-')[0];
  const match = readdirSync(v.voicesDir).filter(file => file.endsWith('.onnx') && file.toLowerCase().startsWith(`${base}_`)).sort()[0];
  return match ? path.join(v.voicesDir, match) : null;
}

async function piperBinary(v) {
  const local = path.join(path.dirname(v.python), 'piper');
  if (existsSync(local)) return local;
  return (await has('piper')) ? 'piper' : null;
}

/** Pick the concrete provider for TTS_PROVIDER=auto: the best installed local voice for the language. */
export async function resolveProvider(v) {
  if (v.provider !== 'auto') return v.provider;
  const base = v.lang.split('-')[0];
  if (v.command) return 'command';
  const local = AUTO_ORDER.find(engine => PYTHON_ENGINES[engine].langs.includes(base) && PYTHON_ENGINES[engine].ready(v));
  if (local) return local;
  if (piperVoice(v) && await piperBinary(v)) return 'piper';
  if (process.platform === 'darwin') return 'say';
  throw new Error(`No local voice for "${v.lang}". Run "npm run setup" for the local voices, add a Piper voice to voices/, set TTS_PROVIDER (say, openai, elevenlabs, command) or set VOICEOVER=false.`);
}

const providers = {
  ema: (jobs, v, tick) => pythonEngine('ema', jobs, v, tick),
  antalia: (jobs, v, tick) => pythonEngine('antalia', jobs, v, tick),
  kokoro: (jobs, v, tick) => pythonEngine('kokoro', jobs, v, tick),
  freya: (jobs, v, tick) => pythonEngine('freya', jobs, v, tick),
  async piper(jobs, v, tick) {
    const model = piperVoice(v), binary = await piperBinary(v);
    if (!binary) throw new Error('Piper is not installed. Run: uv pip install --python .venv/bin/python piper-tts');
    if (!model) throw new Error(`No Piper voice for "${v.lang}" in ${v.voicesDir}. Download a <lang>_*.onnx voice (with its .onnx.json) or set TTS_VOICE.`);
    for (const job of jobs) { await run(binary, ['-m', model, '-f', job.out], { input: job.text }); tick(); }
  },
  async say(jobs, v, tick) {
    if (process.platform !== 'darwin') throw new Error('TTS_PROVIDER=say needs macOS');
    const voice = v.voice || SAY_VOICES[v.lang.split('-')[0]];
    if (!voice) throw new Error(`Set TTS_VOICE to a macOS voice for "${v.lang}" (list them with: say -v '?')`);
    for (const job of jobs) { await run('say', ['-v', voice, '-o', job.out, '--file-format=WAVE', '--data-format=LEI16@48000'], { input: job.text }); tick(); }
  },
  async openai(jobs, v, tick) {
    const key = v.apiKey || v.keys.openai, base = v.baseUrl || 'https://api.openai.com/v1';
    if (!key && !v.baseUrl) throw new Error('TTS_PROVIDER=openai needs TTS_API_KEY or OPENAI_API_KEY (or TTS_BASE_URL for a local OpenAI-compatible speech server)');
    for (const job of jobs) {
      const response = await fetch(`${base}/audio/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: v.model || 'gpt-4o-mini-tts', voice: v.voice || 'alloy', input: job.text, response_format: 'wav' })
      });
      if (!response.ok) throw new Error(`Speech API ${response.status}: ${(await response.text()).slice(0, 400)}`);
      await writeFile(job.out, Buffer.from(await response.arrayBuffer()));
      tick();
    }
  },
  async elevenlabs(jobs, v, tick) {
    const key = v.apiKey || v.keys.elevenlabs;
    if (!key) throw new Error('TTS_PROVIDER=elevenlabs needs TTS_API_KEY or ELEVENLABS_API_KEY');
    if (!v.voice) throw new Error('TTS_PROVIDER=elevenlabs needs TTS_VOICE set to a voice id');
    for (const job of jobs) {
      const response = await fetch(`${v.baseUrl || 'https://api.elevenlabs.io/v1'}/text-to-speech/${encodeURIComponent(v.voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'xi-api-key': key },
        body: JSON.stringify({ text: job.text, model_id: v.model || 'eleven_multilingual_v2' })
      });
      if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 400)}`);
      await writeFile(job.out, Buffer.from(await response.arrayBuffer()));
      tick();
    }
  },
  // Escape hatch for any other engine: TTS_COMMAND='my-tts --lang {lang} --in {text_file} --out {out}'
  async command(jobs, v, tick) {
    if (!v.command) throw new Error('TTS_PROVIDER=command needs TTS_COMMAND with {text_file} and {out} placeholders');
    for (const job of jobs) {
      const textFile = `${job.out}.txt`;
      await writeFile(textFile, job.text);
      const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;
      const command = v.command.replace(/\{text_file\}/g, quote(textFile)).replace(/\{out\}/g, quote(job.out)).replace(/\{lang\}/g, quote(v.lang)).replace(/\{voice\}/g, quote(v.voice));
      try { await run('/bin/sh', ['-c', command], { cwd: ROOT }); tick(); } finally { await rm(textFile, { force: true }); }
    }
  }
};

/**
 * Synthesize `texts` into `cacheDir`, reusing clips whose text and voice settings are unchanged.
 * Returns one WAV path per text, in order.
 */
export async function synthesize(texts, v, cacheDir, ui = { log() {}, bar: () => ({ tick() {}, done() {} }) }) {
  const provider = await resolveProvider(v);
  await mkdir(cacheDir, { recursive: true });
  const files = texts.map(text => path.join(cacheDir, `${createHash('sha1').update([provider, v.voice, v.model, v.lang, text].join('\u0000')).digest('hex').slice(0, 16)}.wav`));
  const missing = [...new Map(texts.map((text, i) => [files[i], text])).entries()].filter(([file]) => !existsSync(file));
  if (missing.length) {
    const bar = ui.bar('Voice', missing.length, 'sentences');
    const jobs = missing.map(([file, text]) => ({ text, out: file.replace(/\.wav$/, '.src.wav') }));
    try {
      await providers[provider](jobs, v, () => bar.tick());
      for (const [index, [file]] of missing.entries()) {
        if (!existsSync(jobs[index].out)) throw new Error(`${provider} produced no audio for: ${jobs[index].text.slice(0, 60)}`);
        const tmp = `${file}.tmp.wav`;
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', jobs[index].out, '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', tmp]);
        await rename(tmp, file);
      }
    } finally {
      await Promise.all(jobs.map(job => rm(job.out, { force: true })));
    }
    bar.done(`${provider}, ${missing.length} new, ${texts.length - missing.length} reused`);
  } else ui.log(`${'Voice'.padEnd(10)} reused all ${texts.length} cached sentences (${provider})`);
  return { provider, files };
}

/** Decode a clip to 48 kHz mono PCM, apply TTS_SPEED and trim the silence engines add at both ends. */
export async function loadClip(file, speed = 1) {
  const filter = speed === 1 ? [] : ['-af', `atempo=${speed}`];
  const raw = await run('ffmpeg', ['-loglevel', 'error', '-i', file, ...filter, '-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', '-'], { binary: true });
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const pad = Math.round(SAMPLE_RATE * 0.04);
  let start = 0, end = samples.length;
  while (start < end && Math.abs(samples[start]) < 260) start++;
  while (end > start && Math.abs(samples[end - 1]) < 260) end--;
  if (end - start < SAMPLE_RATE * 0.05) return samples;
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

export function wavFile(samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
