#!/usr/bin/env node

// Usage: node scripts/quick-changeset.mjs <patch|minor|major> "changelog message"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Packages to include in changeset (excluding ignored packages)
const packages = [
  '@inkeep/agents-cli',
  '@inkeep/agents-core',
  '@inkeep/agents-manage-api',
  '@inkeep/agents-manage-ui',
  '@inkeep/agents-run-api',
  '@inkeep/agents-sdk',
  '@inkeep/create-agents'
];

function generateRandomFilename() {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '-',
    length: 3,
    style: 'lowerCase'
  });
  return `${name}.md`;
}

function createChangesetFile(bumpType, message) {
  // Generate frontmatter
  const frontmatter = ['---'];
  packages.forEach(pkg => {
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
    // Try again with a new random name
    return createChangesetFile(bumpType, message);
  }

  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`✅ Created changeset: .changeset/${filename}`);
  console.log(`📦 Packages: ${packages.length}`);
  console.log(`📝 Bump type: ${bumpType}`);
  console.log(`💬 Message: ${message}`);
}

// Parse arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node scripts/quick-changeset.mjs <patch|minor|major> "changelog message"');
  process.exit(1);
}

const bumpType = args[0];
const message = args[1];

// Validate bump type
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Error: Bump type must be "patch", "minor", or "major"');
  process.exit(1);
}

// Validate message
if (!message || message.trim() === '') {
  console.error('Error: Changelog message cannot be empty');
  process.exit(1);
}

// Create the changeset file
createChangesetFile(bumpType, message.trim());
