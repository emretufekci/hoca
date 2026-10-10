import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { parseEnv, loadConfig, slugify, projectPaths, ROOT } from '../lib/config.mjs';
import { validateManifest, readProject, buildTimeline, sceneContext, wordBudget } from '../lib/project.mjs';
import { chunks, sentences, toSrt, burnIn } from '../lib/subtitles.mjs';
import { parseFiles } from '../lib/llm.mjs';
import { agentCommand } from '../lib/author.mjs';
import { buildBrief } from '../lib/brief.mjs';
import { checkProject } from '../lib/check.mjs';
import { scene, text, axes, onBeat } from '../lib/kit.mjs';

const config = (overrides = {}) => loadConfig({ env: {}, envFile: 'test/fixtures/empty.env', overrides });
const FIXTURE = path.join(ROOT, 'test/fixtures/legacy-svg');

test('.env parsing handles quotes, comments and export', () => {
  assert.deepEqual(parseEnv('# c\nA=1\nexport B="two words" # x\nC=\'#notcomment\'\nD=plain # trailing\nE='), { A: '1', B: 'two words', C: '#notcomment', D: 'plain', E: '' });
});

test('defaults follow the format', () => {
  assert.deepEqual([config().video.format, config().video.duration, config().language], ['vertical', 45, 'en']);
  assert.equal(config({ VIDEO_FORMAT: 'landscape' }).video.duration, 120);
  assert.equal(config({ VIDEO_FORMAT: 'vertical.', LANGUAGE: 'tr,' }).language, 'tr');
  const reel = config({ VIDEO_FORMAT: 'reel' });
  assert.deepEqual([reel.video.format, reel.video.width, reel.video.height, reel.video.duration], ['vertical', 1080, 1920, 45]);
});

test('languages cascade: LANGUAGE -> VOICEOVER_LANG -> SUBTITLE_LANG', () => {
  assert.equal(config({ LANGUAGE: 'tr' }).subtitles.lang, 'tr');
  assert.equal(config({ LANGUAGE: 'tr', VOICEOVER_LANG: 'en' }).subtitles.lang, 'en');
  assert.equal(config({ LANGUAGE: 'tr', VOICEOVER_LANG: 'en', VOICEOVER: 'false' }).subtitles.lang, 'tr');
  assert.equal(config({ VOICEOVER_LANG: 'tr', SUBTITLE_LANG: 'en' }).subtitles.lang, 'en');
});

test('bad settings are rejected with the key name', () => {
  assert.throws(() => config({ VIDEO_FORMAT: 'cube' }), /VIDEO_FORMAT/);
  assert.throws(() => config({ SUBTITLES: 'maybe' }), /SUBTITLES/);
  assert.throws(() => config({ AGENT: 'nobody' }), /AGENT/);
  assert.equal(config({ AGENT: 'gemini', AGENT_COMMAND: 'gemini -p' }).agent.kind, 'cli');
});

test('output path is outputs/<topic>/<agent>/<topic>.mp4', () => {
  assert.equal(slugify('How the Ratchet algorithm works'), 'ratchet-algorithm');
  assert.equal(slugify('FreeSWITCH nedir?'), 'freeswitch');
  assert.equal(slugify('Dijital ürün pasaportu nasıl çalışır'), 'dijital-urun-pasaportu');
  const plain = projectPaths(config({ AGENT: 'codex' }), 'How the Ratchet algorithm works');
  assert.equal(path.relative(ROOT, plain.video), 'outputs/ratchet-algorithm/codex/ratchet-algorithm.mp4');
  const wide = projectPaths(config({ AGENT: 'ollama', AGENT_NAME: 'Ollama Qwen', VIDEO_FORMAT: 'landscape' }), 'ratchet', { slug: 'ratchet' });
  assert.equal(path.relative(ROOT, wide.video), 'outputs/ratchet/ollama-qwen/ratchet-landscape.mp4');
});

test('manifest validation', () => {
  const ok = { language: 'en', scenes: [{ module: 'scene-1.mjs', narration: 'Hello.' }] };
  assert.doesNotThrow(() => validateManifest(ok));
  assert.throws(() => validateManifest({ ...ok, scenes: [{ module: '../outside.mjs', narration: 'Hi.' }] }), /project-local/);
  assert.throws(() => validateManifest({ ...ok, scenes: [{ module: 'a.mjs' }] }), /narration, or a duration/);
  assert.doesNotThrow(() => validateManifest({ ...ok, scenes: [{ module: 'a.mjs', duration: 4 }] }));
});

test('subtitle chunks are at most two lines and never a stray word', () => {
  for (const max of [26, 46]) {
    const parts = chunks('A one-way function turns the current chain key into a message key and the next chain key today.', max);
    assert.ok(parts.every(lines => lines.length <= 2 && lines.every(line => line.length <= max)));
    assert.ok(parts.every(lines => lines.join(' ').length > 8));
  }
  assert.equal(sentences('First sentence here. Second sentence here.').length, 2);
  assert.match(toSrt([{ start: 1.5, end: 3, lines: ['a', 'b'] }]), /^1\n00:00:01,500 --> 00:00:03,000\na\nb\n$/);
});

test('burned-in subtitles scale into the scene coordinate system and escape text', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"></svg>';
  const out = burnIn(svg, { lines: ['Tom & Jerry'] }, { width: 1920, height: 1080, safe: { bottom: 0.05 }, size: 0.042, band: 0.15 });
  assert.match(out, /Tom &amp; Jerry/);
  assert.match(out, /font-size="30\.2"/);
  assert.equal(burnIn(svg, undefined, {}), svg);
});

test('timeline without speech: beats, cues and silent pacing toward the target', async () => {
  const project = await readProject(FIXTURE);
  const silent = config({ LANGUAGE: 'tr', VOICEOVER: 'false', VIDEO_DURATION: '30' });
  const timeline = await buildTimeline(project, silent, { speech: false });
  assert.equal(timeline.scenes.length, 2);
  assert.ok(timeline.audio === null && timeline.cues.length >= 4);
  assert.ok(Math.abs(timeline.duration - 30) < 4, `duration ${timeline.duration}`);
  const ctx = sceneContext(timeline.scenes[0], timeline.scenes[0].beats[1].start + 0.01, silent, project.manifest);
  assert.equal(ctx.beat, 1);
  assert.ok(ctx.safe.bottom > silent.video.safe.bottom * silent.video.height, 'subtitle band is reserved');
});

test('subtitles in another language need a translation', async () => {
  const project = await readProject(FIXTURE);
  await assert.rejects(buildTimeline(project, config({ LANGUAGE: 'tr', SUBTITLE_LANG: 'en' }), { speech: false }), /no "en" subtitle/);
  const translated = { ...project, manifest: { ...project.manifest, scenes: project.manifest.scenes.map(s => ({ ...s, subtitle: 'First sentence here. Second sentence here.' })) } };
  const timeline = await buildTimeline(translated, config({ LANGUAGE: 'tr', SUBTITLE_LANG: 'en' }), { speech: false });
  assert.ok(timeline.cues.some(cue => cue.lines.join(' ').includes('First sentence')));
});

test('check runs a legacy raw-SVG project and flags a mismatched canvas for vertical', async () => {
  const result = await checkProject(FIXTURE, config({ LANGUAGE: 'tr', VIDEO_FORMAT: 'vertical' }), { previews: false });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some(w => /letterboxed/.test(w)));
});

test('model replies are parsed into files', () => {
  const files = parseFiles('<think>hmm</think>\n=== FILE: video.json ===\n```json\n{"a":1}\n```\n=== FILE: scene-1.mjs ===\nexport function render() {}\n=== END ===\nbye');
  assert.deepEqual(Object.keys(files), ['video.json', 'scene-1.mjs']);
  assert.equal(files['video.json'], '{"a":1}\n');
  assert.equal(files['scene-1.mjs'], 'export function render() {}\n');
  assert.throws(() => parseFiles('=== FILE: ../x.mjs ===\n1'), /Unexpected file name/);
  assert.throws(() => parseFiles('no files'), /video\.json/);
});

test('agent commands and briefs reflect the settings', () => {
  assert.match(agentCommand(config({ AGENT: 'codex', AGENT_MODEL: 'gpt-x' }).agent, '/tmp/p.md'), /^codex exec .* -m 'gpt-x' -$/);
  assert.match(agentCommand(config({ AGENT: 'claude' }).agent, '/tmp/p.md'), /^claude -p --permission-mode acceptEdits/);
  assert.equal(agentCommand(config({ AGENT: 'x', AGENT_COMMAND: 'run {prompt_file}', AGENT_ARGS: '--fast' }).agent, '/tmp/p.md'), "run '/tmp/p.md' --fast");
  const c = config({ VIDEO_FORMAT: 'vertical', VOICEOVER_LANG: 'tr', SUBTITLE_LANG: 'en' });
  const brief = buildBrief(c, 'Ratchets', projectPaths(c, 'Ratchets').dir, { mode: 'llm' });
  assert.ok(!/\{\{\w+\}\}/.test(brief), 'no unfilled placeholders');
  for (const expected of ['1080×1920', 'Vertical video', '"subtitle"', 'Turkish', `${wordBudget(c)} words`, '=== FILE: video.json ===', 'outputs/ratchets/claude']) assert.ok(brief.includes(expected), expected);
  assert.ok(buildBrief(config({ VOICEOVER: 'false', SUBTITLES: 'false' }), 'x y', '/tmp/x', { mode: 'cli' }).includes('The video is silent'));
  assert.ok(buildBrief(c, 'Ratchets', projectPaths(c, 'Ratchets').dir, { mode: 'mcp' }).includes(`Call \`hoca_check\` with project \`${projectPaths(c, 'Ratchets').dir}\``));
  assert.throws(() => projectPaths(c, 'x', { slug: '../../elsewhere' }), /--slug/);
});

test('kit scenes are valid, animated and escape text', () => {
  const ctx = seconds => ({ width: 1080, height: 1920, seconds, duration: 6, progress: seconds / 6, safe: { top: 200, right: 80, bottom: 500, left: 80 }, beats: [{ start: 0.3, end: 2 }, { start: 2.2, end: 5 }], beat: 0 });
  const render = c => scene(c, { title: 'A < B & C' }, rect => {
    const plot = axes(rect, { x: [0, 4], y: [0, 16] });
    return plot.svg(onBeat(c, 0)) + plot.plot(x => x * x, { draw: onBeat(c, 1) }) + text(rect.cx, rect.cy, 'x²', { anchor: 'middle' });
  });
  const start = render(ctx(0.5)), end = render(ctx(5.5));
  assert.match(start, /^<svg [^>]*viewBox="0 0 1080 1920"/);
  assert.ok(end.includes('A &lt; B &amp; C'));
  assert.notEqual(start, end);
});

test('manim port: rate functions, LaTeX and Write', async () => {
  const kit = await import('../lib/kit.mjs');
  assert.equal(kit.smooth(0), 0); assert.equal(kit.smooth(1), 1); assert.equal(kit.smooth(0.5), 0.5);
  assert.equal(kit.thereAndBack(0.5), 1); assert.ok(kit.overshoot(0.7) > 1);
  const done = kit.tex(100, 100, String.raw`\frac{d}{dx}\,{\color{#58C4DD}x^2} = 2x`, { size: 60 });
  const half = kit.tex(100, 100, String.raw`\frac{d}{dx}\,{\color{#58C4DD}x^2} = 2x`, { size: 60, write: 0.5 });
  assert.match(done, /^<g transform=/); assert.ok(done.includes('#58C4DD') && !done.includes('\u0000'));
  assert.ok(half.includes('stroke-dasharray') && !done.includes('stroke-dasharray'));
  assert.ok(kit.texSize('x^2', 100).w > 50);
  assert.throws(() => kit.tex(0, 0, String.raw`\frac{1}{`), /TeX error/);
  assert.ok(kit.text(0, 0, 'two words', { write: 0.5 }).includes('<tspan'));
  assert.equal(kit.morph(kit.shape.square(0, 0, 10), kit.shape.circle(0, 0, 5), 0.5).length, 96);
});

test('auto picks the installed local voice for the language', async () => {
  const { resolveProvider } = await import('../lib/tts.mjs');
  const v = (lang, python) => ({ ...config({ VOICEOVER_LANG: lang }).voiceover, python });
  // With no Python environment nothing local is "installed", so it falls through to Piper or say.
  assert.ok(['piper', 'say'].includes(await resolveProvider(v('en', '/nonexistent/bin/python')).catch(() => 'say')));
  assert.throws(() => config({ TTS_PROVIDER: 'nope' }), /TTS_PROVIDER/);
  assert.equal(config({ TTS_PROVIDER: 'antalia' }).voiceover.provider, 'antalia');
});

test('MCP server lists the tools and runs them', async () => {
  const { spawn } = await import('node:child_process');
  const { createInterface } = await import('node:readline');
  const child = spawn(process.execPath, [path.join(ROOT, 'bin/hoca.mjs'), 'mcp', '--env', 'test/fixtures/empty.env'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  createInterface({ input: child.stdout }).on('line', line => { const message = JSON.parse(line); waiting.get(message.id)?.(message); });
  let next = 0;
  const call = (method, params) => new Promise(resolve => { waiting.set(++next, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: next, method, params })}\n`); });
  const noisy = await mkdtemp(path.join(tmpdir(), 'hoca-mcp-'));
  await writeFile(path.join(noisy, 'video.json'), JSON.stringify({ language: 'en', scenes: [{ module: 's1.mjs', narration: 'A bar grows. Then it stops.' }] }));
  await writeFile(path.join(noisy, 's1.mjs'), "console.log('debug');\nexport const render = ctx => `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ${ctx.width} ${ctx.height}\"><rect width=\"${ctx.width * ctx.progress}\" height=\"50\" fill=\"red\"/></svg>`;\n");
  try {
    const { result: hello } = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-mcp-client', version: '0' } });
    assert.deepEqual([hello.protocolVersion, hello.serverInfo.name, Object.keys(hello.capabilities)], ['2025-06-18', 'hoca', ['tools']]);
    const { result: { tools } } = await call('tools/list');
    assert.deepEqual(tools.map(tool => tool.name), ['hoca_brief', 'hoca_check', 'hoca_render', 'hoca_list', 'hoca_config', 'hoca_doctor']);
    assert.deepEqual(tools[0].inputSchema.required, ['topic']);
    // The folder follows the calling client, and a per-call setting overrides .env.
    const { result: settings } = await call('tools/call', { name: 'hoca_config', arguments: { format: 'landscape' } });
    assert.match(settings.content[0].text, /agent\s+codex[\s\S]*landscape 1920x1080/);
    const { result: failed } = await call('tools/call', { name: 'hoca_check', arguments: { project: 'no-such-project' } });
    assert.ok(failed.isError && /No project at/.test(failed.content[0].text));
    // A scene that prints must not corrupt the result, and a project is never read as an option.
    const { result: checked } = await call('tools/call', { name: 'hoca_check', arguments: { project: noisy } });
    assert.match(checked.content[0].text, /OK\s+1 scenes/);
    const { result: dashed } = await call('tools/call', { name: 'hoca_render', arguments: { project: '--help' } });
    assert.ok(dashed.isError && !/Usage:/.test(dashed.content[0].text));
    const { result: escaped } = await call('tools/call', { name: 'hoca_brief', arguments: { topic: 'x', slug: '../../elsewhere' } });
    assert.ok(escaped.isError && /--slug/.test(escaped.content[0].text));
    // A line that is valid JSON but not a message gets an error, and the server keeps running.
    const invalid = new Promise(resolve => waiting.set(null, resolve));
    child.stdin.write('null\n');
    assert.equal((await invalid).error.code, -32600);
    assert.equal((await call('tools/call', { name: 'nope' })).error.code, -32602);
    assert.equal((await call('resources/list')).error.code, -32601);
  } finally { child.stdin.end(); await rm(noisy, { recursive: true, force: true }); }
});
