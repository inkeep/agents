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

console.log(`Fetching OpenAPI spec from: ${openapiUrl}`);
console.log(`Writing to: ${outputPath}`);

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
  if (error.cause) {
    console.error('✗ Error fetching OpenAPI spec:', error.message);
    console.error('  Cause:', error.cause.message || error.cause);
    console.error(`\n  Make sure ${apiUrl} is running and accessible.`);
  } else {
    console.error('✗ Error fetching OpenAPI spec:', error.message);
  }
  process.exit(1);
}
