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

const apiUrl = process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002';
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

async function startManageApi() {
  console.log('🔄 Starting agents-manage-api...\n');

  const projectRoot = findUpSync('pnpm-workspace.yaml', { cwd: __dirname, type: 'file' });
  if (!projectRoot) {
    throw new Error('Could not find project root (pnpm-workspace.yaml not found)');
  }

  const rootDir = path.dirname(projectRoot);

  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['--filter', '@inkeep/agents-manage-api', 'dev'], {
      cwd: rootDir,
      stdio: 'inherit',
      detached: false,
      shell: true,
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start manage-api: ${err.message}`));
    });

    // Give it time to start and poll for readiness
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    const checkInterval = setInterval(async () => {
      attempts++;

      if (await checkApiRunning()) {
        clearInterval(checkInterval);
        console.log('✓ agents-manage-api is ready\n');
        resolve(proc);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        proc.kill();
        reject(new Error('Timeout waiting for manage-api to start'));
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

    // Write the JSON file with proper formatting
    fs.writeFileSync(outputPath, JSON.stringify(openapiJson, null, 2) + '\n', 'utf8');

    console.log('✓ Successfully fetched and wrote OpenAPI spec');
  } catch (error) {
    throw error;
  }
}

async function main() {
  try {
    // Check if manage-api is already running
    const isRunning = await checkApiRunning();

    if (!isRunning) {
      console.log('⚠️  agents-manage-api is not running');
      console.log('💡 To avoid auto-starting, run: pnpm --filter @inkeep/agents-manage-api dev\n');

      const manageApiProc = await startManageApi();

      try {
        await fetchOpenApiSpec();
      } finally {
        // Clean up: stop the manage-api we started
        console.log('\n🛑 Stopping agents-manage-api...');
        manageApiProc.kill('SIGTERM');

        // Give it a moment to shut down gracefully
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
