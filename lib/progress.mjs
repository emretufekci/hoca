// Terminal feedback: a progress bar with percentage and ETA on a TTY, plain milestone lines otherwise.

const clock = seconds => { const s = Math.max(0, Math.round(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createUi(log = console.log, stream = process.stderr) {
  const tty = Boolean(stream.isTTY);
  return {
    log, tty,
    /** A bar for a step with a known amount of work. Call tick() or set(done), then done(). */
    bar(label, total, unit = '') {
      const started = Date.now();
      let done = 0, milestone = 0, drawn = 0;
      const draw = () => {
        const fraction = total ? Math.min(1, done / total) : 0, elapsed = (Date.now() - started) / 1000;
        const eta = done > 0 && fraction < 1 ? `ETA ${clock(elapsed / done * (total - done))}` : fraction >= 1 ? '' : 'ETA --:--';
        if (tty) {
          if (Date.now() - drawn < 80 && fraction < 1) return;
          drawn = Date.now();
          const width = 24, filled = Math.round(width * fraction);
          stream.write(`\r\x1b[2K${label.padEnd(10)} ${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${String(Math.round(fraction * 100)).padStart(3)}%  ${done}/${total}${unit ? ` ${unit}` : ''}  ${eta}`);
        } else if (Math.floor(fraction * 4) > milestone && fraction < 1) {
          milestone = Math.floor(fraction * 4);
          log(`${label} ${Math.round(fraction * 100)}%  ${eta}`);
        }
      };
      draw();
      return {
        tick(n = 1) { done = Math.min(total, done + n); draw(); },
        set(value) { done = Math.min(total, Math.max(done, value)); draw(); },
        done(summary = '') {
          if (tty) stream.write('\r\x1b[2K');
          log(`${label.padEnd(10)} done in ${clock((Date.now() - started) / 1000)}${summary ? `  ${summary}` : ''}`);
        }
      };
    },
    /** For work with no known total (a model writing): shows what has arrived and the time spent. */
    activity(label) {
      const started = Date.now();
      let last = 0;
      return {
        update(text) {
          if (!tty || Date.now() - last < 120) return;
          last = Date.now();
          stream.write(`\r\x1b[2K${label.padEnd(10)} ${text}  ${clock((Date.now() - started) / 1000)} elapsed`);
        },
        done(summary = '') {
          if (tty) stream.write('\r\x1b[2K');
          log(`${label.padEnd(10)} done in ${clock((Date.now() - started) / 1000)}${summary ? `  ${summary}` : ''}`);
        }
      };
    }
  };
}
