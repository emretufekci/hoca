// Sentence splitting, subtitle cue timing, SRT output and the burned-in SVG overlay.

const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Split narration into sentences; each one becomes a "beat" with its own audio clip and timing. */
export function sentences(text, lang = 'en') {
  const parts = [...new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(text.replace(/\s+/g, ' ').trim())].map(part => part.segment.trim()).filter(Boolean);
  // Merge fragments too short to stand alone ("Dr.", "No.") into their neighbour.
  const merged = [];
  for (const part of parts) {
    if (merged.length && (merged.at(-1).length < 12 || part.length < 4)) merged[merged.length - 1] += ` ${part}`;
    else merged.push(part);
  }
  return merged;
}

/** Greedy word wrap by character count. */
export function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Break text into on-screen chunks of at most two lines, balanced so no chunk is a stray word. */
export function chunks(text, maxChars) {
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.join(' ').length;
  const count = Math.max(1, Math.ceil(total / (maxChars * 1.85)));
  const target = total / count;
  const groups = [];
  let group = '';
  for (const word of words) {
    const next = group ? `${group} ${word}` : word;
    if (group && groups.length < count - 1 && (next.length > target + word.length / 2 || wrap(next, maxChars).length > 2)) { groups.push(group); group = word; }
    else group = next;
  }
  if (group) groups.push(group);
  return groups.flatMap(part => {
    if (part.length <= maxChars) return [[part]];
    // Two lines of similar length read better than a full line and a leftover.
    const even = wrap(part, Math.min(maxChars, Math.ceil(part.length / 2) + 4));
    const lines = even.length <= 2 ? even : wrap(part, maxChars);
    const result = [];
    for (let i = 0; i < lines.length; i += 2) result.push(lines.slice(i, i + 2));
    return result;
  });
}

/**
 * Timed cues for a span of speech. Each chunk gets a share of [start, end] proportional to its length,
 * which tracks the voice closely because the span is a single sentence when the languages match.
 */
export function cuesFor(text, start, end, maxChars) {
  const parts = chunks(text, maxChars);
  const total = parts.reduce((sum, lines) => sum + lines.join(' ').length, 0) || 1;
  let cursor = start;
  return parts.map(lines => {
    const length = (end - start) * lines.join(' ').length / total;
    const cue = { start: cursor, end: cursor + length, lines };
    cursor += length;
    return cue;
  });
}

const stamp = seconds => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const p = (n, width = 2) => String(n).padStart(width, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export const toSrt = cues => cues.map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.lines.join('\n')}\n`).join('\n');

/**
 * Draw a cue into a finished scene SVG. Geometry is computed in output pixels and scaled into the
 * scene's own coordinate system, so scenes authored at another size still get correctly sized text.
 */
export function burnIn(svg, cue, { width, height, safe, size, band }) {
  if (!cue) return svg;
  const close = svg.lastIndexOf('</svg>');
  if (close < 0) return svg;
  const head = svg.slice(0, svg.indexOf('>') + 1);
  const box = head.match(/viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/);
  const [vx, vy, vw, vh] = box ? box.slice(1).map(Number) : [0, 0, Number(head.match(/\swidth\s*=\s*["']([\d.]+)/)?.[1]) || width, Number(head.match(/\sheight\s*=\s*["']([\d.]+)/)?.[1]) || height];
  const scale = Math.min(vw / width, vh / height);
  const font = size * height * scale, lineHeight = font * 1.28;
  const centerX = vx + vw / 2;
  const bandBottom = vy + vh - safe.bottom * height * scale;
  const centerY = bandBottom - band * height * scale / 2;
  const top = centerY - cue.lines.length * lineHeight / 2;
  const widest = Math.max(...cue.lines.map(line => line.length));
  const plateWidth = Math.min(vw * 0.96, widest * font * 0.56 + font * 1.4), plateHeight = cue.lines.length * lineHeight + font * 0.5;
  const text = cue.lines.map((line, i) => `<text x="${centerX}" y="${(top + lineHeight * (i + 0.76)).toFixed(1)}" text-anchor="middle">${escapeXml(line)}</text>`).join('');
  const overlay = `<g font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="${font.toFixed(1)}" font-weight="600">`
    + `<rect x="${(centerX - plateWidth / 2).toFixed(1)}" y="${(top - font * 0.25).toFixed(1)}" width="${plateWidth.toFixed(1)}" height="${plateHeight.toFixed(1)}" rx="${(font * 0.35).toFixed(1)}" fill="#000" opacity="0.62"/>`
    + `<g fill="#fff" stroke="#000" stroke-width="${(font * 0.09).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${text}</g></g>`;
  return svg.slice(0, close) + overlay + svg.slice(close);
}
