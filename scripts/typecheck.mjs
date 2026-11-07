// Checagem de tipos. Sem @types/react instalado (ambiente sem npm), usa o shim em tools/sandbox-types.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const hasReactTypes = existsSync(resolve(root, 'node_modules/@types/react'));
const project = hasReactTypes ? 'tsconfig.json' : 'tsconfig.sandbox.json';
if (!hasReactTypes) console.log('ℹ @types/react ausente — usando tipos mínimos de tools/sandbox-types');
const local = resolve(root, 'node_modules/typescript/bin/tsc');
const cmd = existsSync(local) ? ['node', [local]] : ['tsc', []];
const r = spawnSync(cmd[0], [...cmd[1], '-p', project, '--noEmit'], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
