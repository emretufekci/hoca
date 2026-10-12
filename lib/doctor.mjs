// Environment check: are the tools, the voice and the agent that .env asks for actually usable?
import { describeConfig } from './config.mjs';
import { has, run } from './proc.mjs';
import { resolveProvider } from './tts.mjs';

export async function doctor(config, log = console.log) {
  let ok = true;
  const report = (good, label, detail, required = true) => { if (!good && required) ok = false; log(`${good ? 'ok  ' : required ? 'FAIL' : 'note'}  ${label}${detail ? `: ${detail}` : ''}`); };

  for (const [key, value] of Object.entries(describeConfig(config))) log(`      ${key.padEnd(10)} ${value}`);
  log('');
  // 18.14 is the real floor: the renderer sizes its worker pool with os.availableParallelism().
  const [major, minor] = process.versions.node.split('.').map(Number);
  report(major > 18 || (major === 18 && minor >= 14), 'Node.js 18.14+', process.versions.node);
  report(await has('ffmpeg'), 'ffmpeg', (await has('ffmpeg')) ? '' : 'brew install ffmpeg');
  report(await has('rsvg-convert'), 'rsvg-convert', (await has('rsvg-convert')) ? '' : 'brew install librsvg');

  if (config.voiceover.enabled) {
    try { report(true, 'voice-over', `${await resolveProvider(config.voiceover)} for "${config.voiceover.lang}"`); }
    catch (error) { report(false, 'voice-over', error.message); }
    const p = config.voiceover.provider;
    if (p === 'openai' && !config.voiceover.apiKey && !config.voiceover.keys.openai && !config.voiceover.baseUrl) report(false, 'TTS credentials', 'set TTS_API_KEY or OPENAI_API_KEY');
    if (p === 'elevenlabs' && !config.voiceover.apiKey && !config.voiceover.keys.elevenlabs) report(false, 'TTS credentials', 'set TTS_API_KEY or ELEVENLABS_API_KEY');
  } else report(true, 'voice-over', 'off');

  const { agent } = config;
  if (agent.kind === 'cli') {
    const binary = agent.command ? agent.command.trim().split(/\s+/)[0] : agent.id;
    report(await has(binary), `agent CLI "${binary}"`, (await has(binary)) ? '' : 'not on PATH (only needed for "make"; an interactive agent can still use "brief")', false);
  } else if (agent.api === 'anthropic') {
    report(Boolean(agent.apiKey) || Boolean(process.env.ANTHROPIC_AUTH_TOKEN), 'Anthropic credentials', agent.apiKey ? agent.model : 'no ANTHROPIC_API_KEY in .env; the SDK will try an `ant auth login` profile', false);
  } else {
    try {
      const response = await fetch(`${agent.baseUrl}/models`, { headers: agent.apiKey ? { authorization: `Bearer ${agent.apiKey}` } : {}, signal: AbortSignal.timeout(5000) });
      const models = response.ok ? ((await response.json()).data || []).map(model => model.id) : [];
      report(response.ok, `LLM endpoint ${agent.baseUrl}`, response.ok ? `${models.length} models` : `HTTP ${response.status}`);
      if (response.ok) report(Boolean(agent.model) && (!models.length || models.includes(agent.model)), 'AGENT_MODEL', agent.model ? (models.includes(agent.model) || !models.length ? agent.model : `"${agent.model}" is not served; available: ${models.slice(0, 8).join(', ') || 'none'}`) : `not set; available: ${models.slice(0, 8).join(', ') || 'none (pull one first)'}`);
    } catch (error) {
      report(false, `LLM endpoint ${agent.baseUrl}`, `unreachable (${error.cause?.code || error.name})${agent.id === 'ollama' ? '; start it with: ollama serve' : ''}`);
    }
  }
  if (config.video.fps * config.video.duration > 9000) report(false, 'render size', `${config.video.fps * config.video.duration} frames will take a while`, false);
  await run('fc-list', []).then(() => {}, () => report(false, 'fontconfig', 'fc-list not found; text may fall back to a default font', false));
  log(ok ? '\nReady.' : '\nFix the FAIL lines above.');
  return ok;
}
