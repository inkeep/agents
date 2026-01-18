#!/usr/bin/env node
/**
 * Ensures keytar native module is built for local development.
 * This is needed because pnpm doesn't always trigger native module builds.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

try {
  // Try to load keytar - if it works, native module is already built
  require('keytar');
  console.log('✓ keytar native module is available');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND' && !error.message.includes('.node')) {
    // keytar package itself is not installed
    console.log('⚠ keytar package not found, skipping native build');
    process.exit(0);
  }

  // Native module needs to be built
  console.log('⚙ Building keytar native module...');

  try {
    // Find keytar's location
    const keytarPath = dirname(require.resolve('keytar/package.json'));
    console.log(`  Found keytar at: ${keytarPath}`);

    // Run node-gyp rebuild
    execSync('npm run build', {
      cwd: keytarPath,
      stdio: 'inherit',
    });

    console.log('✓ keytar native module built successfully');
  } catch (buildError) {
    console.error('✗ Failed to build keytar native module:', buildError.message);
    console.error('  You may need to install build tools:');
    console.error('  - macOS: xcode-select --install');
    console.error('  - Linux: sudo apt-get install build-essential');
    console.error('  - Windows: npm install -g windows-build-tools');
    process.exit(1);
  }
}
