// Dev-server wrapper for the preview harness.
// Vite 8 moved `root` from a --flag to a positional arg; the harness injects
// `--root <dir>`, which the Vite 8 CLI rejects. Strip both tokens, then exec
// the CLI with the project root as the positional root and cwd.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(projectRoot, 'node_modules', 'vite', 'dist', 'node', 'cli.js');

const args = [];
let skipNext = false;
for (const a of process.argv.slice(2)) {
  if (skipNext) { skipNext = false; continue; }
  if (a === '--root' || a.startsWith('--root=')) { skipNext = a === '--root'; continue; }
  args.push(a);
}

const child = spawn(process.execPath, [cli, projectRoot, ...args], { cwd: projectRoot, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 1));