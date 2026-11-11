// Opções do esbuild compartilhadas entre dev e build.
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

export const buildOptions = {
  entryPoints: { app: join(root, 'src/main.tsx') },
  bundle: true,
  format: 'esm',
  target: ['es2022', 'chrome111', 'safari16.4', 'firefox115'],
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.woff': 'file', '.woff2': 'file' },
  legalComments: 'none',
  logLevel: 'info',
};
