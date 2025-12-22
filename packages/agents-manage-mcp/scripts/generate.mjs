import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function checkSpeakeasyInstalled() {
  try {
    await runCommand('speakeasy', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const pidFile = path.resolve(__dirname, '../.speakeasy/manage-api.pid');

async function stopManageApiIfStarted() {
  if (!existsSync(pidFile)) {
    return;
  }

  const pidValue = readFileSync(pidFile, 'utf8').trim();
  const pid = Number(pidValue);

  rmSync(pidFile, { force: true });

  if (!Number.isFinite(pid)) {
    return;
  }

  // Kill process group (detached) and then direct pid as fallback
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {}

  try {
    process.kill(pid, 'SIGTERM');
  } catch {}

  console.log('🛑 Stopped agents-manage-api that was started for generation\n');
}

async function main() {
  console.log('🔄 Step 1: Ensuring agents-manage-api is running...\n');

  try {
    await runCommand('node', [path.resolve(__dirname, './fetch-openapi.mjs')]);
    console.log('\n✓ agents-manage-api is ready\n');
  } catch (error) {
    console.error('✗ Failed to start or detect agents-manage-api:', error.message);
    process.exit(1);
  }

  console.log('🔄 Step 2: Checking for Speakeasy CLI...\n');

  const hasSpeakeasy = await checkSpeakeasyInstalled();

  if (!hasSpeakeasy) {
    console.error('✗ Speakeasy CLI not found!\n');
    console.error('Please install it using one of these methods:\n');
    console.error('  • Homebrew:  brew install speakeasy-api/homebrew-tap/speakeasy');
    console.error('  • npm:       npm install -g @speakeasy-api/cli');
    console.error(
      '  • curl:      curl -fsSL https://raw.githubusercontent.com/speakeasy-api/speakeasy/main/install.sh | sh\n'
    );
    console.error('For more info: https://www.speakeasy.com/docs/sdk-design/cli-reference\n');
    process.exit(1);
  }

  console.log('✓ Speakeasy CLI found\n');
  console.log('🔄 Step 3: Running Speakeasy to generate TypeScript code...\n');

  try {
    await runCommand('speakeasy', ['run']);
    console.log('\n✓ Successfully generated MCP server code\n');
  } catch (error) {
    console.error('\n✗ Speakeasy generation failed:', error.message);
    await stopManageApiIfStarted();
    process.exit(1);
  }
  await stopManageApiIfStarted();
  console.log('✅ Generation complete!');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  stopManageApiIfStarted().catch(() => {});
  process.exit(1);
});
