import { createWorld } from '@workflow/world-postgres';
import { env } from '../env';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for workflow persistence');
}

export const world: ReturnType<typeof createWorld> = createWorld({
  connectionString: env.DATABASE_URL,
  jobPrefix: 'inkeep-agents-eval',
  queueConcurrency: 20,
});

