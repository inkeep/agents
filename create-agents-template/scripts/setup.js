#!/usr/bin/env node

import { loadEnvironmentFiles } from '@inkeep/agents-core';
import dotenv from 'dotenv';

loadEnvironmentFiles();

// Load environment variables
dotenv.config();

const projectId = process.env.DEFAULT_PROJECT_ID;
const manageApiPort = '3002';
const runApiPort = '3003';

async function setupProjectInDatabase() {
  const { promisify } = await import('node:util');
  const { exec } = await import('node:child_process');
  const execAsync = promisify(exec);

  // Start database first
  console.log('Starting PostgreSQL database...');
  try {
    await execAsync('docker-compose up -d -f docker-compose.db.yml');
    console.log('Waiting for database to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s for DB to start
  } catch (error) {
    console.error('Failed to start database:', error);
    // Continue anyway in case it's already running
  }

  // Start development servers in background
  const { spawn } = await import('node:child_process');
  const devProcess = spawn('pnpm', ['dev:apis'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    cwd: process.cwd(),
    shell: true,
    windowsHide: true,
  });

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
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet, continue polling
      }
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second
    }
    throw new Error(`Server not ready at ${url} after ${timeout}ms`);
  }

  /**
   * Display port conflict error and exit
   */
  function displayPortConflictError(unavailablePorts) {
    let errorMessage = '';
    if (unavailablePorts.runApi) {
      errorMessage += `${color.red(`Run API port ${runApiPort} is already in use`)}\n`;
    }
    if (unavailablePorts.manageApi) {
      errorMessage += `${color.red(`Manage API port ${manageApiPort} is already in use`)}\n`;
    }

    p.cancel(
      `\n${color.red('✗ Port conflicts detected')}\n\n` +
        `${errorMessage}\n` +
        `${color.yellow('Please free up the ports and try again.')}\n`
    );
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

  // Wait for servers to be ready
  try {
    await waitForServerReady(`http://localhost:3002/health`, 60000);
    await waitForServerReady(`http://localhost:3003/health`, 60000);
  } catch (error) {
    // If servers don't start, we'll still try push but it will likely fail
    console.warn(
      'Warning: Servers may not be fully ready:',
      error instanceof Error ? error.message : String(error)
    );
  }

  // Check if any port errors occurred during startup
  if (portErrors.runApi || portErrors.manageApi) {
    displayPortConflictError(portErrors);
  }

  // Run inkeep push
  try {
    await execAsync(
      `pnpm inkeep push --project src/projects/${projectId} --config src/inkeep.config.ts`
    );
  } catch (_error) {
  } finally {
    if (devProcess.pid) {
      try {
        if (process.platform === 'win32') {
          // Windows: Use taskkill to kill process tree
          await execAsync(`taskkill /pid ${devProcess.pid} /T /F`);
        } else {
          // Unix: Use negative PID to kill process group
          process.kill(-devProcess.pid, 'SIGTERM');

          await new Promise((resolve) => setTimeout(resolve, 1000));

          try {
            process.kill(-devProcess.pid, 'SIGKILL');
          } catch {}
        }
      } catch (_error) {
        console.log('Note: Dev servers may still be running in background');
      }
    }
  }
}

setupProjectInDatabase();
