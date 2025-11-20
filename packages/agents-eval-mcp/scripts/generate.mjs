import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRESERVED_FIELDS = {
  main: './esm/index.js',
  types: './esm/index.d.ts',
  exports: {
    '.': {
      types: './esm/index.d.ts',
      import: './esm/index.js',
    },
  },
  scripts: {
    format: 'biome format --write src',
    'format:check': 'biome format src',
    'fetch-openapi': 'node scripts/fetch-openapi.mjs',
    generate: 'node scripts/generate.mjs',
    watch: 'node scripts/watch-and-fetch.mjs',
  },
  devDependencies: {
    dotenv: '^16.4.7',
    'find-up': '^7.0.0',
  },
};

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

function restorePackageJsonFields() {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  packageJson.main = PRESERVED_FIELDS.main;
  packageJson.types = PRESERVED_FIELDS.types;
  packageJson.exports = PRESERVED_FIELDS.exports;

  packageJson.scripts = {
    ...packageJson.scripts,
    ...PRESERVED_FIELDS.scripts,
  };

  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    ...PRESERVED_FIELDS.devDependencies,
  };

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log('✓ Restored custom fields to package.json\n');
}

async function main() {
  console.log('🔄 Step 1: Fetching OpenAPI spec...\n');

  try {
    await runCommand('node', [path.resolve(__dirname, './fetch-openapi.mjs')]);
    console.log('\n✓ OpenAPI spec fetched successfully\n');
  } catch (error) {
    console.error('✗ Failed to fetch OpenAPI spec:', error.message);
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
    process.exit(1);
  }

  console.log('🔄 Step 4: Restoring custom fields to package.json...\n');
  restorePackageJsonFields();

  console.log('🔄 Step 5: Running Biome to format code...\n');

  try {
    const packageDir = path.resolve(__dirname, '..');
    const rootDir = path.resolve(packageDir, '../..');
    const relativeSrcPath = path.relative(rootDir, path.join(packageDir, 'src'));
    await runCommand('pnpm', ['biome', 'format', '--write', relativeSrcPath], { cwd: rootDir });
    console.log('✓ Biome formatting applied successfully\n');
  } catch {
    console.log('⚠️  Biome formatting had issues (some manual fixes may be needed)');
    console.log('  To format manually: pnpm biome format --write packages/agents-eval-mcp/src\n');
  }

  console.log('✅ Generation complete!');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
