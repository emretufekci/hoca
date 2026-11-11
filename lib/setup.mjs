// First-run setup: a few screens (arrow keys, space to tick, enter for next, esc for back) that write
// .env and download only the voices the user ticks. `hoca setup --voices de,ru --yes` does the same
// without the screens, for scripts and coding agents.
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { ROOT, FORMATS, parseEnv } from './config.mjs';
import { has, run } from './proc.mjs';
import { createUi } from './progress.mjs';
import { VOICES, EXTRAS, installed, downloadSize, installVoices, findVoice } from './voices.mjs';
import { availableEngines, REMOTION_DIR } from './engines.mjs';

export const ENV_FILE = path.join(ROOT, '.env');
const BACK = Symbol('back');

// --- terminal ------------------------------------------------------------------------------------
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => text => (color ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = paint('1'), dim = paint('2'), cyan = paint('36'), green = paint('32'), yellow = paint('33'), red = paint('31');

/** One interactive screen: `draw()` returns its lines, `key()` returns a value to finish or undefined to stay. */
function screen(draw, key) {
  const { stdin, stdout } = process;
  return new Promise(resolve => {
    let drawn = 0;
    const paintAll = () => {
      const lines = draw();
      stdout.write(`${drawn ? `\x1b[${drawn}A` : ''}\x1b[0J${lines.join('\n')}\n`);
      drawn = lines.length;
    };
    const finish = value => { stdin.off('keypress', onKey); stdin.setRawMode(false); stdin.pause(); stdout.write('\x1b[?25h'); resolve(value); };
    const onKey = (text, info = {}) => {
      if (info.ctrl && info.name === 'c') { finish(undefined); stdout.write('\nSetup cancelled; nothing was saved. Run "npm run setup" to start again.\n'); process.exit(130); }
      const result = key(info.name, text, info);
      // A finished screen is wiped, so the next one takes its place instead of stacking below it.
      if (result !== undefined) { stdout.write(`\x1b[${drawn}A\x1b[0J`); finish(result); } else paintAll();
    };
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write('\x1b[?25l');
    stdin.on('keypress', onKey);
    paintAll();
  });
}

function header(step, total, title, help) {
  const dots = Array.from({ length: total }, (_, i) => (i < step ? green('●') : i === step ? cyan('●') : dim('○'))).join(' ');
  return ['', `${bold('Hoca setup')}  ${dots}  ${dim(`step ${step + 1} of ${total}`)}`, '', bold(title), ...(help ? [dim(help)] : []), ''];
}

/** Pick one. Options: [{label, hint, value}]. */
function select(step, total, title, help, options, initial = 0) {
  let at = Math.max(0, initial);
  return screen(
    () => [...header(step, total, title, help), ...options.map((option, i) => `${i === at ? cyan('❯') : ' '} ${i === at ? cyan(option.label) : option.label}${option.hint ? `  ${dim(option.hint)}` : ''}`), '', dim(`↑/↓ move · enter next${step ? ' · esc back' : ''}`)],
    name => {
      if (name === 'up' || name === 'k') at = (at - 1 + options.length) % options.length;
      else if (name === 'down' || name === 'j') at = (at + 1) % options.length;
      else if (name === 'return' || name === 'enter') return options[at].value;
      else if ((name === 'escape' || name === 'left') && step) return BACK;
    }
  );
}

/** Tick any number. Options: [{label, hint, value, checked, note}]. */
function checkbox(step, total, title, help, options, footer) {
  let at = 0;
  const ticked = new Set(options.filter(option => option.checked).map(option => option.value));
  return screen(
    () => [...header(step, total, title, help),
      ...options.map((option, i) => `${i === at ? cyan('❯') : ' '} ${ticked.has(option.value) ? green('◉') : '◯'} ${i === at ? cyan(option.label) : option.label}${option.hint ? `  ${dim(option.hint)}` : ''}${option.note ? `  ${green(option.note)}` : ''}`),
      '', footer([...ticked]), dim('↑/↓ move · space tick · a all/none · enter next · esc back')],
    name => {
      if (name === 'up' || name === 'k') at = (at - 1 + options.length) % options.length;
      else if (name === 'down' || name === 'j') at = (at + 1) % options.length;
      else if (name === 'space') ticked.has(options[at].value) ? ticked.delete(options[at].value) : ticked.add(options[at].value);
      else if (name === 'a') { if (ticked.size === options.length) ticked.clear(); else options.forEach(option => ticked.add(option.value)); }
      else if (name === 'return' || name === 'enter') return options.filter(option => ticked.has(option.value)).map(option => option.value);
      else if (name === 'escape' || name === 'left') return BACK;
    }
  );
}

/** Type a value. `secret` shows dots instead of the text. */
function input(step, total, title, help, { initial = '', secret = false, placeholder = '' } = {}) {
  let value = initial;
  return screen(
    () => [...header(step, total, title, help), `${cyan('❯')} ${value ? (secret ? '•'.repeat(value.length) : value) : dim(placeholder)}${cyan('▏')}`, '', dim('type · enter next · esc back')],
    (name, text, info) => {
      if (name === 'return' || name === 'enter') return value.trim();
      if (name === 'escape') return BACK;
      if (name === 'backspace') value = value.slice(0, -1);
      else if (text && !info.ctrl && !info.meta && text >= ' ' && text.length === 1) value += text;
      else if (text && text.length > 1 && !/[\x00-\x1f]/.test(text)) value += text;
    }
  );
}

// --- .env ----------------------------------------------------------------------------------------
/** Set keys in .env text: an existing line (even a commented-out one) is replaced, a new key is appended. */
export function setEnvKeys(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const line = `${key}=${/[\s#"']/.test(value) ? `"${String(value).replace(/"/g, '\\"')}"` : value}`;
    const live = new RegExp(`^${key}=.*$`, 'm'), commented = new RegExp(`^#\\s*${key}=.*$`, 'm');
    if (live.test(out)) out = out.replace(live, line);
    else if (value !== '' && commented.test(out)) out = out.replace(commented, line);
    else if (value !== '') out = `${out.replace(/\n*$/, '\n')}${line}\n`;
  }
  return out;
}

async function writeEnv(values) {
  if (!existsSync(ENV_FILE)) await copyFile(path.join(ROOT, '.env.example'), ENV_FILE);
  await writeFile(ENV_FILE, setEnvKeys(readFileSync(ENV_FILE, 'utf8'), values));
}

// --- the screens ---------------------------------------------------------------------------------
const voiceKey = voice => voice.id || voice.lang;
const allVoices = () => [...VOICES, ...EXTRAS];
const mb = value => (value >= 1000 ? `${(value / 1000).toFixed(1)} GB` : `${Math.round(value)} MB`);

async function systemCheck() {
  const tools = [
    ['ffmpeg', 'brew install ffmpeg  ·  sudo apt install ffmpeg'],
    ['rsvg-convert', 'brew install librsvg  ·  sudo apt install librsvg2-bin'],
    ['uv', 'curl -LsSf https://astral.sh/uv/install.sh | sh   (needed for the voices)']
  ];
  const rows = [];
  for (const [tool, hint] of tools) rows.push({ tool, ok: await has(tool), hint });
  return rows;
}

/** The interactive setup. Returns true when it finished. */
export async function runWizard({ firstRun = false } = {}) {
  const current = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  const claude = await has('claude'), codex = await has('codex'), ollama = await has('ollama');
  const answers = {
    agent: current.AGENT || (claude ? 'claude' : codex ? 'codex' : 'claude'),
    model: current.AGENT_MODEL || '', apiKey: '',
    language: (current.LANGUAGE || 'en').split('-')[0],
    format: current.VIDEO_FORMAT || 'vertical',
    voices: null, engines: []
  };
  const tools = await systemCheck();
  const steps = ['welcome', 'agent', 'agentDetail', 'language', 'voices', 'engines', 'format', 'confirm'];
  const total = steps.length;
  let i = 0;
  while (i < steps.length) {
    const step = steps[i];
    let result;
    if (step === 'welcome') {
      const missing = tools.filter(tool => !tool.ok);
      result = await select(i, total, firstRun ? 'Welcome to Hoca. Let\'s set it up; it takes a minute.' : 'Set up Hoca',
        'Everything you pick here goes into .env, and you can run this again any time with: npm run setup',
        [{ label: missing.length ? 'Continue anyway' : 'Start', value: 'go', hint: missing.length ? '' : 'ffmpeg, rsvg-convert and uv are installed' }, { label: 'Quit', value: 'quit' }]);
      if (result === 'quit') return false;
      if (missing.length && result === 'go') {
        process.stdout.write(`\n${yellow('Missing tools:')}\n${missing.map(tool => `  ${red('✗')} ${tool.tool}: ${tool.hint}`).join('\n')}\n${dim('Install them before rendering; the setup itself can go on.')}\n`);
      }
    } else if (step === 'agent') {
      const options = [
        { label: 'Claude Code', value: 'claude', hint: claude ? 'found · uses your Claude subscription, no API key' : 'not found · npm install -g @anthropic-ai/claude-code' },
        { label: 'Codex', value: 'codex', hint: codex ? 'found · uses your ChatGPT plan, no API key' : 'not found · npm install -g @openai/codex' },
        { label: 'Anthropic API', value: 'anthropic', hint: 'needs an API key' },
        { label: 'Ollama', value: 'ollama', hint: ollama ? 'found · runs a model on this machine' : 'not found · https://ollama.com' },
        { label: 'OpenAI-compatible API', value: 'openai', hint: 'OpenAI, OpenRouter, LM Studio...' }
      ];
      result = await select(i, total, 'Who writes your videos?', 'An AI agent researches the topic, writes the narration and codes the animation.', options, options.findIndex(option => option.value === answers.agent));
      if (result !== BACK) answers.agent = result;
    } else if (step === 'agentDetail') {
      if (answers.agent === 'claude' || answers.agent === 'codex') { i += 1; continue; }
      if (answers.agent === 'anthropic' || answers.agent === 'openai') {
        result = await input(i, total, `${answers.agent === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`, 'Stored in .env on this machine only. Leave empty to set it later.', { secret: true, placeholder: current[answers.agent === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'] ? '(keep the key already in .env)' : 'sk-...' });
        if (result !== BACK) answers.apiKey = result;
      }
      if (result !== BACK && answers.agent !== 'anthropic') {
        result = await input(i, total, 'Which model?', answers.agent === 'ollama' ? 'A model you have pulled, e.g. qwen2.5-coder:32b (see: ollama list)' : 'e.g. gpt-5.1', { initial: answers.model });
        if (result !== BACK) answers.model = result;
      }
    } else if (step === 'language') {
      const options = VOICES.map(voice => ({ label: voice.name, value: voice.lang, hint: voice.lang }));
      options.push({ label: 'Another language', value: 'other', hint: 'no local voice; macOS say, an API voice or silent' });
      result = await select(i, total, 'What language are your videos in?', 'On-screen text, narration and subtitles. Any single video can still use --lang.', options, Math.max(0, options.findIndex(option => option.value === answers.language)));
      if (result === 'other') {
        result = await input(i, total, 'Language code', 'Two or three letters, such as nl, ar or ko.', { initial: '' });
        if (result !== BACK && !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(result)) { process.stdout.write(red(`"${result}" is not a language code.\n`)); continue; }
      }
      if (result !== BACK) { answers.language = result; answers.voices = null; }
    } else if (step === 'voices') {
      // Nothing is pre-ticked except the voice for the language just chosen; voices already installed are marked.
      const chosen = answers.voices || allVoices().filter(voice => !voice.id && voice.lang === answers.language).map(voiceKey);
      const options = allVoices().map(voice => ({
        label: voice.name, value: voiceKey(voice), checked: chosen.includes(voiceKey(voice)),
        hint: `${voice.model} · ${voice.engine === 'kokoro' ? 'shared Kokoro model' : `${voice.mb} MB`} · ${voice.license}`, note: installed(voice) ? 'installed' : ''
      }));
      result = await checkbox(i, total, 'Which voices should be downloaded?', 'Only ticked voices are downloaded. All run on this machine\'s CPU. Add more later with: npm run setup',
        options, ticked => { const size = downloadSize(ticked.map(findVoice)); return `${ticked.length} selected · ${size ? `about ${bold(mb(size))} to download` : 'nothing to download'}`; });
      if (result !== BACK) answers.voices = result;
    } else if (step === 'engines') {
      const ready = availableEngines();
      const options = ENGINES.map(engine => ({ label: engine.name, value: engine.id, checked: answers.engines.includes(engine.id), hint: engine.hint, note: ready[engine.id] ? 'installed' : '' }));
      result = await checkbox(i, total, 'Extra scene engines? (optional)', 'The built-in SVG kit (manim style) needs nothing. These add other kinds of scenes, rendered on the CPU. Leave both empty if unsure.',
        options, ticked => `${ticked.length ? ticked.map(id => ENGINES.find(engine => engine.id === id).name).join(', ') : 'none'}${ticked.includes('remotion') ? yellow(' · Remotion: free for individuals, non-profits and companies of up to 3 people; larger companies need a Remotion license') : ''}`);
      if (result !== BACK) answers.engines = result;
    } else if (step === 'format') {
      const options = Object.keys(FORMATS).map(name => ({ label: name, value: name, hint: { vertical: '1080x1920 · Reels, TikTok, Shorts · about 45 s', landscape: '1920x1080 · YouTube · about 2 min', square: '1080x1080 · feeds · about 1 min' }[name] || '' }));
      result = await select(i, total, 'Default video shape?', 'Any single video can still use --format.', options, Math.max(0, options.findIndex(option => option.value === answers.format)));
      if (result !== BACK) answers.format = result;
    } else if (step === 'confirm') {
      const voices = answers.voices.map(findVoice);
      const size = downloadSize(voices);
      const hasVoice = voices.some(voice => voice.lang === answers.language) || allVoices().some(voice => voice.lang === answers.language && installed(voice));
      result = await select(i, total, 'Ready?', [
        `Writer     ${answers.agent}${answers.model ? ` (${answers.model})` : ''}`,
        `Language   ${answers.language}${hasVoice ? '' : yellow('  · no local voice picked for it: videos fall back to macOS say or stay silent')}`,
        `Format     ${answers.format}`,
        `Voices     ${voices.length ? voices.map(voice => voice.name).join(', ') : 'none'}${size ? `  · about ${mb(size)} to download` : ''}`,
        `Engines    SVG kit${answers.engines.map(id => `, ${ENGINES.find(engine => engine.id === id).name}`).join('')}`,
        `Settings   written to ${path.relative(process.cwd(), ENV_FILE) || '.env'}`
      ].join('\n'), [{ label: size || answers.engines.some(id => !availableEngines()[id]) ? 'Install' : 'Save', value: 'go' }, { label: 'Back', value: BACK }, { label: 'Quit without saving', value: 'quit' }]);
      if (result === 'quit') return false;
    }
    i = result === BACK ? Math.max(0, i - 1 - (steps[i - 1] === 'agentDetail' && ['claude', 'codex'].includes(answers.agent) ? 1 : 0)) : i + 1;
  }

  const values = { AGENT: answers.agent, LANGUAGE: answers.language, VIDEO_FORMAT: answers.format, AGENT_MODEL: answers.model || undefined };
  if (answers.apiKey) values[answers.agent === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'] = answers.apiKey;
  await writeEnv(values);
  console.log(`\n${green('✓')} Saved your settings to .env`);
  const voicesOk = await finishVoices(answers.voices.map(findVoice));
  return (await finishEngines(answers.engines)) && voicesOk;
}

// --- engines -------------------------------------------------------------------------------------
const ENGINES = [
  { id: 'remotion', name: 'Remotion', hint: 'React scenes: layouts, typography, UI mock-ups · about 300 MB with its headless Chrome · Remotion license' },
  { id: 'blender', name: 'Blender', hint: '3D scenes, rendered with Cycles on the CPU (slow) · about 1 GB app · GPL' }
];

async function finishEngines(ids) {
  let ok = true;
  const ready = availableEngines();
  for (const id of ids) {
    if (ready[id]) { console.log(`${green('✓')} ${id === 'remotion' ? 'Remotion' : 'Blender'} is already installed.`); continue; }
    const step = createUi().activity(id === 'remotion' ? 'Remotion' : 'Blender');
    try {
      if (id === 'remotion') {
        step.update('npm install (remotion, react) and its headless Chrome');
        await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: REMOTION_DIR });
        await run(process.execPath, ['-e', "import('@remotion/renderer').then(r => r.ensureBrowser())"], { cwd: REMOTION_DIR });
        step.done('ready; Remotion\'s license: https://www.remotion.dev/license');
      } else if (process.platform === 'darwin' && (await has('brew'))) {
        step.update('brew install --cask blender (about 1 GB)');
        await run('brew', ['install', '--cask', 'blender']);
        step.done('ready');
      } else {
        step.done('install it yourself, then run doctor');
        console.log(`  ${process.platform === 'linux' ? 'sudo snap install blender --classic   (or download it from https://www.blender.org/download/)' : 'Download it from https://www.blender.org/download/'}\n  If it is not on PATH, set BLENDER_PATH in .env.`);
        ok = false;
      }
    } catch (error) { step.done('FAILED'); console.log(`${red('✗')} ${error.message.split('\n').slice(-3).join(' ')}`); ok = false; }
  }
  return ok;
}

async function finishVoices(voices) {
  const todo = voices.filter(voice => !installed(voice));
  if (!todo.length) { if (voices.length) console.log(`${green('✓')} The voices you picked are already installed.`); return true; }
  console.log(`\nInstalling ${todo.map(voice => voice.name).join(', ')}\n`);
  const results = await installVoices(todo, createUi());
  const failed = results.filter(result => !result.ok);
  for (const result of failed) console.log(`${red('✗')} ${result.voice.name}: ${result.error}`);
  if (!failed.length) console.log(`\n${green('✓')} Voices ready: ${results.map(result => result.voice.name).join(', ')}`);
  return !failed.length;
}

/** `hoca setup` with flags (no screens): --voices de,ru · --engines remotion,blender · --list. */
export async function setupCommand(options) {
  if (options.list) {
    for (const voice of allVoices()) console.log(`${voiceKey(voice).padEnd(8)} ${voice.name.padEnd(22)} ${voice.model.padEnd(36)} ${String(voice.mb).padStart(4)} MB  ${voice.license.padEnd(13)} ${installed(voice) ? 'installed' : ''}`);
    console.log('\nScene engines (--engines):');
    const ready = availableEngines();
    for (const engine of ENGINES) console.log(`${engine.id.padEnd(8)} ${engine.hint}  ${ready[engine.id] ? 'installed' : ''}`);
    return true;
  }
  if (options.voices || options.engines) {
    const codes = (options.voices || '').split(',').map(code => code.trim()).filter(Boolean);
    const voices = codes.map(code => findVoice(code) || (() => { throw new Error(`No local voice for "${code}". Available: ${allVoices().map(voiceKey).join(', ')}`); })());
    const engines = (options.engines || '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
    for (const id of engines) if (!ENGINES.some(engine => engine.id === id)) throw new Error(`Unknown engine "${id}". Available: remotion, blender`);
    if (!existsSync(ENV_FILE)) await copyFile(path.join(ROOT, '.env.example'), ENV_FILE);
    const voicesOk = await finishVoices(voices);
    return (await finishEngines(engines)) && voicesOk;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Setup needs a terminal to show its screens. Without one, name the voices to install:\n\n  npm run setup -- --voices en,tr      (see all with: npm run setup -- --list)\n\nand copy .env.example to .env to change the other settings.`);
  }
  return runWizard();
}
