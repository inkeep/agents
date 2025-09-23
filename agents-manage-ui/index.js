import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const NEXT_BIN = join(__dirname, 'node_modules', '.bin', 'next');

function run(cmd, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(NEXT_BIN, cmd, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: process.platform === 'win32', // help on Windows
    });
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`next ${cmd.join(' ')} failed (${code})`))
    );
  });
}

export async function buildNext({ dir, env }) {
  await run(['build'], dir, env);
}

export async function devNext({ dir, port, host, env }) {
  const args = ['dev', ...(port ? ['-p', String(port)] : []), ...(host ? ['-H', host] : [])];
  await run(args, dir, env);
}

export async function startNext({ dir, port, host, env }) {
  const args = ['start', ...(port ? ['-p', String(port)] : []), ...(host ? ['-H', host] : [])];
  await run(args, dir, env);
}
