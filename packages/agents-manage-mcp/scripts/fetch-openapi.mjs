import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { findUpSync } from 'find-up';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
const rootEnv = findUpSync('.env', { cwd: path.resolve(__dirname, '../..') });
if (rootEnv) {
  dotenv.config({ path: rootEnv, quiet: true });
}

// Also check for package-level .env (can override root)
const packageEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(packageEnv)) {
  dotenv.config({ path: packageEnv, override: true, quiet: true });
}

const apiUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
const openapiUrl = `${apiUrl}/openapi.json`;
const pidFile = path.resolve(__dirname, '../.speakeasy/agents-api.pid');

async function checkApiRunning() {
  try {
    const response = await fetch(openapiUrl, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function startAgentsApi() {
  console.log('🔄 Starting agents-api...\n');

  const projectRoot = findUpSync('pnpm-workspace.yaml', { cwd: __dirname, type: 'file' });
  if (!projectRoot) {
    throw new Error('Could not find project root (pnpm-workspace.yaml not found)');
  }

  const rootDir = path.dirname(projectRoot);

  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['--filter', '@inkeep/agents-api', 'dev'], {
      cwd: rootDir,
      stdio: 'ignore',
      detached: true,
      shell: true,
    });

    proc.unref();

    proc.on('error', (err) => {
      reject(new Error(`Failed to start agents-api: ${err.message}`));
    });

    // Give it time to start and poll for readiness
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    const checkInterval = setInterval(async () => {
      attempts++;

      if (await checkApiRunning()) {
        clearInterval(checkInterval);
        console.log('✓ agents-api is ready\n');
        resolve(proc);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          // best-effort cleanup
        }
        reject(new Error('Timeout waiting for agents-api to start'));
      }
    }, 1000);
  });
}

async function main() {
  try {
    // Check if agents-api is already running
    const isRunning = await checkApiRunning();

    // Clear any stale pid file
    if (fs.existsSync(pidFile)) {
      fs.rmSync(pidFile);
    }

    if (!isRunning) {
      console.log('⚠️  agents-api is not running');
      console.log('💡 To avoid auto-starting, run: pnpm --filter @inkeep/agents-api dev\n');

      const agentsApiProc = await startAgentsApi();

      // Record the process id so callers can shut it down after generation
      fs.mkdirSync(path.dirname(pidFile), { recursive: true });
      fs.writeFileSync(pidFile, String(agentsApiProc.pid), 'utf8');

      console.log(`PID recorded at ${pidFile}`);
      console.log('Agents API will remain running until the caller stops it.\n');
    } else {
      console.log('✓ agents-api already running. No action needed.\n');
    }
  } catch (error) {
    if (error.cause) {
      console.error('\n✗ Error ensuring agents-api is running:', error.message);
      console.error('  Cause:', error.cause.message || error.cause);
      console.error(`\n  Make sure ${apiUrl} is running and accessible.`);
    } else {
      console.error('\n✗ Error:', error.message);
    }
    process.exit(1);
  }
}

main();
