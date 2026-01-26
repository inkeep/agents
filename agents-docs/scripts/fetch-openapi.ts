import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const OPENAPI_URL = 'http://localhost:3002/openapi.json';
const MAX_RETRIES = 60;
const RETRY_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 5000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const outputPath = path.resolve(__dirname, '..', '.source', 'openapi.json');

function startServer() {
  return spawn('pnpm', ['--filter', '@inkeep/agents-api', 'dev'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
}

async function fetchOpenApi(): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(OPENAPI_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        return await response.text();
      }
      await delay(RETRY_DELAY_MS);
    } catch {
      await delay(RETRY_DELAY_MS);
    }
  }
  throw new Error('Failed to fetch openapi.json from agents-api');
}

async function stopServer(server: ReturnType<typeof startServer>): Promise<void> {
  if (server.exitCode !== null) {
    return;
  }
  server.kill('SIGTERM');
  const exit = once(server, 'exit');
  const timed = delay(SHUTDOWN_TIMEOUT_MS).then(() => 'timeout' as const);
  const result = await Promise.race([exit, timed]);
  if (result === 'timeout') {
    server.kill('SIGKILL');
    await exit;
  }
}

async function main(): Promise<void> {
  const server = startServer();
  const exitEarly = once(server, 'exit').then(() => {
    throw new Error('agents-api dev exited before openapi.json was fetched');
  });
  try {
    const openapiText = (await Promise.race([fetchOpenApi(), exitEarly])) as string;
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, openapiText);
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
