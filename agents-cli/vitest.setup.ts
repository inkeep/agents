// Set up environment variables before any imports

import { vi } from 'vitest';

// Set default API URLs if not already set
process.env.INKEEP_AGENTS_API_URL = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

// Global crypto mock for all tests
vi.mock('node:crypto', async () => {
  const actual = await vi.importActual('node:crypto');
  return {
    ...actual,
    scrypt: vi.fn(),
  };
});

// Suppress console output during tests unless debugging
if (!process.env.DEBUG) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}
