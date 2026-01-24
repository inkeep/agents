/**
 * PGlite Database Snapshot Generator
 *
 * This script creates a pre-compiled PGlite database snapshot with all migrations applied.
 * The snapshot can be used by tests to skip migration execution, significantly speeding up
 * test initialization.
 *
 * Usage: pnpm test:generate-snapshot
 *
 * Output: test-fixtures/manage-db-snapshot.tar.gz and test-fixtures/runtime-db-snapshot.tar.gz
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, '..');
const MIGRATIONS_DIR = resolve(PROJECT_ROOT, 'packages/agents-core/drizzle');
const OUTPUT_DIR = resolve(PROJECT_ROOT, 'test-fixtures');

async function ensureDirectory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function generateSnapshot(
  name: string,
  migrationsFolder: string,
  outputPath: string
): Promise<void> {
  console.log(`\n[${name}] Creating PGlite instance...`);
  const client = new PGlite();
  const db = drizzle(client);

  console.log(`[${name}] Applying migrations from: ${migrationsFolder}`);
  try {
    await migrate(db, { migrationsFolder });
    console.log(`[${name}] Migrations applied successfully`);
  } catch (error) {
    console.error(`[${name}] Failed to apply migrations:`, error);
    throw error;
  }

  console.log(`[${name}] Exporting database state...`);
  const dumpResult = await client.dumpDataDir('gzip');

  const arrayBuffer = await dumpResult.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await writeFile(outputPath, buffer);
  const sizeKB = (buffer.length / 1024).toFixed(2);
  console.log(`[${name}] Snapshot saved to: ${outputPath} (${sizeKB} KB)`);

  await client.close();
}

async function main(): Promise<void> {
  console.log('=== PGlite Database Snapshot Generator ===\n');
  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`Migrations directory: ${MIGRATIONS_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  await ensureDirectory(OUTPUT_DIR);

  const snapshots = [
    {
      name: 'manage',
      migrationsFolder: resolve(MIGRATIONS_DIR, 'manage'),
      outputPath: resolve(OUTPUT_DIR, 'manage-db-snapshot.tar.gz'),
    },
    {
      name: 'runtime',
      migrationsFolder: resolve(MIGRATIONS_DIR, 'runtime'),
      outputPath: resolve(OUTPUT_DIR, 'runtime-db-snapshot.tar.gz'),
    },
  ];

  for (const snapshot of snapshots) {
    await generateSnapshot(snapshot.name, snapshot.migrationsFolder, snapshot.outputPath);
  }

  console.log('\n=== Snapshot generation complete ===');
  console.log('\nTo use these snapshots in tests, run tests after generation.');
  console.log('Tests will automatically detect and load the snapshots if present.');
}

main().catch((error) => {
  console.error('Failed to generate snapshots:', error);
  process.exit(1);
});
