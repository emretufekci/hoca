// MCP server over stdio: the brief, check and render steps as tools, for Claude Code, Codex and any other MCP client.
// Stdout carries the protocol, so the pipeline itself runs in child processes of the CLI and never prints here.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { loadConfig, projectPaths, FORMATS, ROOT } from './config.mjs';
import { buildBrief } from './brief.mjs';
import { run } from './proc.mjs';

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const CLI = path.join(ROOT, 'bin/hoca.mjs');
const MAX_IMAGE_BYTES = 3_000_000;

const INSTRUCTIONS = 'Hoca turns a topic into a short animated explainer video. Call hoca_brief with the topic, write video.json and the scene modules into the folder it names, call hoca_check until the frames read clearly, then hoca_render and report the MP4. Every setting comes from the .env of the Hoca repo: pass a setting to a tool only when the user asked for it, and then pass it to every call for that video.';

// Tool argument -> the .env key it overrides for that call.
const SETTINGS = {
  agent: ['AGENT_NAME', { type: 'string', description: 'Folder name of this take: outputs/<topic>/<agent>/. Defaults to the calling client (claude, codex).' }],
  format: ['VIDEO_FORMAT', { type: 'string', enum: Object.keys(FORMATS) }],
  duration: ['VIDEO_DURATION', { type: 'number', description: 'Target length in seconds.' }],
  language: ['LANGUAGE', { type: 'string', description: 'Language code for on-screen text, narration and subtitles, such as en or tr.' }],
  voice_language: ['VOICEOVER_LANG', { type: 'string', description: 'Narration language, when it differs from language.' }],
  subtitle_language: ['SUBTITLE_LANG', { type: 'string', description: 'Subtitle language, when it differs from the narration.' }],
  voiceover: ['VOICEOVER', { type: 'boolean' }],
  subtitles: ['SUBTITLES', { type: 'boolean' }]
};
const settingsSchema = Object.fromEntries(Object.entries(SETTINGS).map(([name, [, schema]]) => [name, schema]));
const PROJECT = { type: 'string', description: 'The project folder that hoca_brief named, or the topic.' };

function overridesFrom(args, client) {
  const overrides = {};
  for (const [name, [key]] of Object.entries(SETTINGS)) if (args[name] !== undefined && args[name] !== '') overrides[key] = String(args[name]);
  if (!overrides.AGENT_NAME && client) overrides.AGENT_NAME = client;
  return overrides;
}

// The positional arguments come from the model, so they go after "--" and are never read as options.
const cli = (command, args, overrides, options, flags = []) => run(process.execPath, [CLI, command, ...flags, ...Object.entries(overrides).flatMap(([key, value]) => ['--set', `${key}=${value}`]), '--', ...args], { cwd: ROOT, ...options });
// The CLI prints paths relative to the repo; the calling agent may be working somewhere else.
// The same labels also head settings rows ("Subtitles  off"), so only a value that is a file is rewritten.
const absolutePaths = text => text.replace(/^(Video|Subtitles|Folder)(\s+)(.+?)(?=  \(|$)/gm, (line, label, gap, file) => (existsSync(path.resolve(ROOT, file)) ? `${label}${gap}${path.resolve(ROOT, file)}` : line));

const TOOLS = {
  hoca_brief: {
    title: 'Get the authoring brief',
    description: 'Start here when asked for an explainer video. Creates the project folder for the topic and returns the full specification: frame size, length and word budget, languages, the scene module contract, the #kit drawing helpers and the workflow. Write the files it asks for, then call hoca_check.',
    properties: { topic: { type: 'string', description: 'What the video explains.' }, slug: { type: 'string', description: 'Folder name for the topic, instead of one derived from it.' }, ...settingsSchema },
    required: ['topic'],
    async call(args, { client }) {
      const config = loadConfig({ envFile: process.env.HOCA_ENV_FILE, overrides: overridesFrom(args, client) });
      const { dir } = projectPaths(config, args.topic, { slug: args.slug });
      await mkdir(dir, { recursive: true });
      const given = Object.keys(SETTINGS).filter(name => args[name] !== undefined && args[name] !== '');
      return `Project folder: ${dir}${given.length ? `\nPass the same ${given.join(', ')} to hoca_check and hoca_render.` : ''}\n\n${buildBrief(config, args.topic, dir, { mode: 'mcp' })}`;
    }
  },
  hoca_check: {
    title: 'Validate a project and preview its frames',
    description: 'Validates video.json and the scene modules and returns the contact sheet: one row per scene, time running left to right. Needs no speech synthesis, so it is fast; call it after every edit.',
    properties: { project: PROJECT, ...settingsSchema },
    required: ['project'],
    async call(args, { client, signal }) {
      const result = JSON.parse(await cli('check', [args.project], overridesFrom(args, client), { signal }, ['--json']));
      const lines = [...result.errors.map(error => `ERROR  ${error}`), ...result.warnings.map(warning => `WARN   ${warning}`)];
      if (!result.errors.length) lines.push(`OK     ${result.scenes} scenes, about ${result.estimatedDuration.toFixed(0)} s estimated, ${result.words} narration words (budget ${result.budget})`);
      const content = [{ type: 'text', text: lines.join('\n') }];
      if (result.sheet) {
        content[0].text += `\nLOOK   ${result.sheet} (rows = scenes, columns = time) and scene-NN-K.png beside it`;
        if (statSync(result.sheet).size <= MAX_IMAGE_BYTES) content.push({ type: 'image', data: (await readFile(result.sheet)).toString('base64'), mimeType: 'image/png' });
      }
      return { content, isError: result.errors.length > 0 };
    }
  },
  hoca_render: {
    title: 'Render a project to MP4',
    description: 'Synthesizes the voice, times the subtitles and renders the MP4. Takes from under a minute to several minutes; unchanged sentences reuse cached audio. Returns the video path and its duration.',
    properties: { project: PROJECT, ...settingsSchema },
    required: ['project'],
    call: async (args, { client, signal, progress }) => absolutePaths(await cli('render', [args.project], overridesFrom(args, client), { signal, onLine: line => line.trim() && progress(line.trim()) })).trim()
  },
  hoca_list: {
    title: 'List projects',
    description: 'Lists every project under the output folder with its rendered videos.',
    readOnly: true,
    call: async (args, { signal }) => (await cli('list', [], {}, { signal })).trim() || 'No projects yet.'
  },
  hoca_config: {
    title: 'Show the settings',
    description: 'Shows the settings in effect: format, length, languages, voice and subtitles.',
    properties: settingsSchema,
    readOnly: true,
    call: async (args, { client, signal }) => (await cli('config', [], overridesFrom(args, client), { signal })).trim()
  },
  hoca_doctor: {
    title: 'Check the environment',
    description: 'Checks that ffmpeg, rsvg-convert and the configured voice are usable. Call it when a check or render fails for a reason outside the project.',
    readOnly: true,
    call: async (args, { signal }) => (await cli('doctor', [], {}, { signal })).trimEnd()
  }
};

const describeTool = ([name, tool]) => ({
  name, title: tool.title, description: tool.description,
  inputSchema: { type: 'object', properties: tool.properties || {}, required: tool.required || [] },
  annotations: { title: tool.title, readOnlyHint: Boolean(tool.readOnly), openWorldHint: false }
});

class RpcError extends Error { constructor(code, message) { super(message); this.code = code; } }

/** Serve until stdin closes. `input` and `output` are injectable for tests. */
export function serve({ input = process.stdin, output = process.stdout } = {}) {
  const send = message => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const running = new Map();
  let client = '';

  async function callTool(id, { name, arguments: args = {}, _meta } = {}) {
    const tool = TOOLS[name];
    if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
    const controller = new AbortController();
    running.set(id, controller);
    let step = 0;
    const token = _meta?.progressToken;
    const progress = message => { if (token !== undefined) send({ method: 'notifications/progress', params: { progressToken: token, progress: ++step, message } }); };
    try {
      const missing = (tool.required || []).filter(key => typeof args[key] !== 'string' || !args[key].trim());
      if (missing.length) throw new Error(`${name} needs ${missing.join(', ')}`);
      const result = await tool.call(args, { client, signal: controller.signal, progress });
      return typeof result === 'string' ? { content: [{ type: 'text', text: result }] } : result;
    } catch (error) {
      // A failed step is a result the agent can act on, not a protocol error. A cancelled call gets no reply.
      if (controller.signal.aborted) return undefined;
      return { content: [{ type: 'text', text: error.message.replace(/^.+? exited \d+: (Error: )?/s, '') }], isError: true };
    } finally { running.delete(id); }
  }

  async function handle({ id, method, params = {} }) {
    switch (method) {
      case 'initialize': {
        // Projects are filed under the agent that wrote them, so remember who is calling.
        const name = params.clientInfo?.name || '';
        client = /claude/i.test(name) ? 'claude' : /codex/i.test(name) ? 'codex' : '';
        const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        return { protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: 'hoca', title: 'Hoca', version }, instructions: INSTRUCTIONS };
      }
      case 'ping': return {};
      case 'tools/list': return { tools: Object.entries(TOOLS).map(describeTool) };
      case 'tools/call': return callTool(id, params);
      default: throw new RpcError(-32601, `Method not found: ${method}`);
    }
  }

  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', async line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return send({ id: null, error: { code: -32600, message: 'Invalid Request' } });
    if (message.method === 'notifications/cancelled') return running.get(message.params?.requestId)?.abort();
    // Other notifications need no answer, and we never send requests that could be answered.
    if (message.id === undefined || message.id === null || !message.method) return;
    try {
      const result = await handle(message);
      if (result !== undefined) send({ id: message.id, result });
    } catch (error) { send({ id: message.id, error: { code: Number.isInteger(error.code) ? error.code : -32603, message: error.message } }); }
  });
  lines.on('close', () => { for (const controller of running.values()) controller.abort(); });
}
