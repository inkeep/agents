#!/usr/bin/env node
/**
 * Fetch OpenAPI specifications from running API servers
 *
 * This script fetches the latest OpenAPI JSON specs from both the Run API
 * and Manage API endpoints and saves them locally for documentation generation.
 *
 * Usage:
 *   node scripts/fetch-openapi-specs.mjs
 *
 * Environment variables:
 *   RUN_API_URL - Override default Run API URL (default: http://localhost:3003)
 *   MANAGE_API_URL - Override default Manage API URL (default: http://localhost:3002)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = join(__dirname, '..', 'src', 'lib');

// API endpoint configuration
const RUN_API_URL = process.env.RUN_API_URL || 'http://localhost:3003';
const MANAGE_API_URL = process.env.MANAGE_API_URL || 'http://localhost:3002';

const APIS = [
  {
    name: 'Run API',
    url: `${RUN_API_URL}/openapi.json`,
    outputFile: join(LIB_DIR, 'run-api.json'),
  },
  {
    name: 'Manage API',
    url: `${MANAGE_API_URL}/openapi.json`,
    outputFile: join(LIB_DIR, 'manage-api.json'),
  },
];

/**
 * Fetch OpenAPI spec from a URL
 */
async function fetchSpec(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    throw new Error(`Expected JSON response, got: ${contentType}`);
  }

  return response.json();
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Fetching OpenAPI specifications...\n');

  // Ensure output directory exists
  await mkdir(LIB_DIR, { recursive: true });

  const results = [];

  for (const api of APIS) {
    try {
      console.log(`📡 Fetching ${api.name} from ${api.url}...`);

      const spec = await fetchSpec(api.url);

      // Validate it's a valid OpenAPI spec
      if (!spec.openapi && !spec.swagger) {
        throw new Error('Invalid OpenAPI specification (missing openapi/swagger field)');
      }

      // Write to file
      await writeFile(
        api.outputFile,
        JSON.stringify(spec, null, 2),
        'utf-8'
      );

      console.log(`✅ ${api.name} spec saved to ${api.outputFile}`);
      console.log(`   Version: ${spec.info?.version || 'unknown'}`);
      console.log(`   Endpoints: ${Object.keys(spec.paths || {}).length}\n`);

      results.push({ api: api.name, success: true });
    } catch (error) {
      console.error(`❌ Failed to fetch ${api.name}:`);
      console.error(`   ${error.message}\n`);
      results.push({ api: api.name, success: false, error: error.message });
    }
  }

  // Summary
  console.log('━'.repeat(60));
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`\n📊 Summary: ${successCount} succeeded, ${failCount} failed\n`);

  if (failCount > 0) {
    console.error('⚠️  Some API specs failed to fetch. Make sure both APIs are running:');
    console.error('   Run API:    pnpm --filter @inkeep/agents-run-api dev');
    console.error('   Manage API: pnpm --filter @inkeep/agents-manage-api dev');
    console.error('   Or both:    pnpm dev:apis\n');
    process.exit(1);
  }

  console.log('✨ All OpenAPI specs fetched successfully!');
  console.log('📝 Next step: Run `pnpm generate-openapi` to generate documentation\n');
}

main().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
