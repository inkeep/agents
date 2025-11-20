import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const watchPaths = [
  path.resolve(__dirname, '../../agents-eval-api/src'),
  path.resolve(__dirname, '../../agents-core/src'),
];

const fetchScript = path.resolve(__dirname, './fetch-openapi.mjs');

let debounceTimer = null;
const DEBOUNCE_MS = 1000;

function runFetchScript() {
  console.log('\n🔄 Running fetch-openapi script...');
  
  const child = spawn('node', [fetchScript], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (error) => {
    console.error('❌ Error running fetch-openapi:', error.message);
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log('✅ OpenAPI spec updated successfully\n');
    } else {
      console.error(`❌ fetch-openapi exited with code ${code}\n`);
    }
  });
}

function handleChange(eventType, filename, watchPath) {
  if (!filename?.endsWith('.ts')) {
    return;
  }

  const relativePath = path.relative(process.cwd(), path.join(watchPath, filename));
  console.log(`📝 Detected change: ${relativePath}`);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runFetchScript, DEBOUNCE_MS);
}

console.log('👀 Watching for TypeScript changes in:');
watchPaths.forEach((watchPath) => {
  console.log(`   - ${path.relative(process.cwd(), watchPath)}`);
});
console.log('\n✨ Waiting for changes...\n');

watchPaths.forEach((watchPath) => {
  if (!fs.existsSync(watchPath)) {
    console.warn(`⚠️  Warning: Watch path does not exist: ${watchPath}`);
    return;
  }

  fs.watch(
    watchPath,
    { recursive: true },
    (eventType, filename) => handleChange(eventType, filename, watchPath)
  );
});

process.on('SIGINT', () => {
  console.log('\n👋 Stopping watch script...');
  process.exit(0);
});

