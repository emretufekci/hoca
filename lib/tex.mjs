// LaTeX math typeset to SVG outlines with MathJax (Computer Modern shapes, no TeX install needed).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let convert;
const cache = new Map();

function load() {
  // Loaded on first use: scenes without formulas should not pay for it.
  const { mathjax } = require('mathjax-full/js/mathjax.js');
  const { TeX } = require('mathjax-full/js/input/tex.js');
  const { SVG } = require('mathjax-full/js/output/svg.js');
  const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
  const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const document = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) });
  convert = latex => adaptor.innerHTML(document.convert(latex, { display: true }));
}

/** Rough outline length of a glyph path (MathJax uses absolute M L H V Q T C Z). */
export function pathLength(d) {
  const tokens = d.match(/[MLHVQTCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  let x = 0, y = 0, sx = 0, sy = 0, length = 0, i = 0, command = 'M';
  const num = () => Number(tokens[i++]);
  const to = (nx, ny) => { length += Math.hypot(nx - x, ny - y); x = nx; y = ny; };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    switch (command) {
      case 'M': x = sx = num(); y = sy = num(); command = 'L'; break;
      case 'L': case 'T': to(num(), num()); break;
      case 'H': to(num(), y); break;
      case 'V': to(x, num()); break;
      case 'Q': { const cx = num(), cy = num(), nx = num(), ny = num(); const chord = Math.hypot(nx - x, ny - y), hull = Math.hypot(cx - x, cy - y) + Math.hypot(nx - cx, ny - cy); length += (chord + hull) / 2; x = nx; y = ny; break; }
      case 'C': { const ax = num(), ay = num(), bx = num(), by = num(), nx = num(), ny = num(); const chord = Math.hypot(nx - x, ny - y), hull = Math.hypot(ax - x, ay - y) + Math.hypot(bx - ax, by - ay) + Math.hypot(nx - bx, ny - by); length += (chord + hull) / 2; x = nx; y = ny; break; }
      case 'Z': to(sx, sy); break;
      default: i++;
    }
  }
  return length;
}

/** Typeset once and cache: { body, minX, minY, width, height } in MathJax units (1000 per em). */
export function typeset(latex) {
  const key = String(latex);
  if (cache.has(key)) return cache.get(key);
  if (!convert) load();
  const svg = convert(key);
  const error = svg.match(/data-mjx-error="([^"]*)"/);
  if (error) throw new Error(`TeX error in "${key}": ${error[1].replace(/&quot;/g, '"')}`);
  const box = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
  if (!box) throw new Error(`Could not typeset "${key}"`);
  // Glyph outlines and rules (fraction bars) are the pieces a Write animation draws one by one.
  const parts = [];
  const body = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>')).replace(/<(path|rect)\b([^>]*?)\/?>(<\/\1>)?/g, (_, tag, attrs) => {
    const d = attrs.match(/\bd="([^"]*)"/)?.[1];
    parts.push({ length: tag === 'path' && d ? pathLength(d) : 0 });
    return `<${tag}${attrs.replace(/\sdata-[\w-]+="[^"]*"/g, '')}\u0000${parts.length - 1}\u0000/>`;
  }).replace(/\sdata-[\w-]+="[^"]*"/g, '');
  const result = { body, parts, minX: Number(box[1]), minY: Number(box[2]), width: Number(box[3]), height: Number(box[4]) };
  cache.set(key, result);
  return result;
}
