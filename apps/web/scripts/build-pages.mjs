import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, '..');
const outDir = resolve(webRoot, 'out');
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const env = {
  ...process.env,
  NEXT_OUTPUT_EXPORT: 'true',
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE ?? 'true',
  NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? '/Civora',
};

const result = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: webRoot,
  env,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (existsSync(outDir)) {
  writeFileSync(resolve(outDir, '.nojekyll'), '');
  console.log(`Static GitHub Pages export generated at ${outDir} (with .nojekyll)`);
}
