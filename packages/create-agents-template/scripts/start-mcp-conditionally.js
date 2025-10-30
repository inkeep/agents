import { spawn } from 'node:child_process';
import { checkForRoutes } from './check-mcps.js';

const hasRoutes = await checkForRoutes();

if (hasRoutes) {
  console.log('✅ MCP routes found, starting Next.js dev server...');
  const child = spawn('pnpm', ['dev'], { 
    cwd: 'apps/mcp',
    stdio: 'inherit',
    shell: true 
  });
  
  child.on('exit', (code) => process.exit(code));
} else {
  console.log('\x1b[33m⚠️  No MCPs defined in apps/mcp/\x1b[0m');
  console.log('\x1b[36m   Use \x1b[1m\x1b[97minkeep add --mcp <template-name>\x1b[0m\x1b[36m to add a template MCP server then restart the dev server with \x1b[1m\x1b[97mpnpm dev\x1b[0m');
  
  // Keep process alive but do nothing
  setInterval(() => {}, 1000);
}