import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createAgentsManageDatabaseClient } from '../../db/manage/manage-client';
import * as schema from '../../db/manage/manage-schema';
import { projectExists } from './projects';


const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost/inkeep_agents',
});
const connection = await pool.connect();

connection.query(`SELECT DOLT_CHECKOUT('inkeep_main')`);

const dbClient = drizzle(connection, {
  schema,
  logger: true,
});

// ... existing code up to main() ...

const main = async () => {
  // First, verify the checkout completed
  const branchCheck = await connection.query(`SELECT active_branch()`);
  console.log('Active branch:', branchCheck.rows[0]?.active_branch);

  const projectExistsResult = await projectExists(dbClient)({
    tenantId: 'inkeep',
    projectId: 'my-weather-project',
  });
  console.log('Project exists:', projectExistsResult);

}
main();
