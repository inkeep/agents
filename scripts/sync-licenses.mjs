#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Source LICENSE file (the authoritative version)
const sourceLicensePath = join(rootDir, 'LICENSE.md');

// Target packages that need LICENSE files for npm publishing
const targetPackages = [
  './agents-cli',
  './agents-ui',
  './packages/agents-sdk',
  './packages/agents-core',
];

// Header to add to generated LICENSE files
const generatedHeader = `<!--
AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
Source: ./LICENSE.md
This file is automatically copied from the root LICENSE.md during build.
Any changes should be made to the root LICENSE.md file.
-->

`;

function syncLicenses() {
  console.log('📄 Syncing LICENSE.md files...\n');

  // Check if source LICENSE exists
  if (!existsSync(sourceLicensePath)) {
    console.error('❌ Source LICENSE.md not found at:', sourceLicensePath);
    process.exit(1);
  }

  // Read source LICENSE content
  const licenseContent = readFileSync(sourceLicensePath, 'utf8');

  let successCount = 0;
  let errorCount = 0;

  // Copy to each target package
  targetPackages.forEach((packagePath) => {
    const targetPath = join(rootDir, packagePath, 'LICENSE.md');
    const _packageName = packagePath.split('/').pop();

    try {
      // Write LICENSE with header indicating it's auto-generated
      writeFileSync(targetPath, generatedHeader + licenseContent);
      console.log(`✅ Copied LICENSE.md to ${packagePath}/`);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to copy LICENSE.md to ${packagePath}/: ${error.message}`);
      errorCount++;
    }
  });

  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount} packages`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} packages`);
    process.exit(1);
  }

  console.log('\n✨ License sync completed successfully!');
}

// Run the sync
syncLicenses();
