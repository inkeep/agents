import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import * as p from '@clack/prompts';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import fs from 'fs-extra';
import color from 'picocolors';
import {
  type ContentReplacement,
  cloneTemplate,
  cloneTemplateLocal,
  getAvailableTemplates,
} from './templates.js';

// Shared validation utility
const DIRECTORY_VALIDATION = {
  pattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
  reservedNames: /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i,
  minLength: 1,
  maxLength: 255,

  validate(value: string): string | undefined {
    if (!value || value.trim() === '') return 'Directory name is required';
    if (value.length < this.minLength || value.length > this.maxLength) {
      return `Directory name must be between ${this.minLength} and ${this.maxLength} characters`;
    }
    if (this.reservedNames.test(value)) {
      return 'Directory name cannot be a reserved system name';
    }
    if (!this.pattern.test(value)) {
      return 'Directory name can only contain letters, numbers, and hyphens (-), and underscores (_) and must start with a letter or number';
    }
    return undefined;
  },
};

const agentsTemplateRepo = 'https://github.com/inkeep/agents/create-agents-template';

const projectTemplateRepo = 'https://github.com/inkeep/agents/agents-cookbook/template-projects';
const execAsync = promisify(exec);

const manageApiPort = '3002';
const runApiPort = '3003';

export const defaultGoogleModelConfigurations = {
  base: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH,
  },
  structuredOutput: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
  summarizer: {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: OPENAI_MODELS.GPT_4_1,
  },
  structuredOutput: {
    model: OPENAI_MODELS.GPT_4_1_MINI,
  },
  summarizer: {
    model: OPENAI_MODELS.GPT_4_1_NANO,
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  structuredOutput: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
  summarizer: {
    model: ANTHROPIC_MODELS.CLAUDE_SONNET_4_5,
  },
};

type FileConfig = {
  dirName: string;
  tenantId: string;
  projectId: string;
  openAiKey?: string;
  anthropicKey?: string;
  googleKey?: string;
  modelSettings: Record<string, any>;
  customProject?: boolean;
  disableGit?: boolean;
  localPrefix?: string;
};

export const createAgents = async (
  args: {
    dirName?: string;
    templateName?: string;
    openAiKey?: string;
    anthropicKey?: string;
    googleKey?: string;
    template?: string;
    customProjectId?: string;
    disableGit?: boolean;
    localAgentsPrefix?: string;
    localTemplatesPrefix?: string;
  } = {}
) => {
  let {
    dirName,
    openAiKey,
    anthropicKey,
    googleKey,
    template,
    customProjectId,
    disableGit,
    localAgentsPrefix,
    localTemplatesPrefix,
  } = args;
  const tenantId = 'default';

  let projectId: string;
  let templateName: string;

  if (customProjectId) {
    projectId = customProjectId;
    templateName = '';
  } else if (template) {
    const availableTemplates = await getAvailableTemplates(localTemplatesPrefix);
    if (!availableTemplates.includes(template)) {
      p.cancel(
        `${color.red('✗')} Template "${template}" not found\n\n` +
          `${color.yellow('Available templates:')}\n` +
          `  • ${availableTemplates.join('\n  • ')}\n`
      );
      process.exit(0);
    }
    projectId = template;
    templateName = template;
  } else {
    projectId = 'activities-planner';
    templateName = 'activities-planner';
  }

  p.intro(color.inverse(' Create Agents Directory '));

  if (!dirName) {
    const dirResponse = await p.text({
      message: 'What do you want to name your agents directory?',
      placeholder: 'agents',
      defaultValue: 'agents',
      validate: (value) => DIRECTORY_VALIDATION.validate(value),
    });

    if (p.isCancel(dirResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    dirName = dirResponse as string;
  } else {
    // Validate the provided dirName
    const validationError = DIRECTORY_VALIDATION.validate(dirName);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  if (!anthropicKey && !openAiKey && !googleKey) {
    const providerChoice = await p.select({
      message: 'Which AI provider would you like to use?',
      options: [
        { value: 'anthropic', label: 'Anthropic' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'google', label: 'Google' },
      ],
    });

    if (p.isCancel(providerChoice)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    if (providerChoice === 'anthropic') {
      const anthropicKeyResponse = await p.password({
        message: 'Enter your Anthropic API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Anthropic API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(anthropicKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      anthropicKey = anthropicKeyResponse as string;
    } else if (providerChoice === 'openai') {
      const openAiKeyResponse = await p.password({
        message: 'Enter your OpenAI API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'OpenAI API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(openAiKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      openAiKey = openAiKeyResponse as string;
    } else if (providerChoice === 'google') {
      const googleKeyResponse = await p.password({
        message: 'Enter your Google API key:',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Google API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(googleKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      googleKey = googleKeyResponse as string;
    }
  }

  let defaultModelSettings = {};
  if (anthropicKey) {
    defaultModelSettings = defaultAnthropicModelConfigurations;
  } else if (openAiKey) {
    defaultModelSettings = defaultOpenaiModelConfigurations;
  } else if (googleKey) {
    defaultModelSettings = defaultGoogleModelConfigurations;
  }

  if (Object.keys(defaultModelSettings).length === 0) {
    p.cancel(
      'Cannot continue without a model configuration for project. Please provide an API key for at least one AI provider.'
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Creating directory structure...');

  try {
    const directoryPath = path.resolve(process.cwd(), dirName);

    if (await fs.pathExists(directoryPath)) {
      s.stop();
      const overwrite = await p.confirm({
        message: `Directory ${dirName} already exists. Do you want to overwrite it?`,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      s.start('Cleaning existing directory...');
      await fs.emptyDir(directoryPath);
    }

    s.message('Building template (this may take a while)...');
    await cloneTemplateHelper({
      targetPath: directoryPath,
      localPrefix: localAgentsPrefix,
    });

    process.chdir(directoryPath);

    const config = {
      dirName,
      tenantId,
      projectId,
      openAiKey,
      anthropicKey,
      googleKey,
      modelSettings: defaultModelSettings,
      customProject: !!customProjectId,
      disableGit: disableGit,
    };

    s.message('Setting up project structure...');
    await createWorkspaceStructure();

    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

    if (templateName && templateName.length > 0) {
      s.message('Creating project template folder...');
      const templateTargetPath = `src/projects/${projectId}`;

      const contentReplacements: ContentReplacement[] = [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultModelSettings,
          },
        },
      ];
      await cloneTemplateHelper({
        templateName,
        targetPath: templateTargetPath,
        localPrefix: localTemplatesPrefix,
        replacements: contentReplacements,
      });
    } else {
      s.message('Creating empty project folder...');
      await fs.ensureDir(`src/projects/${projectId}`);
    }

    s.message('Creating inkeep.config.ts...');
    await createInkeepConfig(config);

    s.message('Installing dependencies (this may take a while)...');
    await installDependencies();

    if (!config.disableGit) {
      await initializeGit();
    }

    s.message('Setting up database...');
    await setupDatabase();

    s.message('Pushing project...');
    await setupProjectInDatabase(config);
    s.message('Project setup complete!');

    s.stop();

    p.note(
      `${color.green('✓')} Project created at: ${color.cyan(directoryPath)}\n\n` +
        `${color.yellow('Ready to go!')}\n\n` +
        `${color.green('✓')} Project created in file system\n` +
        `${color.green('✓')} Database configured\n` +
        `${color.green('✓')} Project added to database\n\n` +
        `${color.yellow('Next steps:')}\n` +
        `  cd ${dirName}\n` +
        `  pnpm dev     # Start development servers\n\n` +
        `${color.yellow('Available services:')}\n` +
        `  • Manage API: http://localhost:3002\n` +
        `  • Run API: http://localhost:3003\n` +
        `  • Manage UI: Available with management API\n` +
        `\n${color.yellow('Configuration:')}\n` +
        `  • Edit .env for environment variables\n` +
        `  • Edit files in src/projects/${projectId}/ for agent definitions\n` +
        `  • Use 'inkeep push' to deploy agents to the platform\n`,
      'Ready to go!'
    );
  } catch (error) {
    s.stop();
    p.cancel(
      `Error creating directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
};

async function createWorkspaceStructure() {
  await fs.ensureDir(`src`);
}

async function createEnvironmentFiles(config: FileConfig) {
  // Convert to forward slashes for cross-platform SQLite URI compatibility
  const dbPath = process.cwd().replace(/\\/g, '/');

  const jwtSigningSecret = crypto.randomBytes(32).toString('hex');

  const envContent = `# Environment
ENVIRONMENT=development

# Database
DB_FILE_NAME=file:${dbPath}/local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}
GOOGLE_GENERATIVE_AI_API_KEY=${config.googleKey || 'your-google-key-here'}

# Inkeep API URLs
INKEEP_AGENTS_MANAGE_API_URL="http://localhost:3002"
INKEEP_AGENTS_RUN_API_URL="http://localhost:3003"

# SigNoz Configuration
SIGNOZ_URL=your-signoz-url-here
SIGNOZ_API_KEY=your-signoz-api-key-here

# OTEL Configuration
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://ingest.us.signoz.cloud:443/v1/traces
OTEL_EXPORTER_OTLP_TRACES_HEADERS="signoz-ingestion-key=<your-ingestion-key>"

# Nango Configuration
NANGO_SECRET_KEY=

# JWT Signing Secret
INKEEP_AGENTS_JWT_SIGNING_SECRET=${jwtSigningSecret}
`;

  await fs.writeFile('.env', envContent);
}

async function createInkeepConfig(config: FileConfig) {
  const inkeepConfig = `import { defineConfig } from '@inkeep/agents-cli/config';
    
const config = defineConfig({
  tenantId: "${config.tenantId}",
  agentsManageApi: {
    url: 'http://localhost:3002',
  },
  agentsRunApi: {
    url: 'http://localhost:3003',
  },
});
    
export default config;`;
  await fs.writeFile(`src/inkeep.config.ts`, inkeepConfig);

  if (config.customProject) {
    const customIndexContent = `import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: "${config.projectId}",
  name: "${config.projectId}",
  description: "",
  agent: () => [],
  models: ${JSON.stringify(config.modelSettings, null, 2)},
});`;
    await fs.writeFile(`src/projects/${config.projectId}/index.ts`, customIndexContent);
  }
}

async function installDependencies() {
  await execAsync('pnpm install');
  await execAsync('pnpm upgrade-agents');
}

async function initializeGit() {
  try {
    await execAsync('git init');
    await execAsync('git add .');
    await execAsync('git commit -m "Initial commit from inkeep/create-agents"');
  } catch (error) {
    console.error(
      'Error initializing git:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      // Only treat EADDRINUSE as "port in use", other errors might be transient
      resolve(err.code === 'EADDRINUSE' ? false : true);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, 'localhost');
  });
}
/**
 * Display port conflict error and exit
 */
function displayPortConflictError(unavailablePorts: {
  runApi: boolean;
  manageApi: boolean;
}): never {
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

/**
 * Check port availability and display errors if needed
 */
async function checkPortsAvailability(): Promise<void> {
  const [runApiAvailable, manageApiAvailable] = await Promise.all([
    isPortAvailable(Number(runApiPort)),
    isPortAvailable(Number(manageApiPort)),
  ]);

  if (!runApiAvailable || !manageApiAvailable) {
    displayPortConflictError({
      runApi: !runApiAvailable,
      manageApi: !manageApiAvailable,
    });
  }
}

/**
 * Wait for a server to be ready by polling a health endpoint
 */
async function waitForServerReady(url: string, timeout: number): Promise<void> {
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

async function setupProjectInDatabase(config: FileConfig) {
  // Proactively check if ports are available BEFORE starting servers
  await checkPortsAvailability();

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

  // Monitor output for port errors (fallback in case ports become unavailable between check and start)
  const checkForPortErrors = (data: Buffer) => {
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
    await waitForServerReady(`http://localhost:${manageApiPort}/health`, 60000);
    await waitForServerReady(`http://localhost:${runApiPort}/health`, 60000);
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
      `pnpm inkeep push --project src/projects/${config.projectId} --config src/inkeep.config.ts`
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

async function setupDatabase() {
  try {
    await execAsync('pnpm db:migrate');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    throw new Error(
      `Failed to setup database: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function cloneTemplateHelper(options: {
  targetPath: string;
  templateName?: string;
  localPrefix?: string;
  replacements?: ContentReplacement[];
}) {
  const { targetPath, templateName, localPrefix, replacements } = options;
  // If local prefix is provided, use it to clone the template. This is useful for local development and testing.
  if (localPrefix && localPrefix.length > 0) {
    if (templateName) {
      const fullTemplatePath = path.join(localPrefix, templateName);
      await cloneTemplateLocal(fullTemplatePath, targetPath, replacements);
    } else {
      await cloneTemplateLocal(localPrefix, targetPath, replacements);
    }
  } else {
    if (templateName) {
      await cloneTemplate(`${projectTemplateRepo}/${templateName}`, targetPath, replacements);
    } else {
      await cloneTemplate(agentsTemplateRepo, targetPath, replacements);
    }
  }
}

export async function createCommand(dirName?: string, options?: any) {
  await createAgents({
    dirName,
    ...options,
  });
}
