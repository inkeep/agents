import { listBranchesForAgent } from '@inkeep/agents-core';
import * as schema from '@inkeep/agents-core/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import dbClient from './src/data/db/dbClient';
import { getPoolFromClient } from './src/middleware/branch-scoped-db';

const pool = getPoolFromClient(dbClient);
if (!pool) {
  throw new Error('Pool not found');
}
const connection: PoolClient = await pool.connect();

const requestDb = drizzle(connection, { schema });

const branches = await listBranchesForAgent(requestDb)({
  tenantId: 'default',
  projectId: 'my-weather-project',
  agentId: 'weather-agent',
});

console.log('branches', branches);
