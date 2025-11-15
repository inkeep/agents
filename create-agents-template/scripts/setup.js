#!/usr/bin/env node

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

loadEnvironmentFiles();

// Load environment variables
dotenv.config();

const projectId = process.env.DEFAULT_PROJECT_ID;
const manageApiPort = '3002';
const runApiPort = '3003';

if (!projectId) {
  logError('DEFAULT_PROJECT_ID environment variable is not set');
  process.exit(1);
}

logInfo(`Project ID: ${projectId}`);
logInfo(`Manage API Port: ${manageApiPort}`);
logInfo(`Run API Port: ${runApiPort}\n`);

async function setupProjectInDatabase() {
  const { promisify } = await import('node:util');
  const { exec } = await import('node:child_process');
  const execAsync = promisify(exec);

  // Step 1: Start database
  logStep(1, 'Starting PostgreSQL database');
  try {
    await execAsync('docker-compose -f docker-compose.db.yml up -d');
    logSuccess('Database container started successfully');

    logInfo('Waiting for database to be ready (5 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 5000));
    logSuccess('Database should be ready');
  } catch (error) {
    const errorMessage = error.message || error.toString();
    const stderr = error.stderr || '';
    const combinedError = `${errorMessage}\n${stderr}`;

    // Check if it's a port conflict (database might already be running)
    const isPortConflict =
      combinedError.includes('port is already allocated') ||
      combinedError.includes('address already in use') ||
      combinedError.includes('Bind for 0.0.0.0:5432 failed');

    if (isPortConflict) {
      logWarning('Database port is already in use (database might already be running)');
      logInfo('Continuing with setup...');
    } else {
      // For other errors, fail fast with clear error message
      logError('Failed to start database container', error);
      console.error(`\n${colors.red}${colors.bright}Common issues:${colors.reset}`);
      console.error(`${colors.yellow}  • Docker is not installed or not running${colors.reset}`);
      console.error(`${colors.yellow}  • Insufficient permissions to run Docker${colors.reset}`);
      console.error(`${colors.yellow}  • Docker Compose is not installed${colors.reset}`);
      process.exit(1);
    }
  }

  // Step 2: Run database migrations
  logStep(2, 'Running database migrations and upgrading packages');
  try {
    const { stdout, stderr } = await execAsync('pnpm upgrade-agents');
    if (stdout) {
      console.log(`${colors.dim}  ${stdout.trim()}${colors.reset}`);
    }
    logSuccess('Upgrades completed successfully');
  } catch (error) {
    logError('Failed to run database migrations', error);
    logWarning('This may cause issues with the setup. Consider checking your database schema.');
  }

  // Step 3: Start development servers
  logStep(3, 'Starting development servers');
  const { spawn } = await import('node:child_process');

  try {
    const devProcess = spawn('pnpm', ['dev:apis'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
    });

    if (!devProcess.pid) {
      throw new Error('Failed to spawn development server process');
    }

    logSuccess(`Development servers process started (PID: ${devProcess.pid})`);

    // Track if port errors occur during startup (as a safety fallback)
    const portErrors = { runApi: false, manageApi: false };

    // Regex patterns for detecting port errors in output
    const portErrorPatterns = {
      runApi: new RegExp(
        `(EADDRINUSE.*:${runApiPort}|port ${runApiPort}.*already|Port ${runApiPort}.*already|run-api.*Error.*Port)`,
        'i'
      ),
      manageApi: new RegExp(
        `(EADDRINUSE.*:${manageApiPort}|port ${manageApiPort}.*already|Port ${manageApiPort}.*already|manage-api.*Error.*Port)`,
        'i'
      ),
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

    /**
     * Display port conflict error and exit
     */
    function displayPortConflictError(unavailablePorts) {
      let errorMessage = '';
      if (unavailablePorts.runApi) {
        errorMessage += `  Run API port ${runApiPort} is already in use\n`;
      }
      if (unavailablePorts.manageApi) {
        errorMessage += `  Manage API port ${manageApiPort} is already in use\n`;
      }

      logError('Port conflicts detected');
      console.error(errorMessage);
      logWarning('Please free up the ports and try again.');
      process.exit(1);
    }

    // Monitor output for port errors (fallback in case ports become unavailable between check and start)
    const checkForPortErrors = (data) => {
      const output = data.toString();
      if (portErrorPatterns.runApi.test(output)) {
        portErrors.runApi = true;
      }
      if (portErrorPatterns.manageApi.test(output)) {
        portErrors.manageApi = true;
      }
    };

    devProcess.stdout.on('data', checkForPortErrors);

    // Step 4: Wait for servers to be ready
    logStep(4, 'Waiting for servers to be ready');
    logInfo('Checking Manage API health endpoint (http://localhost:3002/health)...');

    try {
      await waitForServerReady(`http://localhost:3002/health`, 60000);
      logSuccess('Manage API is ready');
    } catch (error) {
      logError('Manage API failed to start within timeout', error);
      logWarning('Continuing anyway, but subsequent steps may fail');
    }

    logInfo('Checking Run API health endpoint (http://localhost:3003/health)...');

    try {
      await waitForServerReady(`http://localhost:3003/health`, 60000);
      logSuccess('Run API is ready');
    } catch (error) {
      logError('Run API failed to start within timeout', error);
      logWarning('Continuing anyway, but subsequent steps may fail');
    }

    // Check if any port errors occurred during startup
    if (portErrors.runApi || portErrors.manageApi) {
      displayPortConflictError(portErrors);
    }

    // Step 5: Run inkeep push
    logStep(5, 'Running inkeep push command');
    logInfo(`Pushing project: src/projects/${projectId}`);

    let pushSuccess = false;
    try {
      const { stdout, stderr } = await execAsync(
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
      pushSuccess = false;
    } finally {
      // Step 6: Cleanup - Stop development servers
      logStep(6, 'Cleaning up - stopping development servers');

      if (devProcess.pid) {
        try {
          if (process.platform === 'win32') {
            // Windows: Use taskkill to kill process tree
            logInfo('Stopping processes (Windows)...');
            await execAsync(`taskkill /pid ${devProcess.pid} /T /F`);
            logSuccess('Development servers stopped');
          } else {
            // Unix: Use negative PID to kill process group
            logInfo('Sending SIGTERM to process group...');
            process.kill(-devProcess.pid, 'SIGTERM');

            await new Promise((resolve) => setTimeout(resolve, 1000));

            try {
              process.kill(-devProcess.pid, 'SIGKILL');
            } catch {
              // Process already killed, this is fine
            }
            logSuccess('Development servers stopped');
          }
        } catch (error) {
          logWarning(
            'Could not cleanly stop dev servers - they may still be running in background'
          );
          logInfo('You may need to manually stop them using: pkill -f "pnpm dev:apis"');
        }
      } else {
        logWarning('Dev process PID not found, servers may still be running');
      }
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

setupProjectInDatabase().catch((error) => {
  logError('Unhandled error in setup', error);
  process.exit(1);
});
