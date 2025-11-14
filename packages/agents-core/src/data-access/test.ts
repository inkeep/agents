import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';

import type { DataComponentInsert } from '../types';
import { createDataComponent } from './dataComponents';
import { createProject } from './projects';

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost/inkeep_agents',
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

const db = drizzle(pool, {
  schema,
  logger: true,
});

const main = async () => {
  // First, create the project that the data component will reference
  try {
    await createProject(db)({
      id: 'test',
      tenantId: 'default',
      name: 'Test Project',
      description: 'A project for testing',
      models: {
        base: {},
      },
    });
    console.log('Project created successfully');
  } catch (error) {
    // Project might already exist, that's okay
    console.log('Project creation skipped (may already exist)');
  }

  const params: DataComponentInsert = {
    id: 'test',
    tenantId: 'default',
    projectId: 'test',
    name: 'Test',
    render: null,
    description: 'A test data component',
  };

  const result = await createDataComponent(db)(params);
  console.log('Data component created:', result);
};

main();
