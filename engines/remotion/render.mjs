// Renders frames of one Remotion scene to PNG files, for Hoca's renderer to put into the video.
//   node engines/remotion/render.mjs job.json
// job: { module, publicDir, ctx, frames: [local frame numbers], outDir, scale, concurrency }
// Prints FRAME_DONE once per finished frame. Output: <outDir>/<frame>.png, frame unpadded.
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderFrames, selectComposition } from '@remotion/renderer';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { ctx } = job;

// The entry registers the scene as the only composition, sized and timed from Hoca's timeline.
const work = path.join(job.outDir, '.entry');
await mkdir(work, { recursive: true });
const entry = path.join(work, 'index.tsx');
await writeFile(entry, `import React from 'react';
import { registerRoot, Composition } from 'remotion';
import Scene from ${JSON.stringify(job.module)};
const Root = () => <Composition id="scene" component={Scene as React.FC<any>} width={${ctx.width}} height={${ctx.height}} fps={${ctx.fps}} durationInFrames={${ctx.durationInFrames}} defaultProps={{}} />;
registerRoot(Root);
`);

try {
  const serveUrl = await bundle({
    entryPoint: entry,
    // Holds the user's images: staticFile('inputs/shot.png').
    publicDir: job.publicDir,
    outDir: path.join(work, 'bundle'),
    // Scene files live outside this folder, so tell webpack where remotion and react are, and what #hoca is.
    webpackOverride: config => ({
      ...config,
      resolve: {
        ...config.resolve,
        modules: [path.join(HERE, 'node_modules'), ...(config.resolve?.modules || ['node_modules'])],
        alias: { ...(config.resolve?.alias || {}), '#hoca': path.join(HERE, 'hoca.tsx') }
      }
    })
  });
  const inputProps = { ctx };
  const composition = await selectComposition({ serveUrl, id: 'scene', inputProps, logLevel: 'error' });
  await renderFrames({
    serveUrl, composition, inputProps,
    outputDir: job.outDir,
    imageFormat: 'png',
    frames: job.frames,
    scale: job.scale || 1,
    concurrency: job.concurrency || null,
    imageSequencePattern: 'frame-[frame].[ext]',
    logLevel: 'error',
    onStart: () => {},
    onFrameUpdate: () => process.stdout.write('FRAME_DONE\n')
  });
  // Unpadded names, so Hoca can find frame N without knowing Remotion's padding.
  for (const name of await readdir(job.outDir)) {
    const match = name.match(/^frame-0*(\d+)\.png$/);
    if (match) await rename(path.join(job.outDir, name), path.join(job.outDir, `${Number(match[1])}.png`));
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
