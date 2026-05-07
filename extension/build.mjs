import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const srcDir = resolve(root, 'src');
const publicDir = resolve(root, 'public');
const outDir = resolve(root, 'dist');

const watch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  logLevel: 'info',
  loader: { '.css': 'text' },
};

async function copyPublic() {
  await cp(publicDir, outDir, { recursive: true });
}

async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await copyPublic();

  const entries = [
    { in: resolve(srcDir, 'background.ts'), out: 'background' },
    { in: resolve(srcDir, 'content.ts'), out: 'content' },
  ];

  if (watch) {
    const ctx = await context({
      ...sharedOptions,
      entryPoints: entries,
      outdir: outDir,
    });
    await ctx.watch();
    console.log('[ocal-ext] watching for changes...');
  } else {
    await build({
      ...sharedOptions,
      entryPoints: entries,
      outdir: outDir,
      minify: false,
    });
    console.log('[ocal-ext] built →', outDir);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
