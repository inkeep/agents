import { vi } from 'vitest';

// Set test environment
process.env.ENVIRONMENT = 'test';
process.env.NODE_ENV = 'test';

// Mock the local logger module globally
vi.mock('../logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    getPinoInstance: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
  };
});

// Mock the agents-core logger
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

// Mock workflow dependencies
vi.mock('workflow/api', () => ({
  start: vi.fn().mockResolvedValue(undefined),
}));

// Mock run database client
vi.mock('../data/db/runDbClient.js', () => ({
  default: {},
}));

// Mock environment variables for testing
vi.mock('../env.js', () => ({
  env: {
    ENVIRONMENT: 'test',
    NODE_ENV: 'test',
    INKEEP_AGENTS_EVAL_API_URL: 'http://localhost:3005',
    INKEEP_AGENTS_RUN_API_URL: 'http://localhost:3003',
    INKEEP_AGENTS_MANAGE_API_URL: 'http://localhost:3002',
    INKEEP_AGENTS_MANAGE_UI_URL: 'http://localhost:3000',
    INKEEP_AGENTS_EVAL_API_BYPASS_SECRET: undefined as string | undefined,
    INKEEP_AGENTS_RUN_API_BYPASS_SECRET: undefined as string | undefined,
    LOG_LEVEL: 'debug',
  },
}));

export {};

