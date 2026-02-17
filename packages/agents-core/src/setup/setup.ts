import { exec, spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import { loadEnvironmentFiles } from '../env.js';

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

function logStep(step: number, message: string) {
  console.log(`${colors.bright}${colors.blue}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string, error?: unknown) {
  console.error(`${colors.red}✗ ${message}${colors.reset}`);
  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${colors.dim}  Error details: ${msg}${colors.reset}`);
  }
}

function logWarning(message: string) {
  console.warn(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${message}`);
}

const execAsync = promisify(exec);

export interface SetupPushConfig {
  projectPath: string;
  configPath: string;
  apiKey?: string;
}

export interface SetupConfig {
  dockerComposeFile: string;
  manageMigrateCommand: string;
  runMigrateCommand: string;
  authInitCommand: string;

  pushProject?: SetupPushConfig;

  devApiCommand?: string;
  devUiCommand?: string;
  apiHealthUrl?: string;
  uiHealthUrl?: string;

  isCloud?: boolean;
  skipPush?: boolean;

  /** If set, upgrades packages instead of just migrating on subsequent runs */
  upgradeCommand?: string;
}

const SETUP_COMPLETE_FILE = '.setup-complete';

async function ensureEnvFile() {
  if (!existsSync('.env') && existsSync('.env.example')) {
    copyFileSync('.env.example', '.env');
    logSuccess('Created .env from .env.example');
  }
}

async function generateJwtKeys() {
  const envContent = await readFile('.env', 'utf-8').catch(() => '');
  if (
    envContent.includes('INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=') &&
    !envContent.includes('# INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=')
  ) {
    const match = envContent.match(/INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=(.+)/);
    if (match && match[1].trim().length > 0) {
      logInfo('JWT keys already configured, skipping generation');
      return;
    }
  }

  try {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
    const publicKeyBase64 = Buffer.from(publicKey).toString('base64');

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

    if (!privateKeyFound) lines.push(`INKEEP_AGENTS_TEMP_JWT_PRIVATE_KEY=${privateKeyBase64}`);
    if (!publicKeyFound) lines.push(`INKEEP_AGENTS_TEMP_JWT_PUBLIC_KEY=${publicKeyBase64}`);

    await writeFile('.env', lines.join('\n'));
    logSuccess('JWT keys generated and added to .env');
  } catch {
    logWarning('Failed to generate JWT keys - playground may not work');
    logInfo('You can manually run: pnpm run generate-jwt-keys');
  }
}

async function waitForDockerHealth(composeFile: string, serviceName: string, timeout = 30000) {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < timeout) {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.State.Health.Status}}' $(docker-compose -f ${composeFile} ps -q ${serviceName})`
      );
      if (stdout.trim() === 'healthy') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `${serviceName} not healthy after ${timeout}ms${lastError ? ` (last error: ${errorMsg})` : ''}`
  );
}

async function startDockerDatabases(composeFile: string) {
  logInfo('Starting database containers...');
  try {
    await execAsync(`docker-compose -f ${composeFile} up -d`);
    logSuccess('Database containers started');

    logInfo('Polling Docker health status...');

    const [doltgresResult, postgresResult] = await Promise.allSettled([
      waitForDockerHealth(composeFile, 'doltgres-db', 60000),
      waitForDockerHealth(composeFile, 'postgres-db', 30000),
    ]);

    if (doltgresResult.status === 'fulfilled') logSuccess('DoltgreSQL is healthy');
    else
      logWarning(`DoltgreSQL health check timed out: ${(doltgresResult.reason as Error).message}`);

    if (postgresResult.status === 'fulfilled') logSuccess('PostgreSQL is healthy');
    else
      logWarning(`PostgreSQL health check timed out: ${(postgresResult.reason as Error).message}`);

    if (doltgresResult.status === 'rejected' && postgresResult.status === 'rejected') {
      logError('Both databases failed health checks - cannot proceed');
      process.exit(1);
    }

    logSuccess('Database health checks complete');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stderr = (error as any)?.stderr || '';
    const combined = `${errorMessage}\n${stderr}`;

    const isPortConflict =
      combined.includes('port is already allocated') ||
      combined.includes('address already in use') ||
      combined.includes('Bind for 0.0.0.0:5432 failed') ||
      combined.includes('Bind for 0.0.0.0:5433 failed');

    if (isPortConflict) {
      logWarning('Database port already in use (databases might already be running)');
      logInfo('Continuing with setup...');
    } else {
      logError('Failed to start database containers', error);
      console.error(`\n${colors.red}${colors.bright}Common issues:${colors.reset}`);
      console.error(`${colors.yellow}  • Docker is not installed or not running${colors.reset}`);
      console.error(`${colors.yellow}  • Insufficient permissions to run Docker${colors.reset}`);
      console.error(`${colors.yellow}  • Docker Compose is not installed${colors.reset}`);
      process.exit(1);
    }
  }
}

async function runMigrations(config: SetupConfig) {
  const isFirstRun = !existsSync(SETUP_COMPLETE_FILE);

  if (config.upgradeCommand && !isFirstRun && process.env.SKIP_UPGRADE !== 'true') {
    logInfo('Running database migrations and upgrading packages');
    try {
      const { stdout } = await execAsync(config.upgradeCommand);
      if (stdout) console.log(`${colors.dim}  ${stdout.trim()}${colors.reset}`);
      logSuccess('Upgrades completed');
    } catch (error) {
      logError('Failed to run upgrades', error);
      logWarning('This may cause issues. Consider checking your database schema.');
    }
    return;
  }

  logInfo(
    isFirstRun ? 'Fresh install detected - running migrations only' : 'Running migrations...'
  );

  const [manageResult, runResult] = await Promise.allSettled([
    execAsync(config.manageMigrateCommand),
    execAsync(config.runMigrateCommand),
  ]);

  if (manageResult.status === 'fulfilled') logSuccess('Manage database migrations completed');
  else logWarning(`Manage migrations failed: ${(manageResult.reason as Error).message}`);

  if (runResult.status === 'fulfilled') logSuccess('Runtime database migrations completed');
  else logWarning(`Runtime migrations failed: ${(runResult.reason as Error).message}`);

  if (manageResult.status === 'rejected' && runResult.status === 'rejected') {
    logError('Both database migrations failed');
    process.exit(1);
  }

  if (manageResult.status === 'fulfilled' && runResult.status === 'fulfilled') {
    writeFileSync(SETUP_COMPLETE_FILE, new Date().toISOString());
  } else {
    logWarning(
      `Partial migration success — ${SETUP_COMPLETE_FILE} not written so next run retries`
    );
  }
}

async function initAuth(authInitCommand: string) {
  const hasCredentials =
    process.env.INKEEP_AGENTS_MANAGE_UI_USERNAME &&
    process.env.INKEEP_AGENTS_MANAGE_UI_PASSWORD &&
    process.env.BETTER_AUTH_SECRET;

  if (hasCredentials) {
    logInfo('Initializing default organization and admin user...');
    try {
      await execAsync(authInitCommand);
      logSuccess('Auth initialization complete');
    } catch (error) {
      logWarning(`Auth initialization failed - you may need to run manually: ${authInitCommand}`);
      logInfo(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    logWarning('Skipping auth initialization - credentials not configured');
    logInfo('To create a default admin user, set in .env:');
    logInfo('  INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com');
    logInfo('  INKEEP_AGENTS_MANAGE_UI_PASSWORD=your-password');
    logInfo('  BETTER_AUTH_SECRET=your-secret-key');
    logInfo(`Then run: ${authInitCommand}`);
  }
}

async function checkServerRunning(url: string, timeout = 5000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

async function waitForServerReady(url: string, timeout = 60000) {
  const start = Date.now();
  let lastError: string | null = null;
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok || response.status === 204) return;
      lastError = `HTTP ${response.status}`;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        lastError = 'fetch timeout (>5s per attempt)';
      } else {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server not ready at ${url} after ${timeout}ms. Last error: ${lastError}`);
}

interface SpawnedServers {
  apiProcess: ReturnType<typeof spawn> | null;
  uiProcess: ReturnType<typeof spawn> | null;
  startedApi: boolean;
  startedUi: boolean;
}

async function startServersIfNeeded(config: SetupConfig): Promise<SpawnedServers> {
  const result: SpawnedServers = {
    apiProcess: null,
    uiProcess: null,
    startedApi: false,
    startedUi: false,
  };

  if (!config.apiHealthUrl) return result;

  const apiRunning = await checkServerRunning(config.apiHealthUrl);
  if (apiRunning) {
    logSuccess('API server already running');
  } else if (config.devApiCommand) {
    logInfo('Starting API server temporarily...');
    result.apiProcess = spawn('sh', ['-c', config.devApiCommand], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
      cwd: process.cwd(),
    });
    result.startedApi = true;
    logSuccess(`API server process started (PID: ${result.apiProcess.pid})`);
  }

  if (config.uiHealthUrl) {
    const uiRunning = await checkServerRunning(config.uiHealthUrl);
    if (uiRunning) {
      logSuccess('Dashboard already running');
    } else if (config.devUiCommand) {
      logInfo('Starting Dashboard temporarily...');
      result.uiProcess = spawn('sh', ['-c', config.devUiCommand], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        cwd: process.cwd(),
      });
      result.startedUi = true;
      logSuccess(`Dashboard process started (PID: ${result.uiProcess.pid})`);
    }
  }

  // Wait for servers we started to be ready
  const waitPromises: Promise<void>[] = [];
  if (result.startedApi && config.apiHealthUrl) {
    logInfo(`Waiting for API at ${config.apiHealthUrl}...`);
    waitPromises.push(waitForServerReady(config.apiHealthUrl));
  }
  if (result.startedUi && config.uiHealthUrl) {
    logInfo(`Waiting for Dashboard at ${config.uiHealthUrl}...`);
    waitPromises.push(waitForServerReady(config.uiHealthUrl));
  }

  if (waitPromises.length > 0) {
    const results = await Promise.allSettled(waitPromises);
    for (const r of results) {
      if (r.status === 'rejected') {
        logWarning(`Server readiness check failed: ${(r.reason as Error).message}`);
      }
    }
  }

  return result;
}

async function stopProcess(proc: ReturnType<typeof spawn>, name: string) {
  if (!proc.pid) {
    logWarning(`${name} process PID not found, may still be running`);
    return;
  }
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /pid ${proc.pid} /T /F`);
    } else {
      process.kill(-proc.pid, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
    }
    logSuccess(`${name} stopped`);
  } catch {
    logWarning(`Could not cleanly stop ${name} - may still be running in background`);
  }
}

async function pushProject(pushConfig: SetupPushConfig) {
  if (!pushConfig.apiKey) {
    logWarning('No API key / bypass secret available — skipping project push');
    logInfo('Set INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET in .env to enable auto-push');
    return false;
  }

  logInfo(`Pushing project: ${pushConfig.projectPath}`);
  try {
    const { stdout } = await execAsync(
      `pnpm inkeep push --project ${pushConfig.projectPath} --config ${pushConfig.configPath}`
    );
    if (stdout) console.log(`${colors.dim}${stdout.trim()}${colors.reset}`);
    logSuccess('Project pushed successfully');
    return true;
  } catch (error) {
    logError('Project push failed', error);
    logWarning('The project may not have been seeded. You can manually run:');
    logInfo(
      `  pnpm inkeep push --project ${pushConfig.projectPath} --config ${pushConfig.configPath}`
    );
    return false;
  }
}

export async function runSetup(config: SetupConfig) {
  console.log(`\n${colors.bright}=== Project Setup ===${colors.reset}\n`);

  // Step 1: Ensure .env exists
  logStep(1, 'Checking environment configuration');
  await ensureEnvFile();

  // Reload env after ensuring .env exists
  loadEnvironmentFiles();
  dotenv.config();

  // Validate required database URLs (fail-fast)
  if (!config.isCloud) {
    const missing: string[] = [];
    if (!process.env.INKEEP_AGENTS_MANAGE_DATABASE_URL)
      missing.push('INKEEP_AGENTS_MANAGE_DATABASE_URL');
    if (!process.env.INKEEP_AGENTS_RUN_DATABASE_URL) missing.push('INKEEP_AGENTS_RUN_DATABASE_URL');
    if (missing.length > 0) {
      logError('Missing required database environment variables:');
      for (const v of missing) logInfo(`  - ${v}`);
      logInfo('Check your .env file and ensure these variables are set.');
      process.exit(1);
    }
  }

  // Step 2: Generate JWT keys
  logStep(2, 'Checking JWT keys');
  await generateJwtKeys();

  // Step 3: Start databases
  if (config.isCloud) {
    logStep(3, 'Cloud setup: Skipping Docker database startup');
  } else {
    logStep(3, 'Starting databases with Docker');
    await startDockerDatabases(config.dockerComposeFile);
  }

  // Step 4: Run migrations
  logStep(4, 'Running database migrations');
  await runMigrations(config);

  // Step 5: Auth init
  logStep(5, 'Initializing authentication');
  await initAuth(config.authInitCommand);

  // Steps 6-8: Project push (if configured)
  if (config.pushProject && !config.skipPush) {
    // Resolve apiKey from config or env
    const resolvedPush: SetupPushConfig = {
      ...config.pushProject,
      apiKey: config.pushProject.apiKey || process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET,
    };

    logStep(6, 'Checking server availability');
    const servers = await startServersIfNeeded(config);

    let pushSuccess = false;
    try {
      logStep(7, 'Pushing project to API');
      pushSuccess = await pushProject(resolvedPush);
    } finally {
      // Step 8: Cleanup — only stop servers we started
      if (servers.startedApi || servers.startedUi) {
        logStep(8, 'Cleaning up temporarily started servers');
        if (servers.startedApi && servers.apiProcess) {
          await stopProcess(servers.apiProcess, 'API server');
        }
        if (servers.startedUi && servers.uiProcess) {
          await stopProcess(servers.uiProcess, 'Dashboard');
        }
      }
    }

    console.log(`\n${colors.bright}=== Setup Complete ===${colors.reset}\n`);
    if (pushSuccess) {
      logSuccess('All steps completed successfully!');
    } else {
      logWarning('Setup completed with some warnings. See details above.');
    }
  } else {
    console.log(`\n${colors.bright}=== Setup Complete ===${colors.reset}\n`);
    logSuccess('Database setup completed!');
    if (!config.pushProject) {
      logInfo('No project push configured. Run "pnpm dev" to start development servers.');
    }
  }
}
