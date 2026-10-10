// Headless authoring: hand the brief to the configured agent, then check its work and ask for fixes.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { buildBrief } from './brief.mjs';
import { chat, parseFiles } from './llm.mjs';
import { run } from './proc.mjs';
import { createUi } from './progress.mjs';
import { describeAgent } from './runtime.mjs';

const quote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

/** The shell command that runs a coding agent non-interactively with the prompt on stdin. */
export function agentCommand(agent, promptFile) {
  const model = agent.model;
  const base = agent.command
    ? agent.command.replace(/\{prompt_file\}/g, quote(promptFile)).replace(/\{model\}/g, quote(model))
    : agent.id === 'claude'
      // Edits are auto-accepted; shell access is limited to this repo's own CLI.
      ? `claude -p --permission-mode acceptEdits --allowedTools ${quote('Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(node bin/hoca.mjs *)')}${model ? ` --model ${quote(model)}` : ''}`
      : `codex exec --skip-git-repo-check --sandbox workspace-write -C ${quote(ROOT)}${model ? ` -m ${quote(model)}` : ''} -`;
  return agent.args ? `${base} ${agent.args}` : base;
}

function runAgent(command, prompt, env, timeoutMinutes) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd: ROOT, env, stdio: ['pipe', 'inherit', 'inherit'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMinutes * 60000);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Agent command exited ${code ?? 'on timeout'}: ${command}`)); });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
  });
}

/** Run the check in a fresh process: generated modules are re-imported cleanly and cannot hang us. */
async function check(projectDir, env) {
  const out = await run(process.execPath, [path.join(ROOT, 'bin/hoca.mjs'), 'check', projectDir, '--json'], { cwd: ROOT, env, timeoutMs: 180000 }).catch(error => JSON.stringify({ errors: [error.message.slice(0, 1500)], warnings: [] }));
  try { return JSON.parse(out); } catch { return { errors: [`check printed unexpected output: ${out.slice(0, 500)}`], warnings: [] }; }
}

const problems = result => [...result.errors.map(e => `ERROR: ${e}`), ...result.warnings.map(w => `WARN: ${w}`)].join('\n');
// A script far over the word budget is worth one more round even though it renders.
const tooLong = result => result.warnings.some(w => /Trim it/.test(w));

/** What a coding agent has produced so far, read from its project folder. */
function authoringStage(projectDir) {
  const files = existsSync(projectDir) ? readdirSync(projectDir) : [];
  const scenes = files.filter(name => /^scene-\d+\.mjs$/.test(name)).length;
  if (existsSync(path.join(projectDir, 'preview', 'contact-sheet.png'))) return `${scenes} scenes written, reviewing the preview frames`;
  if (scenes) return `script written, ${scenes} scene${scenes > 1 ? 's' : ''} animated so far`;
  if (files.includes('video.json')) return 'script written, animating the scenes';
  return 'researching the topic and writing the script';
}

export async function author(config, topic, projectDir, { log = console.log, env = process.env, ui = createUi(log) } = {}) {
  const { agent } = config;
  await mkdir(projectDir, { recursive: true });
  const rel = path.relative(ROOT, projectDir);

  if (agent.kind === 'cli') {
    const promptFile = path.join(projectDir, '.brief.md');
    let prompt = buildBrief(config, topic, projectDir, { mode: 'cli' });
    try {
      for (let attempt = 0; ; attempt++) {
        await writeFile(promptFile, prompt);
        const command = agentCommand(agent, promptFile);
        // A coding agent works on its own for several minutes; its messages appear below as they come.
        // A coding agent works on its own for several minutes and says little until the end,
        // so report what has appeared in its folder: that is the only honest progress signal.
        log(`Writing    $ ${command}`);
        const step = ui.activity('Writing');
        let stage = '';
        const watch = setInterval(() => {
          const now = authoringStage(projectDir);
          if (now !== stage && !ui.tty) log(`Writing    ${now}`);
          stage = now;
          step.update(now);
        }, 1000);
        try { await runAgent(command, prompt, env, agent.timeoutMinutes); } finally { clearInterval(watch); }
        const result = await check(projectDir, env);
        step.done(result.errors.length ? 'check found problems' : 'script and scenes pass the check');
        if (!result.errors.length) return result;
        if (attempt >= Math.min(agent.retries, 2)) throw new Error(`${agent.name} left problems in ${rel}:\n${problems(result)}`);
        log(`Check failed; asking ${agent.name} to fix:\n${problems(result)}`);
        prompt = `The explainer video project in \`${rel}\` does not pass \`node bin/hoca.mjs check ${rel}\`:\n\n${problems(result)}\n\nFix the files in \`${rel}\` only, re-run the check until it passes, and review preview/contact-sheet.png. The original brief follows for reference.\n\n---\n\n${buildBrief(config, topic, projectDir, { mode: 'cli' })}`;
      }
    } finally { await rm(promptFile, { force: true }); }
  }

  const messages = [{ role: 'user', content: buildBrief(config, topic, projectDir, { mode: 'llm' }) }];
  for (let attempt = 0; ; attempt++) {
    if (!attempt) log(`Writing    ${describeAgent(agent)}`);
    const step = ui.activity(attempt ? `Fixing ${attempt}` : 'Writing');
    let received = 0;
    const reply = await chat(agent, messages, count => { received += count; step.update(`${received.toLocaleString('en')} characters received`); });
    step.done(`${received.toLocaleString('en')} characters`);
    messages.push(reply.message);
    let feedback;
    try {
      const files = parseFiles(reply.text);
      for (const [name, content] of Object.entries(files)) await writeFile(path.join(projectDir, name), content);
      const result = await check(projectDir, env);
      if (!result.errors.length && !(tooLong(result) && attempt < 1)) return result;
      feedback = `The pipeline checked your files:\n\n${problems(result)}\n\nReply again with the complete corrected set of files in the same format.`;
    } catch (error) {
      feedback = `${error.message}\n\nReply again with the complete set of files in the required format.`;
    }
    if (attempt >= agent.retries) throw new Error(`${agent.id} did not produce a working project after ${attempt + 1} attempts. Last feedback:\n${feedback}`);
    log(`Needs fixes:\n${feedback.split('\n').slice(0, 12).join('\n')}`);
    messages.push({ role: 'user', content: feedback });
  }
}
