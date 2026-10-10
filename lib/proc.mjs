// Small child-process helpers shared by the renderer, TTS providers and agent runners.
import { spawn } from 'node:child_process';

/** Run a command to completion. Resolves with stdout (a Buffer when `binary`), rejects with the tail of stderr. */
export function run(command, args = [], { input, binary = false, cwd, env, shell = false, timeoutMs, onLine, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell, signal, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    const out = [];
    let stderr = '';
    const timer = timeoutMs && setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    let pending = '';
    child.stdout.on('data', chunk => {
      out.push(chunk);
      if (!onLine) return;
      // Report complete stdout lines as they arrive (used for progress from long-running tools).
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) onLine(line);
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(error.code === 'ENOENT' ? new Error(`Command not found: ${command}`) : error); });
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out);
      if (code === 0) resolve(binary ? stdout : stdout.toString('utf8'));
      else reject(new Error(`${command} exited ${code ?? 'on timeout'}: ${stderr.trim() || stdout.toString('utf8').slice(-2000)}`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

export async function has(command) {
  try { await run('/bin/sh', ['-c', `command -v "${command}"`]); return true; } catch { return false; }
}

/** Run up to `limit` async jobs at a time; `add` waits while the pool is full. */
export function pool(limit) {
  const active = new Set();
  let failure;
  return {
    async add(job) {
      while (active.size >= limit) await Promise.race(active);
      if (failure) throw failure;
      const p = job().catch(error => { failure ??= error; }).finally(() => active.delete(p));
      active.add(p);
    },
    async done() {
      await Promise.all(active);
      if (failure) throw failure;
    }
  };
}
