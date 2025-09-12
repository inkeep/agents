import { vi } from 'vitest';

// Mock the local logger module globally - this will be hoisted automatically by Vitest
vi.mock('../logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    withRequestContext: vi.fn(async (_id, fn) => await fn()),
  };
});

// Also mock the agents-core logger since api-key-auth imports from there
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    ...actual,
    getLogger: vi.fn(() => mockLogger),
  };
});

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
/*instrumentation.ts*/
import { NodeSDK } from '@opentelemetry/sdk-node';

const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, afterEach, beforeAll } from 'vitest';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

getLogger('Test Setup').debug({}, 'Setting up instrumentation');

const sdk = new NodeSDK({
  serviceName: 'inkeep-agents-run-api-test',
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        // optional - default url is http://localhost:4318/v1/traces
        // url: 'http://localhost:4318/v1/traces',
      })
    ),
  ],
  instrumentations: [getNodeAutoInstrumentations()],
  // optional - default url is http://localhost:4318/v1/metrics
  // url: 'http://localhost:4318/v1/metrics',
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
  }),
});

sdk.start();

// Initialize database schema for in-memory test databases using Drizzle migrations
beforeAll(async () => {
  const logger = getLogger('Test Setup');
  try {
    logger.debug({}, 'Applying database migrations to in-memory test database');

    // Temporarily disable foreign key constraints for tests due to composite key issues
    await dbClient.run(sql`PRAGMA foreign_keys = OFF`);

    // Use path relative to project root to work with both direct and turbo execution
    const migrationsPath = process.cwd().includes('agents-run-api')
      ? '../packages/agents-core/drizzle'
      : './packages/agents-core/drizzle';

    await migrate(dbClient, { migrationsFolder: migrationsPath });
    logger.debug({}, 'Database migrations applied successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    throw error;
  }
});

afterEach(() => {
  // Any cleanup if needed
});

afterAll(() => {
  // Any final cleanup if needed
});

export { sdk };
