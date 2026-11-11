// The local voices Hoca can install, one per language, and how to install them. Nothing is downloaded
// until the user picks a language (in `hoca setup`, or `hoca setup --voices de,ru`). Every voice here
// is small and runs on the CPU.
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, rename, rm, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { run, has } from './proc.mjs';

const KOKORO_URL = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';
const PIPER_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
export const KOKORO_DIR = path.join(ROOT, 'voices/kokoro');
export const PIPER_DIR = path.join(ROOT, 'voices');

/** Python packages per engine; the runtime is shared, so each is installed once whatever is picked. */
const PACKAGES = {
  ema: ['ema-lightning>=1.1.2', 'normalizer-tr>=0.8.1,<1'],
  antalia: ['antalia-mini>=1.0.1'],
  kokoro: ['kokoro-onnx>=0.6.1', 'soundfile'],
  piper: ['piper-tts>=1.3']
};
// What the Python side weighs the first time (MB), shown so the user knows what they are agreeing to.
const RUNTIME_MB = { ema: 600, antalia: 600, kokoro: 120, piper: 120 };

const kokoro = (lang, name, voice, sample) => ({ lang, name, engine: 'kokoro', voice, model: 'Kokoro-82M', license: 'Apache-2.0', mb: 354, sample });
const piper = (lang, name, id, mb, license, sample) => ({ lang, name, engine: 'piper', voice: id, model: `Piper ${id}`, license, mb, sample });

/** One entry per language. Languages that share Kokoro share its single download. */
export const VOICES = [
  kokoro('en', 'English', 'af_heart', 'Hello, this is a local voice test.'),
  { lang: 'tr', name: 'Turkish', engine: 'ema', model: 'EMA Lightning', license: 'Apache-2.0', mb: 20, sample: 'Merhaba, bu yerel bir ses denemesidir.' },
  kokoro('fr', 'French', 'ff_siwis', 'Bonjour, ceci est un essai de voix locale.'),
  kokoro('it', 'Italian', 'if_sara', 'Ciao, questa è una prova di voce locale.'),
  kokoro('pt', 'Portuguese (Brazil)', 'pf_dora', 'Olá, este é um teste de voz local.'),
  kokoro('es', 'Spanish', 'ef_dora', 'Hola, esta es una prueba de voz local.'),
  piper('de', 'German', 'de_DE-thorsten-medium', 63, 'CC0', 'Hallo, dies ist ein Test der lokalen Stimme.'),
  piper('ru', 'Russian', 'ru_RU-denis-medium', 63, 'CC0', 'Привет, это проверка локального голоса.'),
  piper('uk', 'Ukrainian', 'uk_UA-ukrainian_tts-medium', 77, 'CC0', 'Привіт, це перевірка локального голосу.'),
  piper('bn', 'Bengali (Bangladesh)', 'bn_BD-google-medium', 77, 'CC-BY-SA-4.0', 'হ্যালো, এটি একটি স্থানীয় কণ্ঠের পরীক্ষা।'),
  piper('ur', 'Urdu (Pakistan)', 'ur_PK-fasih-medium', 65, 'MIT', 'ہیلو، یہ ایک مقامی آواز کی آزمائش ہے۔')
];
/** Extra voices, offered after the languages. */
export const EXTRAS = [
  { lang: 'tr', id: 'antalia', name: 'Turkish, second voice', engine: 'antalia', model: 'Antalia-2 Mini', license: 'Apache-2.0', mb: 53, sample: 'Merhaba, bu yerel bir ses denemesidir.' }
];

const piperFile = id => path.join(PIPER_DIR, `${id}.onnx`);
const piperPath = id => { const [locale, speaker, quality] = id.split('-'); return `${locale.split('_')[0]}/${locale}/${speaker}/${quality}/${id}`; };
const kokoroReady = () => existsSync(path.join(KOKORO_DIR, 'kokoro-v1.0.onnx')) && existsSync(path.join(KOKORO_DIR, 'voices-v1.0.bin'));

/** Is a Python package present in the project's virtual environment? */
export function pythonHas(python, module) {
  const lib = path.join(path.dirname(path.dirname(python)), 'lib');
  if (!existsSync(python) || !existsSync(lib)) return false;
  return readdirSync(lib).some(version => existsSync(path.join(lib, version, 'site-packages', module)));
}

const MODULES = { ema: 'ema_lightning', antalia: 'antalia_mini', kokoro: 'kokoro_onnx', piper: 'piper' };
const PYTHON = path.join(ROOT, '.venv/bin/python');

/** Is this voice installed and ready to speak? */
export function installed(voice, python = PYTHON) {
  if (!pythonHas(python, MODULES[voice.engine])) return false;
  if (voice.engine === 'kokoro') return kokoroReady();
  if (voice.engine === 'piper') return existsSync(piperFile(voice.voice)) && existsSync(`${piperFile(voice.voice)}.json`);
  return true;
}

/** Megabytes a selection downloads: each model once, plus each Python runtime once. */
export function downloadSize(voices) {
  let mb = 0;
  const engines = new Set(), models = new Set();
  for (const voice of voices) {
    if (installed(voice)) continue;
    const key = voice.engine === 'piper' ? voice.voice : voice.engine;
    if (!models.has(key)) { models.add(key); mb += voice.mb; }
    if (!pythonHas(PYTHON, MODULES[voice.engine])) engines.add(voice.engine);
  }
  // EMA and Antalia share PyTorch; Kokoro and Piper share ONNX Runtime.
  const torch = engines.has('ema') || engines.has('antalia'), onnx = engines.has('kokoro') || engines.has('piper');
  return mb + (torch ? RUNTIME_MB.ema : 0) + (onnx ? RUNTIME_MB.kokoro : 0);
}

/** Download with a progress bar, to a temporary name first so an interrupted download is never mistaken for a finished one. */
async function download(url, file, ui, label) {
  if (existsSync(file)) return;
  await mkdir(path.dirname(file), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const bar = total ? ui.bar(label, Math.round(total / 1e6), 'MB') : null;
  const partial = `${file}.part`;
  const handle = await open(partial, 'w');
  let received = 0;
  try {
    for await (const chunk of response.body) { await handle.write(chunk); received += chunk.length; bar?.set(Math.round(received / 1e6)); }
  } finally { await handle.close(); }
  await rename(partial, file);
  bar?.done(`${path.basename(file)}, ${Math.round(received / 1e6)} MB`);
}

/** Install the chosen voices: the virtual environment, their packages, their models, then one test sentence each. */
export async function installVoices(voices, ui, { log = console.log } = {}) {
  if (!voices.length) return [];
  if (!(await has('uv'))) throw new Error('The voices need uv (a Python installer). Install it from https://docs.astral.sh/uv/getting-started/installation/ and run setup again.');
  const env = { ...process.env, UV_CACHE_DIR: path.join(ROOT, '.cache/uv') };
  if (!existsSync(PYTHON)) { log('Python     creating .venv (Python 3.12)'); await run('uv', ['venv', '--python', '3.12', path.join(ROOT, '.venv')], { cwd: ROOT, env }); }

  const packages = [...new Set(voices.flatMap(voice => PACKAGES[voice.engine]))];
  const step = ui.activity('Packages');
  step.update(packages.map(p => p.split(/[<>=]/)[0]).join(', '));
  await run('uv', ['pip', 'install', '--python', PYTHON, ...packages], { cwd: ROOT, env });
  step.done(packages.map(p => p.split(/[<>=]/)[0]).join(', '));

  if (voices.some(voice => voice.engine === 'kokoro')) for (const name of ['kokoro-v1.0.onnx', 'voices-v1.0.bin']) await download(`${KOKORO_URL}/${name}`, path.join(KOKORO_DIR, name), ui, 'Kokoro');
  for (const voice of voices.filter(v => v.engine === 'piper')) {
    await download(`${PIPER_URL}/${piperPath(voice.voice)}.onnx.json`, `${piperFile(voice.voice)}.json`, ui, voice.name.split(' ')[0]);
    await download(`${PIPER_URL}/${piperPath(voice.voice)}.onnx`, piperFile(voice.voice), ui, voice.name.split(' ')[0]);
  }

  // One sentence per voice: this fetches any weights the package downloads itself, and proves the voice works offline later.
  const results = [];
  const dir = path.join(tmpdir(), `hoca-voices-${process.pid}`);
  await mkdir(dir, { recursive: true });
  try {
    for (const voice of voices) {
      const test = ui.activity('Testing');
      test.update(`${voice.name} (${voice.model})`);
      const args = [path.join(ROOT, 'scripts/tts_local.py'), '--engine', voice.engine, '--lang', voice.lang, '--text', voice.sample, '--out', path.join(dir, `${voice.lang}-${voice.engine}.wav`)];
      if (voice.engine === 'piper') args.push('--model', piperFile(voice.voice));
      try { await run(PYTHON, args, { cwd: ROOT, env }); test.done(`${voice.name}: ${voice.model}`); results.push({ voice, ok: true }); }
      catch (error) { test.done(`${voice.name}: FAILED`); results.push({ voice, ok: false, error: error.message.split('\n').slice(-3).join(' ') }); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
  return results;
}

/** Look a voice up by language code or extra id: "de", "pt-BR", "antalia". */
export function findVoice(code) {
  const key = String(code).trim().toLowerCase();
  return EXTRAS.find(extra => extra.id === key) || VOICES.find(voice => voice.lang === key.split('-')[0]);
}
