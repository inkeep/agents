#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Source files (the authoritative versions)
const sourceLicensePath = join(rootDir, 'LICENSE.md');
const sourceSupplementalPath = join(rootDir, 'SUPPLEMENTAL_TERMS.md');

// Target packages that need LICENSE files for npm publishing
const targetPackages = [
  './agents-cli',
  './agents-manage-api',
  './agents-run-api',
  './agents-ui',
  './packages/agents-core',
  './packages/agents-sdk',
  './packages/create-agents',
];

// Header to add to generated LICENSE files
const generatedLicenseHeader = `<!--
AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
Source: ./LICENSE.md
This file is automatically copied from the root LICENSE.md during build.
Any changes should be made to the root LICENSE.md file.
-->

`;

// Header to add to generated SUPPLEMENTAL_TERMS files
const generatedSupplementalHeader = `<!--
AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
Source: ./SUPPLEMENTAL_TERMS.md
This file is automatically copied from the root SUPPLEMENTAL_TERMS.md during build.
Any changes should be made to the root SUPPLEMENTAL_TERMS.md file.
-->

`;

function syncLicenses() {
  console.log('📄 Syncing LICENSE.md and SUPPLEMENTAL_TERMS.md files...\n');

  // Check if source files exist
  if (!existsSync(sourceLicensePath)) {
    console.error('❌ Source LICENSE.md not found at:', sourceLicensePath);
    process.exit(1);
  }

  if (!existsSync(sourceSupplementalPath)) {
    console.error('❌ Source SUPPLEMENTAL_TERMS.md not found at:', sourceSupplementalPath);
    process.exit(1);
  }

  // Read source content
  const licenseContent = readFileSync(sourceLicensePath, 'utf8');
  const supplementalContent = readFileSync(sourceSupplementalPath, 'utf8');

  let successCount = 0;
  let errorCount = 0;

  // Copy to each target package
  targetPackages.forEach((packagePath) => {
    const licensePath = join(rootDir, packagePath, 'LICENSE.md');
    const supplementalPath = join(rootDir, packagePath, 'SUPPLEMENTAL_TERMS.md');
    const packageName = packagePath.split('/').pop();

    try {
      // Write LICENSE.md with header indicating it's auto-generated
      writeFileSync(licensePath, generatedLicenseHeader + licenseContent);
      console.log(`✅ Copied LICENSE.md to ${packagePath}/`);

      // Write SUPPLEMENTAL_TERMS.md with header indicating it's auto-generated
      writeFileSync(supplementalPath, generatedSupplementalHeader + supplementalContent);
      console.log(`✅ Copied SUPPLEMENTAL_TERMS.md to ${packagePath}/`);

      successCount++;
    } catch (error) {
      console.error(`❌ Failed to copy license files to ${packagePath}/: ${error.message}`);
      errorCount++;
    }
  });

  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount} packages (${successCount * 2} files)`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed: ${errorCount} packages`);
    process.exit(1);
  }

  console.log('\n✨ License sync completed successfully!');
}

// Run the sync
syncLicenses();
