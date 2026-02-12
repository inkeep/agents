#!/usr/bin/env node

/**
 * Project Setup Script
 *
 * Usage:
 *   pnpm setup-dev              - Run setup with local Docker database
 *   pnpm setup-dev:cloud        - Run setup for cloud deployment (skips Docker, uses cloud CLI profile)
 *
 * The --cloud flag is used when you have a cloud-deployed database instance
 * and want to configure the CLI for cloud APIs instead of local development.
 *
 * CI Environment:
 *   When running in CI (detected via CI, GITHUB_ACTIONS, GITLAB_CI, JENKINS_URL, or CIRCLECI
 *   environment variables), the interactive browser login step is skipped. Use INKEEP_API_KEY
 *   environment variable for authentication in CI pipelines.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { loadEnvironmentFiles } from '@inkeep/agents-core';
import dotenv from 'dotenv';

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logStep(step, message) {
  console.log(`${colors.bright}${colors.blue}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message, error) {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
  if (error) {
    console.error(`${colors.dim}  Error details: ${error.message || error}${colors.reset}`);
  }
}

function logWarning(message) {
  console.warn(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

console.log(`\n${colors.bright}=== Project Setup Script ===${colors.reset}\n`);

// Parse command-line arguments
const args = process.argv.slice(2);
const isCloud = args.includes('--cloud');

// Detect CI environment (same detection as agents-cli)
const isCI =
  process.env.INKEEP_CI === 'true' ||
  process.env.CI === 'true' ||
  process.env.CI === '1' ||
  !!process.env.GITHUB_ACTIONS ||
  process.env.GITLAB_CI === 'true' ||
  !!process.env.JENKINS_URL ||
  process.env.CIRCLECI === 'true';

if (isCI) {
  logInfo('CI environment detected - will skip interactive login step');
}

loadEnvironmentFiles();

// Load environment variables
dotenv.config();

const projectId = process.env.DEFAULT_PROJECT_ID;
const agentsApiPort = '3002';

if (!projectId) {
  logError('DEFAULT_PROJECT_ID environment variable is not set');
  process.exit(1);
}

logInfo(`Project ID: ${projectId}`);
logInfo(`Agents API Port: ${agentsApiPort}`);

async function setupProjectInDatabase(isCloud) {
  const { promisify } = await import('node:util');
  const { exec } = await import('node:child_process');
  const execAsync = promisify(exec);

  // Step 0: Generate JWT keys if not already configured
  if (
    !process.env.INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY ||
    !process.env.INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY
  ) {
    logStep(0, 'Generating JWT keys for playground authentication');
    try {
      // Generate RSA key pair using openssl
      const { stdout: privateKey } = await execAsync('openssl genrsa 2048 2>/dev/null');
      const { stdout: publicKey } = await execAsync(
        `echo '${privateKey.replace(/'/g, "'\\''")}' | openssl rsa -pubout 2>/dev/null`
      );

      // Base64 encode the keys
      const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
      const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

      // Read current .env file
      let envContent = '';
      try {
        envContent = await readFile('.env', 'utf-8');
      } catch {
        logWarning('.env file not found, creating new one');
      }

      // Update or append JWT keys
      const lines = envContent.split('\n');
      let privateKeyFound = false;
      let publicKeyFound = false;

      for (let i = 0; i < lines.length; i++) {
        if (
          lines[i].startsWith('# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=') ||
          lines[i].startsWith('INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=')
        ) {
          lines[i] = `INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=${privateKeyBase64}`;
          privateKeyFound = true;
        }
        if (
          lines[i].startsWith('# INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=') ||
          lines[i].startsWith('INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=')
        ) {
          lines[i] = `INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=${publicKeyBase64}`;
          publicKeyFound = true;
        }
      }

      // Append if not found
      if (!privateKeyFound) {
        lines.push(`INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=${privateKeyBase64}`);
      }
      if (!publicKeyFound) {
        lines.push(`INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=${publicKeyBase64}`);
      }

      await writeFile('.env', lines.join('\n'));
      logSuccess('JWT keys generated and added to .env');
    } catch {
      logWarning('Failed to generate JWT keys - playground may not work');
      logInfo('You can manually run: pnpm run generate-jwt-keys');
    }
  } else {
    logInfo('JWT keys already configured, skipping generation');
  }

  // Step 1: Start database (skip if --cloud flag is set)
  if (isCloud) {
    logStep(
      1,
      'Cloud setup: Skipping Docker database startup. Please ensure that your DATABASE_URL environment variable is configured for cloud database'
    );
  } else {
    logStep(1, 'Starting databases with Docker (DoltgreSQL + PostgreSQL + SpiceDB)');
    logInfo('DoltgreSQL (port 5432) - Management database');
    logInfo('PostgreSQL (port 5433) - Runtime database');
    logInfo('SpiceDB (port 5434) - Authorization');

    try {
      await execAsync('docker-compose -f docker-compose.db.yml up -d');
      logSuccess('Database containers started successfully');
      logInfo('Waiting for databases to be ready (10 seconds)...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      logSuccess('Databases should be ready');
    } catch (error) {
      const errorMessage = error.message || error.toString();
      const stderr = error.stderr || '';
      const combinedError = `${errorMessage}\n${stderr}`;

      // Check if it's a port conflict (database might already be running)
      const isPortConflict =
        combinedError.includes('port is already allocated') ||
        combinedError.includes('address already in use') ||
        combinedError.includes('Bind for 0.0.0.0:5432 failed') ||
        combinedError.includes('Bind for 0.0.0.0:5433 failed');

      if (isPortConflict) {
        logWarning('Database port is already in use (database might already be running)');
        logInfo('Continuing with setup...');
      } else {
        // For other errors, fail fast with clear error message
        logError('Failed to start database containers', error);
        console.error(`\n${colors.red}${colors.bright}Common issues:${colors.reset}`);
        console.error(`${colors.yellow}  • Docker is not installed or not running${colors.reset}`);
        console.error(`${colors.yellow}  • Insufficient permissions to run Docker${colors.reset}`);
        console.error(`${colors.yellow}  • Docker Compose is not installed${colors.reset}`);
        process.exit(1);
      }
    }
  }

  // Step 2: Run database migrations (and optionally upgrade packages)
  if (process.env.SKIP_UPGRADE === 'true') {
    logStep(2, 'Skipping package upgrade (SKIP_UPGRADE=true), running migrations only');
    try {
      const { stdout } = await execAsync('pnpm db:migrate');
      if (stdout) {
        console.log(`${colors.dim}  ${stdout.trim()}${colors.reset}`);
      }
      logSuccess('Database migrations completed successfully');
    } catch (error) {
      logError('Failed to run database migrations', error);
      logWarning('This may cause issues with the setup. Consider checking your database schema.');
    }
  } else {
    logStep(2, 'Running database migrations and upgrading packages');
    try {
      const { stdout } = await execAsync('pnpm upgrade-agents');
      if (stdout) {
        console.log(`${colors.dim}  ${stdout.trim()}${colors.reset}`);
      }
      logSuccess('Upgrades completed successfully');
    } catch (error) {
      logError('Failed to run database migrations', error);
      logWarning('This may cause issues with the setup. Consider checking your database schema.');
    }
  }

  // Step 3: Initialize default organization and admin user (if credentials are set)
  // Note: SpiceDB schema is now applied automatically by db:auth:init
  logStep(3, 'Checking for auth initialization');

  const hasAuthCredentials =
    process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME &&
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD &&
    process.env.BETTER_AUTH_SECRET;

  const authInitCommand = 'node node_modules/@inkeep/agents-core/dist/auth/init.js';

  if (hasAuthCredentials) {
    logInfo('Initializing default organization and admin user...');
    try {
      await execAsync(authInitCommand);
      logSuccess('Auth initialization complete');
    } catch (error) {
      logWarning(`Auth initialization failed - you may need to run manually: ${authInitCommand}`);
      logInfo(`Error: ${error.message || error}`);
    }
  } else {
    logWarning('Skipping auth initialization - credentials not configured');
    logInfo('To create a default admin user, set in .env:');
    logInfo('  INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com');
    logInfo('  INKEEP_AGENTS_MANAGE_UI_PASSWORD=your-password');
    logInfo('  BETTER_AUTH_SECRET=your-secret-key');
    logInfo(`Then run: ${authInitCommand}`);
  }

  // Step 5: Start development servers
  logStep(5, 'Starting development servers');
  const { spawn } = await import('node:child_process');

  try {
    // Start API server
    const devApiProcess = spawn('pnpm', ['dev:api'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    if (!devApiProcess.pid) {
      throw new Error('Failed to spawn API server process');
    }

    logSuccess(`API server process started (PID: ${devApiProcess.pid})`);

    // Start Dashboard/UI server (on port 3000)
    const dashboardProcess = spawn('pnpm', ['dev:ui'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    if (!dashboardProcess.pid) {
      throw new Error('Failed to spawn Dashboard server process');
    }

    logSuccess(`Dashboard server process started (PID: ${dashboardProcess.pid})`);

    // Track if port errors occur during startup (as a safety fallback)
    const portErrors = { agentsApi: false, dashboard: false };

    // Regex patterns for detecting port errors in output
    const portErrorPatterns = {
      agentsApi: new RegExp(
        `(EADDRINUSE.*:${agentsApiPort}|port ${agentsApiPort}.*already|Port ${agentsApiPort}.*already)`,
        'i'
      ),
      dashboard: /(EADDRINUSE.*:3000|port 3000.*already|Port 3000.*already)/i,
    };

    /**
     * Wait for a server to be ready by polling a health endpoint
     */
    async function waitForServerReady(url, timeout) {
      const start = Date.now();
      let lastError = null;
      while (Date.now() - start < timeout) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            return;
          }
          lastError = `HTTP ${response.status}`;
        } catch (error) {
          lastError = error.message || error;
          // Server not ready yet, continue polling
        }
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second
      }
      throw new Error(`Server not ready at ${url} after ${timeout}ms. Last error: ${lastError}`);
    }

    // Monitor output for port errors (fallback in case ports become unavailable between check and start)
    const checkForApiPortErrors = (data) => {
      const output = data.toString();
      if (portErrorPatterns.agentsApi.test(output)) {
        portErrors.agentsApi = true;
      }
    };

    const checkForDashboardPortErrors = (data) => {
      const output = data.toString();
      if (portErrorPatterns.dashboard.test(output)) {
        portErrors.dashboard = true;
      }
    };

    devApiProcess.stdout.on('data', checkForApiPortErrors);
    dashboardProcess.stdout.on('data', checkForDashboardPortErrors);

    // Step 6: Wait for servers to be ready
    logStep(6, 'Waiting for servers to be ready');

    logInfo('Checking Agents API health endpoint (http://localhost:3002/health)...');
    try {
      await waitForServerReady(`http://localhost:3002/health`, 60000);
      logSuccess('Agents API is ready');
    } catch (error) {
      logError('Agents API failed to start within timeout', error);
      logWarning('Continuing anyway, but subsequent steps may fail');
    }

    logInfo('Checking Dashboard health endpoint (http://localhost:3000)...');
    try {
      await waitForServerReady(`http://localhost:3000`, 60000);
      logSuccess('Dashboard is ready');
    } catch (error) {
      logError('Dashboard failed to start within timeout', error);
      logWarning('Continuing anyway, but subsequent steps may fail');
    }

    // Helper to stop a spawned process
    const stopProcess = async (proc, name) => {
      if (!proc.pid) {
        logWarning(`${name} process PID not found, may still be running`);
        return;
      }

      try {
        if (process.platform === 'win32') {
          // Windows: Use taskkill to kill process tree
          await execAsync(`taskkill /pid ${proc.pid} /T /F`);
        } else {
          // Unix: Use negative PID to kill process group
          process.kill(-proc.pid, 'SIGTERM');
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            process.kill(-proc.pid, 'SIGKILL');
          } catch {
            // Process already killed, this is fine
          }
        }
        logSuccess(`${name} stopped`);
      } catch {
        logWarning(`Could not cleanly stop ${name} - may still be running in background`);
      }
    };

    let pushSuccess = false;

    try {
      // Check if any port errors occurred during startup
      if (portErrors.agentsApi || portErrors.dashboard) {
        let errorMessage = '';
        if (portErrors.agentsApi) {
          errorMessage += `  Agents API port ${agentsApiPort} is already in use\n`;
        }
        if (portErrors.dashboard) {
          errorMessage += `  Dashboard port 3000 is already in use\n`;
        }
        logError('Port conflicts detected');
        console.error(errorMessage);
        logWarning('Please free up the ports and try again.');
        throw new Error('Port conflicts detected');
      }

      // Step 7: Set up CLI profile (skip in CI - uses INKEEP_API_KEY env var instead)
      if (isCI) {
        logStep(7, 'Skipping CLI profile setup (CI environment detected)');
        logInfo('In CI, use INKEEP_API_KEY environment variable for authentication');
      } else {
        logStep(7, 'Setting up CLI profile');
        try {
          if (isCloud) {
            // Cloud setup - don't use --local flag
            await execAsync('pnpm inkeep init --no-interactive');
            logSuccess('Cloud CLI profile configured');
          } else {
            // Local setup - use --local flag to point to local APIs
            await execAsync('pnpm inkeep init --local --no-interactive');
            logSuccess('Local CLI profile configured');
          }
        } catch {
          const initCommand = isCloud ? 'inkeep init' : 'inkeep init --local';
          logWarning(`Could not set up CLI profile - you may need to run: ${initCommand}`);
        }
      }

      // Step 8: Log in to CLI (interactive - opens browser)
      // Skip in CI environments since interactive browser login isn't possible
      if (isCI) {
        logStep(8, 'Skipping CLI login (CI environment detected)');
        logInfo('In CI, use INKEEP_API_KEY environment variable for authentication');
      } else {
        logStep(8, 'Logging in to CLI');
        logInfo('This will open a browser window for authentication...');
        try {
          await new Promise((resolve, reject) => {
            const loginProcess = spawn('pnpm', ['inkeep', 'login'], {
              stdio: 'inherit',
              shell: true,
            });
            loginProcess.on('close', (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Login exited with code ${code}`));
            });
            loginProcess.on('error', reject);
          });
          logSuccess('CLI login completed');
        } catch {
          logWarning('Could not log in to CLI - you may need to run: inkeep login');
        }
      }

      // Step 9: Run inkeep push
      logStep(9, 'Running inkeep push command');
      logInfo(`Pushing project: src/projects/${projectId}`);

      try {
        const { stdout } = await execAsync(
          `pnpm inkeep push --project src/projects/${projectId} --config src/inkeep.config.ts`
        );

        if (stdout) {
          console.log(`${colors.dim}${stdout.trim()}${colors.reset}`);
        }

        logSuccess('Inkeep push completed successfully');
        pushSuccess = true;
      } catch (error) {
        logError('Inkeep push command failed', error);
        logWarning('The project may not have been pushed to the remote');
      }
    } finally {
      // Step 10: Cleanup - Always stop development servers
      logStep(10, 'Cleaning up - stopping development servers');

      logInfo('Stopping API server...');
      await stopProcess(devApiProcess, 'API server');

      logInfo('Stopping Dashboard...');
      await stopProcess(dashboardProcess, 'Dashboard');
    }

    // Final summary
    console.log(`\n${colors.bright}=== Setup Complete ===${colors.reset}\n`);
    if (pushSuccess) {
      logSuccess('All steps completed successfully!');
    } else {
      logWarning('Setup completed with some errors. Please review the logs above.');
    }
  } catch (error) {
    logError('Fatal error during setup', error);
    console.log(`\n${colors.bright}=== Setup Failed ===${colors.reset}\n`);
    process.exit(1);
  }
}

setupProjectInDatabase(isCloud).catch((error) => {
  logError('Unhandled error in setup', error);
  process.exit(1);
});
