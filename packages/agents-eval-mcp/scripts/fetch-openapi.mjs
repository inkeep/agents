import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { findUpSync } from 'find-up';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootEnv = findUpSync('.env', { cwd: path.resolve(__dirname, '../..') });
if (rootEnv) {
  dotenv.config({ path: rootEnv, quiet: true });
}

const packageEnv = path.resolve(__dirname, '../.env');
if (fs.existsSync(packageEnv)) {
  dotenv.config({ path: packageEnv, override: true, quiet: true });
}

const apiUrl = process.env.INKEEP_AGENTS_EVAL_API_API_URL || 'http://localhost:3005';
const openapiUrl = `${apiUrl}/openapi.json`;
const outputPath = path.resolve(__dirname, '../openapi.json');

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

async function startApiServer() {
  console.log('🔄 Starting agents-eval-api...\n');

  const projectRoot = findUpSync('pnpm-workspace.yaml', { cwd: __dirname, type: 'file' });
  if (!projectRoot) {
    throw new Error('Could not find project root (pnpm-workspace.yaml not found)');
  }

  const rootDir = path.dirname(projectRoot);

  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['--filter', '@inkeep/agents-eval-api', 'dev'], {
      cwd: rootDir,
      stdio: 'inherit',
      detached: false,
      shell: true,
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start eval-api: ${err.message}`));
    });

    let attempts = 0;
    const maxAttempts = 30;

    const checkInterval = setInterval(async () => {
      attempts++;

      if (await checkApiRunning()) {
        clearInterval(checkInterval);
        console.log('✓ agents-eval-api is ready\n');
        resolve(proc);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        proc.kill();
        reject(new Error('Timeout waiting for eval-api to start'));
      }
    }, 1000);
  });
}

async function fetchOpenApiSpec() {
  console.log(`Fetching OpenAPI spec from: ${openapiUrl}`);
  console.log(`Writing to: ${outputPath}\n`);

  try {
    const response = await fetch(openapiUrl);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ''}`
      );
    }

    const openapiJson = await response.json();

    fs.writeFileSync(outputPath, JSON.stringify(openapiJson, null, 2) + '\n', 'utf8');

    console.log('✓ Successfully fetched and wrote OpenAPI spec');
  } catch (error) {
    throw error;
  }
}

async function main() {
  try {
    const isRunning = await checkApiRunning();

    if (!isRunning) {
      console.log('⚠️  agents-eval-api is not running');
      console.log('💡 To avoid auto-starting, run: pnpm --filter @inkeep/agents-eval-api dev\n');

      const apiProc = await startApiServer();

      try {
        await fetchOpenApiSpec();
      } finally {
        console.log('\n🛑 Stopping agents-eval-api...');
        apiProc.kill('SIGTERM');

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      await fetchOpenApiSpec();
    }
  } catch (error) {
    if (error.cause) {
      console.error('\n✗ Error fetching OpenAPI spec:', error.message);
      console.error('  Cause:', error.cause.message || error.cause);
      console.error(`\n  Make sure ${apiUrl} is running and accessible.`);
    } else {
      console.error('\n✗ Error:', error.message);
    }
    process.exit(1);
  }
}

main();

