// Set up environment variables before any imports
process.env.ENVIRONMENT = process.env.ENVIRONMENT || 'test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Set default API URLs if not already set
process.env.INKEEP_AGENTS_MANAGE_API_URL =
  process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002';
process.env.INKEEP_AGENTS_RUN_API_URL =
  process.env.INKEEP_AGENTS_RUN_API_URL || 'http://localhost:3003';

// Suppress console output during tests unless debugging
if (!process.env.DEBUG) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}
