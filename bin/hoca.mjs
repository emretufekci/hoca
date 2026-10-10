#!/usr/bin/env node
// Hoca: give it a topic, get an explainer video. Every setting comes from .env; flags override it per run.
import { existsSync, statSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, describeConfig, projectPaths, ROOT } from '../lib/config.mjs';

const HELP = `Usage: npm run hoca -- "<topic>" [options]
       npm run hoca -- <command> [options]

  "<topic>"            Write the video with the agent from .env, then render it (same as make)
  make "<topic>"       Same, spelled out
  brief "<topic>"      Print the authoring brief (for an agent you are already talking to)
  check <project>      Validate a project and write preview frames; no speech needed
  render <project>     Render a project to MP4 (plus .srt)
  tts "<text>" -o FILE Synthesize one clip with the configured voice
  config               Show the resolved settings
  doctor               Check tools, voice and agent
  list                 List projects under the output folder
  mcp                  Serve these commands as MCP tools over stdio (Claude Code, Codex)

<project> is a folder, or a topic (resolved to outputs/<topic>/<agent>/).

Options (each overrides the matching .env key for this run):
  --agent NAME         AGENT             --model NAME        AGENT_MODEL
  --agent-name NAME    AGENT_NAME        --format FORMAT     VIDEO_FORMAT (vertical|landscape|square)
  --duration SECONDS   VIDEO_DURATION    --fps N             VIDEO_FPS
  --lang CODE          LANGUAGE          --voice-lang CODE   VOICEOVER_LANG
  --subtitle-lang CODE SUBTITLE_LANG     --tts PROVIDER      TTS_PROVIDER
  --voiceover / --no-voiceover           --subtitles / --no-subtitles
  --set KEY=VALUE      Any other key     --env FILE          Use another env file
  --slug NAME          Folder name for the topic            --force   Overwrite an existing project
  --json               Machine-readable output (check, config)
  -o, --out FILE       Output file (render, tts)`;

const COMMANDS = ['make', 'brief', 'check', 'render', 'tts', 'config', 'doctor', 'list', 'mcp'];
const FLAGS = { '--agent': 'AGENT', '--agent-name': 'AGENT_NAME', '--model': 'AGENT_MODEL', '--format': 'VIDEO_FORMAT', '--duration': 'VIDEO_DURATION', '--fps': 'VIDEO_FPS', '--lang': 'LANGUAGE', '--voice-lang': 'VOICEOVER_LANG', '--subtitle-lang': 'SUBTITLE_LANG', '--tts': 'TTS_PROVIDER' };
const SWITCHES = { '--voiceover': ['VOICEOVER', 'true'], '--no-voiceover': ['VOICEOVER', 'false'], '--subtitles': ['SUBTITLES', 'true'], '--no-subtitles': ['SUBTITLES', 'false'] };

function parseArgs(argv) {
  const positional = [], overrides = {}, options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`); return argv[++i]; };
    if (FLAGS[arg]) overrides[FLAGS[arg]] = value();
    else if (SWITCHES[arg]) overrides[SWITCHES[arg][0]] = SWITCHES[arg][1];
    else if (arg === '--set') { const pair = value(), eq = pair.indexOf('='); if (eq < 1) throw new Error('--set expects KEY=VALUE'); overrides[pair.slice(0, eq)] = pair.slice(eq + 1); }
    else if (arg === '--env') options.env = value();
    else if (arg === '--slug') options.slug = value();
    else if (arg === '-o' || arg === '--out') options.out = value();
    else if (arg === '--force' || arg === '--json' || arg === '--help') options[arg.slice(2)] = true;
    else if (arg === '-h') options.help = true;
    // Everything after "--" is positional, so a topic or folder may start with a dash.
    else if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    else if (arg.startsWith('-') && arg !== '-') throw new Error(`Unknown option ${arg}. See --help.`);
    else positional.push(arg);
  }
  // Anything that is not a command is a topic: hoca "Türev nedir" means make "Türev nedir".
  if (positional.length && !COMMANDS.includes(positional[0])) positional.unshift('make');
  return { command: positional[0], args: positional.slice(1), overrides, options };
}

/** A project argument is a folder if one exists, otherwise a topic under outputs/<topic>/<agent>/. */
function resolveProject(config, reference, options) {
  if (!reference) throw new Error('Which project? Give a folder or a topic.');
  const asPath = path.resolve(reference);
  if (existsSync(asPath) && statSync(asPath).isDirectory() && existsSync(path.join(asPath, 'video.json'))) return asPath;
  const { dir, topic } = projectPaths(config, reference, options);
  if (existsSync(path.join(dir, 'video.json'))) return dir;
  const topicDir = path.join(config.outputDir, topic);
  const others = existsSync(topicDir) ? readdirSync(topicDir).filter(name => existsSync(path.join(topicDir, name, 'video.json'))) : [];
  throw new Error(`No project at ${path.relative(ROOT, dir)}.${others.length ? ` This topic has: ${others.join(', ')} (use --agent-name).` : ''}`);
}

const table = rows => { const width = Math.max(...Object.keys(rows).map(key => key.length)); return Object.entries(rows).map(([key, value]) => `${key.padEnd(width)}  ${value}`).join('\n'); };

async function main() {
  const { command, args, overrides, options } = parseArgs(process.argv.slice(2));
  if (!command || options.help) { console.log(HELP); return; }
  const envFile = options.env || process.env.HOCA_ENV_FILE;
  if (command === 'mcp') {
    // Starts before the settings are read: a broken .env should fail a tool call, not the server.
    if (options.env) process.env.HOCA_ENV_FILE = path.resolve(options.env);
    (await import('../lib/mcp.mjs')).serve();
    return;
  }
  const config = loadConfig({ envFile, overrides });
  // Child processes (the agent, its checks) must see the same overrides.
  const childEnv = { ...process.env, ...overrides, ...(envFile ? { HOCA_ENV_FILE: path.resolve(envFile) } : {}) };

  switch (command) {
    case 'config': {
      console.log(options.json ? JSON.stringify(config, (key, value) => (/apiKey|^keys$/.test(key) ? undefined : value), 2) : `${table(describeConfig(config))}\n\n${config.envFile ? `From ${path.relative(ROOT, config.envFile)}` : 'No .env file: using defaults. Copy .env.example to .env to change them.'}`);
      return;
    }
    case 'doctor': {
      const { doctor } = await import('../lib/doctor.mjs');
      process.exitCode = (await doctor(config)) ? 0 : 1;
      return;
    }
    case 'list': {
      if (!existsSync(config.outputDir)) return;
      for (const topic of readdirSync(config.outputDir).sort()) {
        const topicDir = path.join(config.outputDir, topic);
        if (!statSync(topicDir).isDirectory()) continue;
        for (const agent of readdirSync(topicDir).sort()) {
          const dir = path.join(topicDir, agent);
          if (!existsSync(path.join(dir, 'video.json'))) continue;
          const videos = readdirSync(dir).filter(name => name.endsWith('.mp4'));
          console.log(`${path.relative(ROOT, dir)}  ${videos.length ? videos.join(', ') : '(not rendered)'}`);
        }
      }
      return;
    }
    case 'brief': {
      const topic = args.join(' ').trim();
      if (!topic) throw new Error('Usage: brief "<topic>"');
      const { buildBrief } = await import('../lib/brief.mjs');
      const { dir } = projectPaths(config, topic, options);
      await mkdir(dir, { recursive: true });
      console.log(buildBrief(config, topic, dir, { mode: 'interactive' }));
      return;
    }
    case 'make': {
      const topic = args.join(' ').trim();
      if (!topic) throw new Error('Usage: make "<topic>"');
      const { dir } = projectPaths(config, topic, options);
      if (existsSync(path.join(dir, 'video.json')) && !options.force) throw new Error(`${path.relative(ROOT, dir)} already has a project. Use "render" to re-render it, --force to rewrite it, or --agent-name for a separate take.`);
      const { author } = await import('../lib/author.mjs');
      const { renderProject } = await import('../lib/render.mjs');
      const { runtimeRows } = await import('../lib/runtime.mjs');
      const { createUi } = await import('../lib/progress.mjs');
      const ui = createUi();
      console.log(`Hoca: "${topic}"\n\n${table({ ...(await runtimeRows(config)), Folder: path.relative(ROOT, dir) })}\n`);
      const checked = await author(config, topic, dir, { env: childEnv, ui });
      for (const warning of checked.warnings || []) console.log(`Warning: ${warning}`);
      await renderProject(dir, config, { ui });
      return;
    }
    case 'check': {
      const { checkProject, formatCheck } = await import('../lib/check.mjs');
      // With --json, stdout carries the result alone: whatever a scene module prints goes to stderr.
      if (options.json) console.log = console.error;
      const result = await checkProject(resolveProject(config, args[0], options), config);
      if (options.json) process.stdout.write(JSON.stringify({ errors: result.errors, warnings: result.warnings, estimatedDuration: result.estimatedDuration, sheet: result.sheet, scenes: result.timeline?.scenes.length, words: result.words, budget: result.budget }) + '\n');
      else console.log(formatCheck(result, ROOT));
      if (result.errors.length && !options.json) process.exitCode = 1;
      return;
    }
    case 'render': {
      const { renderProject } = await import('../lib/render.mjs');
      const { runtimeRows } = await import('../lib/runtime.mjs');
      const dir = resolveProject(config, args[0], options);
      const { readProject, configFor } = await import('../lib/project.mjs');
      const effective = configFor((await readProject(dir)).manifest, config);
      console.log(`${table({ ...(await runtimeRows(effective, { agent: false })), Folder: path.relative(ROOT, dir) })}\n`);
      await renderProject(dir, config, { output: options.out });
      return;
    }
    case 'tts': {
      const text = args.join(' ').trim();
      if (!text || !options.out) throw new Error('Usage: tts "<text>" -o clip.wav');
      const { synthesize, loadClip, wavFile } = await import('../lib/tts.mjs');
      const { files, provider } = await synthesize([text], config.voiceover, path.join(ROOT, '.cache/tts'));
      await mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
      await writeFile(path.resolve(options.out), wavFile(await loadClip(files[0], config.voiceover.speed)));
      console.log(`Wrote ${options.out} (${provider}, ${config.voiceover.lang})`);
      return;
    }
    default:
      throw new Error(`Unknown command "${command}". See --help.`);
  }
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
