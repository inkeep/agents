import { getLogger } from '@inkeep/agents-core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import manageDbClient from '../data/db/manageDbClient';
import runDbClient from '../data/db/runDbClient';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
/*instrumentation.ts*/
import { NodeSDK } from '@opentelemetry/sdk-node';

const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// Mock the local logger module globally - this will be hoisted automatically by Vitest
vi.mock('../logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    withRequestContext: vi.fn(async (_id, fn) => await fn()),
  };
});

vi.mock('../logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
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
    getPinoInstance: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
  return {
    ...actual,
    getLogger: vi.fn(() => mockLogger),
  };
});

const sdk = new NodeSDK({
  serviceName: 'inkeep-agents-api-test',
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

    // Use path relative to project root to work with both direct and turbo execution
    // When running from agents-manage-api, go up one level to project root
    const isInPackageDir =
      process.cwd().includes('agents-api')
    const manageMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/manage'
      : './packages/agents-core/drizzle/manage';

    const runMigrationsPath = isInPackageDir
      ? '../packages/agents-core/drizzle/runtime'
      : './packages/agents-core/drizzle/runtime';

    await migrate(manageDbClient, { migrationsFolder: manageMigrationsPath });
    await migrate(runDbClient, { migrationsFolder: runMigrationsPath });
    logger.debug({}, 'Database migrations applied successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to apply database migrations');
    throw error;
  }
}, 60000);

afterEach(() => {
  // Any cleanup if needed
});

afterAll(() => {
  // Any final cleanup if needed
});
