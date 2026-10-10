// Makes the bundled fonts (assets/fonts) visible to librsvg without installing them system-wide.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ROOT } from './config.mjs';

let env;

/** Environment for rsvg-convert: a fontconfig file that adds assets/fonts to the system fonts. */
export function fontEnv() {
  if (env) return env;
  const dir = path.join(ROOT, '.cache/fontconfig');
  const file = path.join(dir, 'fonts.conf');
  const system = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf'].filter(existsSync);
  const dirs = [path.join(ROOT, 'assets/fonts'), '/System/Library/Fonts', '/Library/Fonts', path.join(homedir(), 'Library/Fonts'), '/usr/share/fonts', '/usr/local/share/fonts', path.join(homedir(), '.fonts')];
  const conf = `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${system.slice(0, 1).map(f => `  <include ignore_missing="yes">${f}</include>`).join('\n')}\n${dirs.map(d => `  <dir>${d}</dir>`).join('\n')}\n  <cachedir>${path.join(dir, 'cache')}</cachedir>\n</fontconfig>\n`;
  if (!existsSync(file) || readFileSync(file, 'utf8') !== conf) { mkdirSync(dir, { recursive: true }); writeFileSync(file, conf); }
  // Pango's CoreText backend on macOS ignores fontconfig, so ask for the fontconfig backend.
  env = { ...process.env, FONTCONFIG_FILE: file, PANGOCAIRO_BACKEND: 'fc' };
  return env;
}
