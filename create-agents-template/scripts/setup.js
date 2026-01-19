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
 */

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
    } catch (error) {
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
    logStep(1, 'Starting databases with Docker (DoltgreSQL + PostgreSQL)');
    try {
      await execAsync('docker-compose -f docker-compose.db.yml up -d');
      logSuccess('Database containers started successfully');
      logInfo('DoltgreSQL (port 5432) - Management database');
      logInfo('PostgreSQL (port 5433) - Runtime database');
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
    const portErrors = { agentsApi: false };

    // Regex patterns for detecting port errors in output
    const portErrorPatterns = {
      agentsApi: new RegExp(
        `(EADDRINUSE.*:${agentsApiPort}|port ${agentsApiPort}.*already|Port ${agentsApiPort}.*already|agents-api.*Error.*Port)`,
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
        errorMessage += `  Agents API port ${agentsApiPort} is already in use\n`;
      }

      logError('Port conflicts detected');
      console.error(errorMessage);
      logWarning('Please free up the ports and try again.');
      process.exit(1);
    }

    // Monitor output for port errors (fallback in case ports become unavailable between check and start)
    const checkForPortErrors = (data) => {
      const output = data.toString();
      if (portErrorPatterns.agentsApi.test(output)) {
        portErrors.agentsApi = true;
      }
    };

    devProcess.stdout.on('data', checkForPortErrors);

    // Step 4: Wait for servers to be ready
    logStep(4, 'Waiting for servers to be ready');
    logInfo('Checking Agents API health endpoint (http://localhost:3002/health)...');

    try {
      await waitForServerReady(`http://localhost:3002/health`, 60000);
      logSuccess('Agents API is ready');
    } catch (error) {
      logError('Agents API failed to start within timeout', error);
      logWarning('Continuing anyway, but subsequent steps may fail');
    }

    // Check if any port errors occurred during startup
    if (portErrors.agentsApi) {
      displayPortConflictError(portErrors);
    }

    // Step 5: Set up CLI profile
    logStep(5, 'Setting up CLI profile');
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
    } catch (error) {
      const initCommand = isCloud ? 'inkeep init' : 'inkeep init --local';
      logWarning(`Could not set up CLI profile - you may need to run: ${initCommand}`);
    }

    // Step 6: Run inkeep push
    logStep(6, 'Running inkeep push command');
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
      // Step 7: Cleanup - Stop development servers
      logStep(7, 'Cleaning up - stopping development servers');

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

setupProjectInDatabase(isCloud).catch((error) => {
  logError('Unhandled error in setup', error);
  process.exit(1);
});
