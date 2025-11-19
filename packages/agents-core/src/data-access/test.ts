import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createDatabaseClient } from '../db/client';
import * as schema from '../db/schema';
import { executeInBranch } from '../dolt/branch-scoped-execution';
import { getAgentWithDefaultSubAgent } from './agents';
import { setActiveAgentForConversation } from './conversations';
import { getSubAgentById } from './subAgents';
import { createTask } from './tasks';

// const dbClient = createDatabaseClient();

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost/inkeep_agents',
});
const connection = await pool.connect();

connection.query(`SELECT DOLT_CHECKOUT('default_main')`);

const dbClient = drizzle(connection, {
  schema,
  logger: true,
});

// ... existing code up to main() ...

const main = async () => {
  // First, verify the checkout completed
  const branchCheck = await connection.query(`SELECT active_branch()`);
  console.log('Active branch:', branchCheck.rows[0]?.active_branch);

  // Test different query patterns to isolate the issue
  console.log('\n=== TEST 1: Query with all params using different order ===');
  const test1 = await connection.query(
    `SELECT * FROM sub_agents WHERE id = $1 AND tenant_id = $2 AND project_id = $3 AND agent_id = $4`,
    ['parent', 'default', 'my-weather-project', 'test-agent']
  );
  console.log('Result:', test1.rows.length);

  console.log('\n=== TEST 2: Query with parentheses ===');
  const test2 = await connection.query(
    `SELECT * FROM sub_agents WHERE (tenant_id = $1) AND (project_id = $2) AND (agent_id = $3) AND (id = $4)`,
    ['default', 'my-weather-project', 'test-agent', 'parent']
  );
  console.log('Result:', test2.rows.length);

  console.log('\n=== TEST 3: Query using IN clause ===');
  const test3 = await connection.query(
    `SELECT * FROM sub_agents WHERE tenant_id = $1 AND project_id = $2 AND agent_id = $3 AND id IN ($4)`,
    ['default', 'my-weather-project', 'test-agent', 'parent']
  );
  console.log('Result:', test3.rows.length);

  console.log('\n=== TEST 4: Check for hidden characters in "parent" ===');
  const test4 = await connection.query(
    `SELECT id, LENGTH(id) as id_length, HEX(id) as id_hex FROM sub_agents WHERE id = 'parent'`
  );
  console.log('Result:', test4.rows);

  console.log('\n=== TEST 5: Query using LIKE instead of = ===');
  const test5 = await connection.query(
    `SELECT * FROM sub_agents WHERE tenant_id = $1 AND project_id = $2 AND agent_id = $3 AND id LIKE $4`,
    ['default', 'my-weather-project', 'test-agent', 'parent']
  );
  console.log('Result:', test5.rows.length);

  console.log('\n=== TEST 6: Check indexes ===');
  const test6 = await connection.query(
    `SHOW INDEXES FROM sub_agents`
  );
  console.log('Indexes:', test6.rows);

  // Try the working query for comparison
  console.log('\n=== TEST 7: Working query (child) for comparison ===');
  const test7 = await connection.query(
    `SELECT * FROM sub_agents WHERE tenant_id = $1 AND project_id = $2 AND agent_id = $3 AND id = $4`,
    ['default', 'my-weather-project', 'test-agent', 'child']
  );
  console.log('Result:', test7.rows.length);
};
// const main = async () => {
//   // First, create the project that the data component will reference
//   // try {
//   // await createProject(db)({
//   //   id: 'test',
//   //   tenantId: 'default',
//   //   name: 'Test Project',
//   //   description: 'A project for testing',
//   //   models: {
//   //     base: {},
//   //   },

//   // const result = await setActiveAgentForConversation(db)({
//   //   scopes: {
//   //     tenantId: 'default',
//   //     projectId: 'my-weather-project',
//   //   },
//   //   conversationId: 'b9ifrro1q441tk0z3lvup',
//   //   subAgentId: 'weather-assistant',
//   // });

//   // const result = await executeInBranch(
//   //   { dbClient, ref: { type: 'branch', name: 'default_main', hash: 'default_main' } },
//   //   async (db) => {
//   const result = await getSubAgentById(dbClient)({
//     scopes: {
//       tenantId: 'default',
//       projectId: 'my-weather-project',
//       agentId: 'test',
//     },
//     subAgentId: 'test-agent',
//   });
//   console.log(result);
//   // );
//   // console.log(result);
//   // const result = await getAgentWithDefaultSubAgent(db)({
//   //   scopes: {
//   //     tenantId: 'default',
//   //     projectId: 'my-weather-project',
//   //     agentId: 'weather-agent',
//   //   },
//   // });
//   // } catch (error) {
//   //   // Project might already exist, that's okay
//   //   console.log('Project creation skipped (may already exist)');
//   // }

//   // const params: DataComponentInsert = {
//   //   id: 'test',
//   //   tenantId: 'default',
//   //   projectId: 'test',
//   //   name: 'Test',
//   //   render: null,
//   //   description: 'A test data component',
//   // };

//   // const result = await createDataComponent(db)(params);
//   // console.log('Data component created:', result);
// };

main();
