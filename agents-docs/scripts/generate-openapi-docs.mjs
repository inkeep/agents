#!/usr/bin/env node
/**
 * Generate OpenAPI documentation from specifications
 *
 * This script generates static documentation pages from OpenAPI JSON specs
 * for both the Run API and Manage API.
 *
 * Usage:
 *   node scripts/generate-openapi-docs.mjs
 *
 * Prerequisites:
 *   Run `pnpm fetch-openapi` first to download the latest API specs
 */

import { generateFiles } from 'fumadocs-openapi';

const APIS = [
  {
    name: 'Run API',
    input: './src/lib/run-api.json',
    output: './content/docs/api-reference/run-api',
  },
  {
    name: 'Manage API',
    input: './src/lib/manage-api.json',
    output: './content/docs/api-reference/manage-api',
  },
];

console.log('📚 Generating OpenAPI documentation...\n');

for (const api of APIS) {
  try {
    console.log(`🔨 Generating ${api.name} docs...`);
    console.log(`   Input:  ${api.input}`);
    console.log(`   Output: ${api.output}`);

    await generateFiles({
      input: api.input,
      output: api.output,
      per: 'file',
      includeDescription: true,
    });

    console.log(`✅ ${api.name} documentation generated\n`);
  } catch (error) {
    console.error(`❌ Failed to generate ${api.name} docs:`);
    console.error(`   ${error.message}\n`);
    throw error;
  }
}

console.log('✨ All API documentation generated successfully!\n');
