// Set up environment variables before any imports
process.env.ENVIRONMENT = process.env.ENVIRONMENT || 'test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_FILE_NAME = process.env.DB_FILE_NAME || 'test.db';

// Set default API URLs if not already set
process.env.INKEEP_MANAGEMENT_API_URL = process.env.INKEEP_MANAGEMENT_API_URL || 'http://localhost:3001';
process.env.INKEEP_EXECUTION_API_URL = process.env.INKEEP_EXECUTION_API_URL || 'http://localhost:3002';

// Suppress console output during tests unless debugging
if (!process.env.DEBUG) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}