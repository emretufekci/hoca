// Images the user hands over (screenshots, diagrams, photos) live in <project>/inputs/. Scenes place
// them with the kit's image(); the renderer links the folder next to every frame it rasterizes,
// because librsvg only loads images from the SVG's own folder or below it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, link, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './proc.mjs';

export const INPUT_DIR = 'inputs';
const KEEP = new Set(['.png', '.jpg', '.jpeg']);
const CONVERT = new Set(['.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.avif']);
// Larger images only slow every frame down; this is already more than a 4K frame needs.
const MAX_SIDE = 3840;

/** Pixel size of a PNG or JPEG, read from its header. */
export function imageSize(file) {
  const data = readFileSync(file);
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) { at++; continue; }
      const marker = data[at + 1];
      // Start-of-frame markers hold the size; DHT (C4), JPG (C8) and DAC (CC) share the range but do not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5) };
      at += 2 + data.readUInt16BE(at + 2);
    }
  }
  throw new Error(`${path.basename(file)} is not a readable PNG or JPEG`);
}

/** A file name a scene can refer to: lower case, no spaces, unique within the folder. */
function inputName(file, taken) {
  const ext = path.extname(file).toLowerCase();
  const stem = path.basename(file, path.extname(file)).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'image';
  const out = KEEP.has(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.png';
  let name = `${stem}${out}`;
  for (let i = 2; taken.has(name); i++) name = `${stem}-${i}${out}`;
  taken.add(name);
  return name;
}

/** Copy the given images into <dir>/inputs/, converting other formats to PNG and shrinking huge ones. */
export async function importInputs(files, dir) {
  if (!files?.length) return [];
  const target = path.join(dir, INPUT_DIR);
  await mkdir(target, { recursive: true });
  const taken = new Set(readdirSync(target));
  const added = [];
  for (const given of files) {
    const source = path.resolve(given);
    if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`Input not found: ${given}`);
    // Giving the same file again (a --force rerun) reuses the copy instead of adding a second one.
    const bytes = readFileSync(source);
    const same = [...taken].find(name => { const file = path.join(target, name); return statSync(file).size === bytes.length && readFileSync(file).equals(bytes); });
    if (same) { added.push({ name: same, source, ...imageSize(path.join(target, same)) }); continue; }
    const ext = path.extname(source).toLowerCase();
    if (!KEEP.has(ext) && !CONVERT.has(ext)) throw new Error(`${given}: use an image (PNG, JPEG, WebP, GIF, HEIC, BMP, TIFF, AVIF)`);
    const name = inputName(source, taken), out = path.join(target, name);
    const shrink = `scale='min(${MAX_SIDE},iw)':'min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease`;
    let size = KEEP.has(ext) ? (() => { try { return imageSize(source); } catch { return null; } })() : null;
    if (size && Math.max(size.width, size.height) <= MAX_SIDE) await copyFile(source, out);
    else {
      try { await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-frames:v', '1', '-vf', shrink, ...(name.endsWith('.jpg') ? ['-q:v', '2'] : []), out]); }
      catch (error) {
        // FFmpeg builds often lack HEIC; macOS can convert it itself.
        if (process.platform !== 'darwin') throw new Error(`Could not convert ${given}: ${error.message.slice(0, 200)}`);
        await run('sips', ['-s', 'format', 'png', '-Z', String(MAX_SIDE), source, '--out', out]);
      }
    }
    size = imageSize(out);
    added.push({ name, source, ...size });
  }
  return added;
}

/** The images in a project, by file name: { 'shot.png': { href, width, height } }. */
export function readInputs(dir) {
  const folder = path.join(dir, INPUT_DIR);
  const inputs = {};
  if (!existsSync(folder)) return inputs;
  for (const name of readdirSync(folder).sort()) {
    if (!KEEP.has(path.extname(name).toLowerCase())) continue;
    try { inputs[name] = { href: `${INPUT_DIR}/${name}`, ...imageSize(path.join(folder, name)) }; } catch {}
  }
  return inputs;
}

/** Make the project's images visible to SVG frames written in `workDir`. */
export async function stageInputs(dir, workDir, inputs) {
  const names = Object.keys(inputs || {});
  if (!names.length) return;
  const target = path.join(workDir, INPUT_DIR);
  await mkdir(target, { recursive: true });
  for (const name of names) {
    const from = path.join(dir, INPUT_DIR, name), to = path.join(target, name);
    await rm(to, { force: true });
    await link(from, to).catch(() => copyFile(from, to));
  }
}
