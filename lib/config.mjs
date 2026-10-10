// Single source of truth for settings: CLI overrides > process environment > .env file > defaults.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATS = {
  // safe: fractions of the frame that platform UI may cover. sub: burned-in subtitle geometry.
  landscape: { width: 1920, height: 1080, duration: 120, safe: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 }, sub: { chars: 46, size: 0.042, band: 0.15 } },
  vertical: { width: 1080, height: 1920, duration: 45, safe: { top: 0.11, right: 0.07, bottom: 0.19, left: 0.07 }, sub: { chars: 26, size: 0.028, band: 0.095 } },
  square: { width: 1080, height: 1080, duration: 60, safe: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 }, sub: { chars: 34, size: 0.042, band: 0.15 } }
};
const FORMAT_ALIASES = { portrait: 'vertical', reel: 'vertical', reels: 'vertical', tiktok: 'vertical', shorts: 'vertical', instagram: 'vertical', '9:16': 'vertical', horizontal: 'landscape', youtube: 'landscape', '16:9': 'landscape', '1:1': 'square' };

// kind "cli": a coding agent that writes files itself. kind "llm": a chat model whose reply we turn into files.
export const AGENTS = {
  claude: { kind: 'cli' },
  codex: { kind: 'cli' },
  ollama: { kind: 'llm', api: 'openai' },
  openai: { kind: 'llm', api: 'openai' },
  anthropic: { kind: 'llm', api: 'anthropic', model: 'claude-opus-5-5' }
};
export const TTS_PROVIDERS = ['auto', 'ema', 'antalia', 'kokoro', 'freya', 'piper', 'say', 'openai', 'elevenlabs', 'command'];

export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) value = value.slice(1, value.lastIndexOf(quote));
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

function bool(name, value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  throw new Error(`${name} must be true or false, got "${value}"`);
}

function number(name, value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number between ${min} and ${max}, got "${value}"`);
  return n;
}

function choice(name, value, fallback, options) {
  if (value === undefined || value === '') return fallback;
  const v = value.toLowerCase();
  if (!options.includes(v)) throw new Error(`${name} must be one of ${options.join(', ')}; got "${value}"`);
  return v;
}

const lang = (name, value, fallback) => {
  if (value === undefined || value === '') return fallback;
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value)) throw new Error(`${name} must be a language code such as en, tr or pt-BR; got "${value}"`);
  return value;
};

/** Resolve every setting. `overrides` are KEY=value pairs from the command line. */
export function loadConfig({ envFile, overrides = {}, env = process.env } = {}) {
  const file = path.resolve(ROOT, envFile || '.env');
  if (envFile && !existsSync(file)) throw new Error(`Env file not found: ${file}`);
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const e = { ...fromFile, ...env, ...overrides };
  // Values are trimmed, and a stray trailing period or comma (easy to pick up when pasting a command) is dropped.
  const get = key => (e[key] === undefined ? undefined : String(e[key]).trim().replace(/(?<=\S)[.,;]+$/, ''));

  const agentId = (get('AGENT') || 'claude').toLowerCase();
  const known = AGENTS[agentId];
  if (!known && !get('AGENT_COMMAND')) throw new Error(`AGENT must be one of ${Object.keys(AGENTS).join(', ')}, or any name together with AGENT_COMMAND; got "${agentId}"`);
  const agent = {
    id: agentId,
    kind: known?.kind || 'cli',
    api: known?.api,
    name: slugify(get('AGENT_NAME') || agentId, { keepAll: true }),
    model: get('AGENT_MODEL') || known?.model || '',
    command: get('AGENT_COMMAND') || '',
    args: get('AGENT_ARGS') || '',
    baseUrl: (get('LLM_BASE_URL') || (agentId === 'ollama' ? `${(get('OLLAMA_HOST') || 'http://localhost:11434').replace(/\/$/, '')}/v1` : agentId === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/$/, ''),
    apiKey: get('LLM_API_KEY') || (agentId === 'openai' ? get('OPENAI_API_KEY') : agentId === 'anthropic' ? get('ANTHROPIC_API_KEY') : '') || '',
    retries: number('AGENT_MAX_FIXES', get('AGENT_MAX_FIXES'), 3, 0, 10),
    timeoutMinutes: number('AGENT_TIMEOUT_MIN', get('AGENT_TIMEOUT_MIN'), 45, 1, 600)
  };

  const formatRaw = (get('VIDEO_FORMAT') || 'vertical').toLowerCase();
  const format = FORMAT_ALIASES[formatRaw] || formatRaw;
  const preset = FORMATS[format];
  if (!preset) throw new Error(`VIDEO_FORMAT must be landscape, vertical or square; got "${formatRaw}"`);
  let { width, height } = preset;
  const resolution = get('VIDEO_RESOLUTION');
  if (resolution) {
    const m = resolution.match(/^(\d{3,4})x(\d{3,4})$/i);
    if (!m || m[1] % 2 || m[2] % 2) throw new Error(`VIDEO_RESOLUTION must look like 1920x1080 with even numbers; got "${resolution}"`);
    width = Number(m[1]); height = Number(m[2]);
  }

  const language = lang('LANGUAGE', get('LANGUAGE'), 'en');
  const voiceover = bool('VOICEOVER', get('VOICEOVER'), true);
  const voiceLang = lang('VOICEOVER_LANG', get('VOICEOVER_LANG'), language);
  const subtitles = bool('SUBTITLES', get('SUBTITLES'), true);

  return {
    root: ROOT,
    envFile: existsSync(file) ? file : null,
    agent,
    language,
    video: {
      format, width, height,
      fps: number('VIDEO_FPS', get('VIDEO_FPS'), 30, 1, 60),
      duration: number('VIDEO_DURATION', get('VIDEO_DURATION'), preset.duration, 5, 1800),
      style: get('VIDEO_STYLE') || '3b1b',
      crf: number('VIDEO_CRF', get('VIDEO_CRF'), 18, 0, 40),
      safe: preset.safe
    },
    voiceover: {
      enabled: voiceover,
      lang: voiceLang,
      provider: choice('TTS_PROVIDER', get('TTS_PROVIDER'), 'auto', TTS_PROVIDERS),
      voice: get('TTS_VOICE') || '',
      model: get('TTS_MODEL') || '',
      speed: number('TTS_SPEED', get('TTS_SPEED'), 1, 0.5, 2),
      baseUrl: (get('TTS_BASE_URL') || '').replace(/\/$/, ''),
      apiKey: get('TTS_API_KEY') || '',
      command: get('TTS_COMMAND') || '',
      device: choice('FREYA_DEVICE', get('FREYA_DEVICE'), 'cpu', ['cpu', 'mps']),
      python: get('TTS_PYTHON') || path.join(ROOT, '.venv/bin/python'),
      voicesDir: path.resolve(ROOT, get('PIPER_VOICES_DIR') || 'voices'),
      keys: { openai: get('OPENAI_API_KEY') || '', elevenlabs: get('ELEVENLABS_API_KEY') || '' }
    },
    subtitles: {
      enabled: subtitles,
      // Without a voice-over the subtitles are the script itself, so they default to the content language.
      lang: lang('SUBTITLE_LANG', get('SUBTITLE_LANG'), voiceover ? voiceLang : language),
      langSet: Boolean(get('SUBTITLE_LANG')),
      mode: choice('SUBTITLE_MODE', get('SUBTITLE_MODE'), 'both', ['burn', 'file', 'both']),
      ...preset.sub
    },
    outputDir: path.resolve(ROOT, get('OUTPUT_DIR') || 'outputs')
  };
}

const TRANSLIT = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', ß: 'ss', æ: 'ae', ø: 'o' };
const FILLER = new Set(['how', 'what', 'why', 'when', 'does', 'do', 'is', 'are', 'the', 'a', 'an', 'to', 'of', 'works', 'work', 'explain', 'explained', 'about', 'nasil', 'nedir', 'neden', 'calisir', 'calisiyor', 'bir', 've', 'ne']);

/** "How the Ratchet algorithm works" -> "ratchet-algorithm". */
export function slugify(text, { keepAll = false } = {}) {
  const words = String(text).replace(/[ıİşŞğĞüÜöÖçÇßæø]/g, c => TRANSLIT[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kept = keepAll ? words : words.filter(word => !FILLER.has(word));
  const slug = (kept.length ? kept : words).slice(0, 6).join('-').slice(0, 60).replace(/-+$/, '');
  if (!slug) throw new Error(`Cannot derive a folder name from "${text}"; pass --slug`);
  return slug;
}

/** outputs/<topic>/<agent>/ with the final video named after the topic. */
export function projectPaths(config, topicOrSlug, { slug } = {}) {
  // A slug is one folder name; it must not walk out of the output folder.
  if (slug && !/^[A-Za-z0-9][\w.-]*$/.test(slug)) throw new Error(`--slug must be a plain folder name (letters, digits, dashes); got "${slug}"`);
  const topic = slug || slugify(topicOrSlug);
  const dir = path.join(config.outputDir, topic, config.agent.name);
  return { topic, dir, ...outputFiles(config, dir, topic) };
}

export function outputFiles(config, dir, topic) {
  // The default format gets the plain name; other formats of the same project sit beside it.
  const base = config.video.format === 'vertical' ? topic : `${topic}-${config.video.format}`;
  return { video: path.join(dir, `${base}.mp4`), srt: path.join(dir, `${base}.${config.subtitles.lang}.srt`), report: path.join(dir, `${base}.render.json`) };
}

/** Flat, secret-free description of the resolved settings, for `config` and for briefs. */
export function describeConfig(config) {
  const v = config.voiceover, s = config.subtitles;
  return {
    agent: `${config.agent.name} (${config.agent.kind}${config.agent.model ? `, ${config.agent.model}` : ''})`,
    language: config.language,
    format: `${config.video.format} ${config.video.width}x${config.video.height} @ ${config.video.fps} fps`,
    duration: `about ${config.video.duration} s`,
    style: config.video.style,
    voiceover: v.enabled ? `on, ${v.lang}, provider ${v.provider}${v.voice ? `, voice ${v.voice}` : ''}${v.speed !== 1 ? `, speed ${v.speed}` : ''}` : 'off',
    subtitles: s.enabled ? `on, ${s.lang}, ${s.mode === 'both' ? 'burned in + .srt' : s.mode === 'burn' ? 'burned in' : '.srt file only'}` : 'off',
    outputs: path.relative(ROOT, config.outputDir) || '.'
  };
}
