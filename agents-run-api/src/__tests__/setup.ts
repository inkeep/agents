import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
/*instrumentation.ts*/
import { NodeSDK } from '@opentelemetry/sdk-node';

const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

import { getLogger } from '@inkeep/agents-core';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import dbClient from '../data/db/dbClient';

// Global mock for the agents-run-api logger to prevent undefined errors
vi.mock('../logger.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
  withRequestContext: vi.fn().mockImplementation(async (id, fn) => await fn()),
}));

getLogger('Test Setup').debug({}, 'Setting up instrumentation');

const sdk = new NodeSDK({
  serviceName: 'inkeep-execution-api',
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

    await migrate(dbClient, { migrationsFolder: '../packages/agents-core/drizzle' });
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
