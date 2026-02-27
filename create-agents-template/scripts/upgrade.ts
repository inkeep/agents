import { execSync } from 'node:child_process';

const skipMigrate = process.argv.includes('--skip-migrate');

function runCommand(command, description, options = {}) {
  console.log(`${description}...`);
  try {
    execSync(command, {
      ...options,
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

runCommand('pnpm update @inkeep/agents-api --latest', 'Upgrading agents-api package', {
  cwd: './apps/agents-api',
});

runCommand('pnpm update @inkeep/agents-ui --latest', 'Upgrading agents-ui package', {
  cwd: './apps/agents-ui',
});

if (!skipMigrate) {
  runCommand('pnpm db:migrate', 'Migrating database schema');
} else {
  console.log('⏭️  Skipping database migrations (--skip-migrate)');
}

console.log('Done!');
