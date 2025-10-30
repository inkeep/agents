import { execSync } from "node:child_process";

function runCommand(command, description, options = {}) {
  console.log(`${description}...`);
  try {
    execSync(command, {
      ...options 
    });
    console.log(`✅ ${description} completed successfully`);
  } catch (error) {
    console.error(`❌ ${description} failed:`);
    console.error(`   Command: ${command}`);
    console.error(`   Exit code: ${error.status}`);
    console.error(`   Error: ${error.message}`);
    process.exit(1); 
  }
}

// Usage
runCommand(
  'pnpm update @inkeep/agents-core @inkeep/agents-sdk @inkeep/agents-manage-ui @inkeep/agents-cli --latest',
  'Upgrading core and sdk packages'
);

runCommand(
  'pnpm update @inkeep/agents-run-api --latest',
  'Upgrading run-api package',
  { cwd: './apps/run-api' }
);

runCommand(
  'pnpm update @inkeep/agents-manage-api --latest',
  'Upgrading manage-api package',
  { cwd: './apps/manage-api' }
);

runCommand(
  'pnpm update @inkeep/agents-ui --latest',
  'Upgrading agents-ui package',
  { cwd: './apps/agents-ui' }
);

runCommand(
  'pnpm db:migrate',
  'Migrating database schema',
)

console.log('Done!');