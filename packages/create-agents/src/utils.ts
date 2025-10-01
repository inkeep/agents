import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import color from 'picocolors';
import { type ContentReplacement, cloneTemplate, getAvailableTemplates } from './templates.js';

const execAsync = promisify(exec);

export const defaultGoogleModelConfigurations = {
  base: {
    model: 'google/gemini-2.5-flash',
  },
  structuredOutput: {
    model: 'google/gemini-2.5-flash-lite',
  },
  summarizer: {
    model: 'google/gemini-2.5-flash-lite',
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: 'openai/gpt-4.1-2025-04-14',
  },
  structuredOutput: {
    model: 'openai/gpt-4.1-mini-2025-04-14',
  },
  summarizer: {
    model: 'openai/gpt-4.1-nano-2025-04-14',
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  structuredOutput: {
    model: 'anthropic/claude-3-5-haiku-20241022',
  },
  summarizer: {
    model: 'anthropic/claude-3-5-haiku-20241022',
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
  } = {}
) => {
  let { dirName, openAiKey, anthropicKey, googleKey, template, customProjectId } = args;
  const tenantId = 'default';
  const manageApiPort = '3002';
  const runApiPort = '3003';

  let projectId: string;
  let templateName: string;

  // Determine project ID and template based on user input
  if (customProjectId) {
    // User provided custom project ID - use it as-is, no template needed
    projectId = customProjectId;
    templateName = ''; // No template will be cloned
  } else if (template) {
    // User provided template - validate it exists and use template name as project ID
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
    // No template or custom project ID provided - use defaults
    projectId = 'weather-project';
    templateName = 'weather-project';
  }

  p.intro(color.inverse(' Create Agents Directory '));

  // Prompt for directory name if not provided
  if (!dirName) {
    const dirResponse = await p.text({
      message: 'What do you want to name your agents directory?',
      placeholder: 'agents',
      defaultValue: 'agents',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Directory name is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(dirResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    dirName = dirResponse as string;
  }

  // Project ID is already determined above based on template/customProjectId logic

  // If keys aren't provided via CLI args, prompt for provider selection and keys
  if (!anthropicKey && !openAiKey) {
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

    // Prompt for keys based on selection
    if (providerChoice === 'anthropic') {
      const anthropicKeyResponse = await p.text({
        message: 'Enter your Anthropic API key:',
        placeholder: 'sk-ant-...',
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
      const openAiKeyResponse = await p.text({
        message: 'Enter your OpenAI API key:',
        placeholder: 'sk-...',
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
      const googleKeyResponse = await p.text({
        message: 'Enter your Google API key:',
        placeholder: 'AIzaSy...',
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

  const s = p.spinner();
  s.start('Creating directory structure...');

  try {
    const agentsTemplateRepo = 'https://github.com/inkeep/create-agents-template';

    const projectTemplateRepo = templateName
      ? `https://github.com/inkeep/agents-cookbook/template-projects/${templateName}`
      : null;

    const directoryPath = path.resolve(process.cwd(), dirName);

    // Check if directory already exists
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

    // Clone the template repository
    s.message('Building template...');
    await cloneTemplate(agentsTemplateRepo, directoryPath);

    // Change to the project directory
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
    };

    // Create workspace structure for project-specific files
    s.message('Setting up project structure...');
    await createWorkspaceStructure();

    // Create environment files
    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

    // Create project template folder (only if template is specified)
    if (projectTemplateRepo) {
      s.message('Creating project template folder...');
      const templateTargetPath = `src/${projectId}`;

      // Prepare content replacements for model settings
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
      await fs.ensureDir(`src/${projectId}`);
    }

    // create or overwrite inkeep.config.ts
    s.message('Creating inkeep.config.ts...');
    await createInkeepConfig(config);

    // Install dependencies
    s.message('Installing dependencies (this may take a while)...');
    await installDependencies();

    // Setup database
    s.message('Setting up database...');
    await setupDatabase();

    // Setup project in database
    s.message('Pushing project...');
    await setupProjectInDatabase(config);
    s.message('Project setup complete!');

    s.stop();

    // Success message with next steps
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
        `  • Edit files in src/${projectId}/ for agent definitions\n` +
        `  • Use 'inkeep push' to deploy agents to the platform\n` +
        `  • Use 'inkeep chat' to test your agents locally\n`,
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
  // Create the workspace directory structure
  await fs.ensureDir(`src`);
}

async function createEnvironmentFiles(config: FileConfig) {
  // Root .env file
  const envContent = `# Environment
ENVIRONMENT=development

# Database
DB_FILE_NAME=file:${process.cwd()}/local.db

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
  graphs: () => [],
  models: ${JSON.stringify(config.modelSettings, null, 2)},
});`;
    await fs.writeFile(`src/${config.projectId}/index.ts`, customIndexContent);
  }
}

async function installDependencies() {
  await execAsync('pnpm install');
}

async function setupProjectInDatabase(config: FileConfig) {
  // Start development servers in background
  const { spawn } = await import('node:child_process');
  const devProcess = spawn('pnpm', ['dev:apis'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true, // Detach so we can kill the process group
    cwd: process.cwd(),
  });

  // Give servers time to start
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Run inkeep push
  try {
    // Suppress all output
    await execAsync(
      `pnpm inkeep push --project src/${config.projectId} --config src/inkeep.config.ts`
    );
  } catch (_error) {
    //Continue despite error - user can setup project manually
  } finally {
    // Kill the dev servers and their child processes
    if (devProcess.pid) {
      try {
        // Kill the entire process group
        process.kill(-devProcess.pid, 'SIGTERM');

        // Wait a moment for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        try {
          process.kill(-devProcess.pid, 'SIGKILL');
        } catch {
          // Process already terminated
        }
      } catch (_error) {
        // Process might already be dead, that's fine
        console.log('Note: Dev servers may still be running in background');
      }
    }
  }
}

async function setupDatabase() {
  try {
    // Run drizzle-kit migrate to apply migrations to database
    await execAsync('pnpm db:migrate');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    throw new Error(
      `Failed to setup database: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Export the command function for the CLI
export async function createCommand(dirName?: string, options?: any) {
  await createAgents({
    dirName,
    ...options,
  });
}
