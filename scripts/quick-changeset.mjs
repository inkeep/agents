#!/usr/bin/env node

// Usage: node scripts/quick-changeset.mjs <patch|minor|major> --pkg <package> [--pkg <package>...] "<message>"
// Example: node scripts/quick-changeset.mjs patch --pkg agents-core "Fix race condition"
// Example: node scripts/quick-changeset.mjs minor --pkg agents-sdk --pkg agents-core "Add streaming support"

import fs from 'fs';
import path from 'path';
import { adjectives, animals, colors, uniqueNamesGenerator } from 'unique-names-generator';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Valid package short names mapped to full package names
const VALID_PACKAGES = {
  'agents-api': '@inkeep/agents-api',
  'agents-cli': '@inkeep/agents-cli',
  'agents-core': '@inkeep/agents-core',
  'agents-manage-ui': '@inkeep/agents-manage-ui',
  'agents-sdk': '@inkeep/agents-sdk',
  'create-agents': '@inkeep/create-agents',
  'ai-sdk-provider': '@inkeep/ai-sdk-provider',
  'agents-work-apps': '@inkeep/agents-work-apps',
};

function generateRandomFilename() {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 3,
    style: 'lowerCase',
  });
  return `${name}.md`;
}

function parseArgs(args) {
  const result = {
    bumpType: null,
    packages: [],
    message: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--pkg' || arg === '-p') {
      i++;
      if (i < args.length) {
        result.packages.push(args[i]);
      }
    } else if (['patch', 'minor', 'major'].includes(arg)) {
      result.bumpType = arg;
    } else if (!arg.startsWith('-')) {
      // Assume it's the message if it's not a flag and not a bump type
      if (result.bumpType && result.message === null) {
        result.message = arg;
      }
    }
    i++;
  }

  return result;
}

function validatePackages(packages) {
  const validNames = Object.keys(VALID_PACKAGES);
  const invalid = packages.filter((pkg) => !validNames.includes(pkg));

  if (invalid.length > 0) {
    console.error(`Error: Invalid package name(s): ${invalid.join(', ')}`);
    console.error(`Valid packages: ${validNames.join(', ')}`);
    process.exit(1);
  }

  return packages.map((pkg) => VALID_PACKAGES[pkg]);
}

function createChangesetFile(bumpType, fullPackageNames, message) {
  // Generate frontmatter
  const frontmatter = ['---'];
  fullPackageNames.forEach((pkg) => {
    frontmatter.push(`"${pkg}": ${bumpType}`);
  });
  frontmatter.push('---');

  // Create full content
  const content = `${frontmatter.join('\n')}\n\n${message}\n`;

  // Generate filename and write file
  const filename = generateRandomFilename();
  const filepath = path.join(__dirname, '..', '.changeset', filename);

  // Check if file already exists (very unlikely but handle it)
  if (fs.existsSync(filepath)) {
    return createChangesetFile(bumpType, fullPackageNames, message);
  }

  fs.writeFileSync(filepath, content, 'utf8');
  return { filename, filepath };
}

function printUsage() {
  console.error(`
Usage: pnpm bump <patch|minor|major> --pkg <package> [--pkg <package>...] "<message>"

Arguments:
  patch|minor|major    Version bump type
  --pkg, -p            Package to include (can be repeated for multiple packages)
  message              Changelog message (should be the last argument, in quotes)

Valid packages:
  ${Object.keys(VALID_PACKAGES).join(', ')}

Examples:
  pnpm bump patch --pkg agents-core "Fix race condition in message queue"
  pnpm bump minor --pkg agents-sdk --pkg agents-core "Add streaming response support"
`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 3 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const parsed = parseArgs(args);

// Validate bump type
if (!parsed.bumpType) {
  console.error('Error: Bump type must be "patch", "minor", or "major"');
  printUsage();
  process.exit(1);
}

// Validate packages
if (parsed.packages.length === 0) {
  console.error('Error: At least one package must be specified with --pkg');
  printUsage();
  process.exit(1);
}

// Validate message
if (!parsed.message || parsed.message.trim() === '') {
  console.error('Error: Changelog message cannot be empty');
  printUsage();
  process.exit(1);
}

// Validate and convert package names
const fullPackageNames = validatePackages(parsed.packages);

// Create the changeset file
const { filename } = createChangesetFile(parsed.bumpType, fullPackageNames, parsed.message.trim());

console.log(`Created changeset: .changeset/${filename}`);
console.log(`  Packages: ${fullPackageNames.join(', ')}`);
console.log(`  Bump type: ${parsed.bumpType}`);
console.log(`  Message: ${parsed.message}`);
