import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import * as p from '@clack/prompts';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@inkeep/agents-core';
import fs from 'fs-extra';
import color from 'picocolors';
import { type ContentReplacement, cloneTemplate, getAvailableTemplates } from './templates.js';

const DIRECTORY_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DIRECTORY_NAME_ERROR =
  'Directory name can only contain letters, numbers, hyphens (-), and underscores (_)';

const execAsync = promisify(exec);

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
  manageApiPort?: string;
  runApiPort?: string;
  modelSettings: Record<string, any>;
  customProject?: boolean;
  disableGit?: boolean;
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
  } = {}
) => {
  let { dirName, openAiKey, anthropicKey, googleKey, template, customProjectId, disableGit } = args;
  const tenantId = 'default';
  const manageApiPort = '3002';
  const runApiPort = '3003';

  let projectId: string;
  let templateName: string;

  if (customProjectId) {
    projectId = customProjectId;
    templateName = '';
  } else if (template) {
    const availableTemplates = await getAvailableTemplates();
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
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Directory name is required';
        }
        if (!DIRECTORY_NAME_PATTERN.test(value)) {
          return DIRECTORY_NAME_ERROR;
        }
        return undefined;
      },
    });

    if (p.isCancel(dirResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    dirName = dirResponse as string;
  } else {
    // Validate the provided dirName
    if (!DIRECTORY_NAME_PATTERN.test(dirName)) {
      throw new Error(DIRECTORY_NAME_ERROR);
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
    const agentsTemplateRepo = 'https://github.com/inkeep/create-agents-template';

    const projectTemplateRepo = templateName
      ? `https://github.com/inkeep/agents-cookbook/template-projects/${templateName}`
      : null;

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

    s.message('Building template...');
    await cloneTemplate(agentsTemplateRepo, directoryPath);

    process.chdir(directoryPath);

    const config = {
      dirName,
      tenantId,
      projectId,
      openAiKey,
      anthropicKey,
      googleKey,
      manageApiPort: manageApiPort || '3002',
      runApiPort: runApiPort || '3003',
      modelSettings: defaultModelSettings,
      customProject: !!customProjectId,
      disableGit: disableGit,
    };

    s.message('Setting up project structure...');
    await createWorkspaceStructure();

    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

    if (projectTemplateRepo) {
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

      await cloneTemplate(projectTemplateRepo, templateTargetPath, contentReplacements);
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
        `  • Manage API: http://localhost:${manageApiPort || '3002'}\n` +
        `  • Run API: http://localhost:${runApiPort || '3003'}\n` +
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
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
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

async function setupProjectInDatabase(config: FileConfig) {
  const { spawn } = await import('node:child_process');
  const devProcess = spawn('pnpm', ['dev:apis'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    cwd: process.cwd(),
    shell: true,
    windowsHide: true,
  });

  await new Promise((resolve) => setTimeout(resolve, 5000));

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

export async function createCommand(dirName?: string, options?: any) {
  await createAgents({
    dirName,
    ...options,
  });
}
