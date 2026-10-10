// Plain-language description of where each part of the work happens: on this machine, through a
// subscription CLI, or on a paid API. Shown before a run so nothing happens behind the user's back.
import { availableParallelism } from 'node:os';
import { resolveProvider } from './tts.mjs';

const isLocal = url => /\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/.test(url || '');

export function describeAgent(agent) {
  const model = agent.model ? ` (${agent.model})` : '';
  if (agent.command) return `${agent.name}: your own CLI command`;
  if (agent.id === 'claude') return `Claude Code CLI${model}: remote model, on your Claude subscription or API login`;
  if (agent.id === 'codex') return `Codex CLI${model}: remote model, on your ChatGPT subscription or API login`;
  if (agent.id === 'anthropic') return `Claude API${model}: remote, billed per token to your API key`;
  if (agent.id === 'ollama') return isLocal(agent.baseUrl) ? `Ollama${model}: local model on this machine, no network` : `Ollama${model} at ${agent.baseUrl}: another machine on your network`;
  return isLocal(agent.baseUrl) ? `Local model server${model} at ${agent.baseUrl}: on this machine, no network` : `API${model} at ${agent.baseUrl}: remote, billed per token to your API key`;
}

const VOICES = {
  ema: () => 'EMA Lightning: local, on this machine\'s CPU',
  antalia: () => 'Antalia-2 Mini: local, on this machine\'s CPU',
  kokoro: () => 'Kokoro: local, on this machine\'s CPU',
  piper: () => 'Piper: local, on this machine\'s CPU',
  freya: v => `FreyaTTS: local, on this machine's ${v.device === 'mps' ? 'GPU (Metal)' : 'CPU'}`,
  say: () => 'macOS system voice: local',
  openai: v => (v.baseUrl && isLocal(v.baseUrl) ? `Speech server at ${v.baseUrl}: local` : `Speech API${v.baseUrl ? ` at ${v.baseUrl}` : ' (OpenAI)'}: remote, billed to your API key`),
  elevenlabs: () => 'ElevenLabs API: remote, billed to your API key',
  command: () => 'your own TTS command'
};

export async function describeVoice(config) {
  if (!config.voiceover.enabled) return 'off (silent video)';
  try {
    const provider = await resolveProvider(config.voiceover);
    return `${VOICES[provider](config.voiceover)}, ${config.voiceover.lang}`;
  } catch (error) { return `not available: ${error.message}`; }
}

export const describeRender = config => `on this machine's CPU, ${Math.max(2, availableParallelism() - 1)} workers: ${config.video.format} ${config.video.width}x${config.video.height}, about ${config.video.duration} s`;

/** Rows for the run header. `agent: false` leaves out the script line (rendering an existing project). */
export async function runtimeRows(config, { agent = true } = {}) {
  const s = config.subtitles;
  return {
    ...(agent ? { Script: describeAgent(config.agent) } : {}),
    Voice: await describeVoice(config),
    Subtitles: s.enabled ? `${s.lang}, ${s.mode === 'both' ? 'burned in + .srt file' : s.mode === 'burn' ? 'burned in' : '.srt file'}` : 'off',
    Video: describeRender(config)
  };
}
