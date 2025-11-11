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

    await checkPortsAvailability();

    s.stop();

    p.note(
      `${color.green('✓')} Workspace created at: ${color.cyan(directoryPath)}\n\n` +
        `${color.yellow('Next steps:')}\n` +
        `  cd ${dirName}\n` +
        `  pnpm setup   # Setup project in database\n` +
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

  const jwtSigningSecret = crypto.randomBytes(32).toString('hex');

  const envContent = `# Environment
ENVIRONMENT=development

# Database
DATABASE_URL=postgresql://appuser:password@localhost:5432/inkeep_agents

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

# initial project information
DEFAULT_PROJECT_ID=${config.projectId}
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
  try {
    await execAsync('pnpm upgrade-agents');
  } catch (error) {
    console.warn('Warning: Package upgrade failed, continuing with current versions');
    console.warn(error instanceof Error ? error.message : 'Unknown error');
  }
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
