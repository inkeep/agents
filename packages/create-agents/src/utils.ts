import * as p from '@clack/prompts';
import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import color from 'picocolors';
import { promisify } from 'util';
import { cloneTemplate, getAvailableTemplates } from './templates.js';

const execAsync = promisify(exec);

export const defaultGeminiModelConfigurations = {
  base: {
    model: 'gemini/gemini-2.5-flash',
  },
  structuredOutput: {
    model: 'gemini/gemini-2.5-flash-lite',
  },
  summarizer: {
    model: 'gemini/gemini-2.5-flash-lite',
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: 'openai/gpt-5-2025-08-07',
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
  geminiKey?: string;
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
    geminiKey?: string;
    template?: string;
    customProjectId?: string;
  } = {}
) => {
  let { dirName, openAiKey, anthropicKey, geminiKey, template, customProjectId } = args;
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
    projectId = 'weather-graph';
    templateName = 'weather-graph';
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
      message: 'Which AI provider(s) would you like to use?',
      options: [
        { value: 'anthropic', label: 'Anthropic only' },
        { value: 'openai', label: 'OpenAI only' },
        { value: 'gemini', label: 'Gemini only' },
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
    } else if (providerChoice === 'gemini') {
      const geminiKeyResponse = await p.text({
        message: 'Enter your Gemini API key:',
        placeholder: 'AIzaSy...',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'Gemini API key is required';
          }
          return undefined;
        },
      });

      if (p.isCancel(geminiKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      geminiKey = geminiKeyResponse as string;
    }
  }

  let defaultModelSettings = {};
  if (anthropicKey) {
    defaultModelSettings = defaultAnthropicModelConfigurations;
  } else if (openAiKey) {
    defaultModelSettings = defaultOpenaiModelConfigurations;
  } else if (geminiKey) {
    defaultModelSettings = defaultGeminiModelConfigurations;
  }

  const s = p.spinner();
  s.start('Creating directory structure...');

  try {
    const agentsTemplateRepo = 'https://github.com/inkeep/create-agents-template';

    const projectTemplateRepo = templateName
      ? `https://github.com/inkeep/agents-cookbook/templates/${templateName}`
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
      manageApiPort: manageApiPort || '3002',
      runApiPort: runApiPort || '3003',
      modelSettings: defaultModelSettings,
      customProject: customProjectId ? true : false,
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
      await cloneTemplate(projectTemplateRepo, templateTargetPath);
    } else {
      s.message('Creating empty project folder...');
      await fs.ensureDir(`src/${projectId}`);
    }

    // create or overwrite inkeep.config.ts
    s.message('Creating inkeep.config.ts...');
    await createInkeepConfig(config);

    // Create service files
    s.message('Creating service files...');
    await createServiceFiles(config);

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
DB_FILE_NAME=file:./local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}
GEMINI_API_KEY=${config.geminiKey || 'your-gemini-key-here'}

# Logging
LOG_LEVEL=debug

# Service Ports
MANAGE_API_PORT=${config.manageApiPort}
RUN_API_PORT=${config.runApiPort}

# UI Configuration (for dashboard)

`;

  await fs.writeFile('.env', envContent);

  // Create .env.example
  const envExample = envContent.replace(/=.+$/gm, '=');
  await fs.writeFile('.env.example', envExample);

  // Create .env files for each API service
  const runApiEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from API directory)
DB_FILE_NAME=file:../../local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}
GEMINI_API_KEY=${config.geminiKey || 'your-gemini-key-here'}

AGENTS_RUN_API_URL=http://localhost:${config.runApiPort}
`;

  const manageApiEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from API directory)
DB_FILE_NAME=file:../../local.db

AGENTS_MANAGE_API_URL=http://localhost:${config.manageApiPort}
`;

  await fs.writeFile('apps/manage-api/.env', manageApiEnvContent);
  await fs.writeFile('apps/run-api/.env', runApiEnvContent);
}

async function createServiceFiles(config: FileConfig) {
  // Create .env file for the project directory (for inkeep CLI commands)
  const projectEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from project directory)
DB_FILE_NAME=file:../../local.db
`;

  await fs.writeFile(`src/${config.projectId}/.env`, projectEnvContent);
}

async function createInkeepConfig(config: FileConfig) {
  const inkeepConfig = `import { defineConfig } from '@inkeep/agents-cli/config';

  const config = defineConfig({
    tenantId: "${config.tenantId}",
    projectId: "${config.projectId}",
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3003',
    modelSettings: ${JSON.stringify(config.modelSettings, null, 2)},
  });
      
  export default config;`;
  await fs.writeFile(`src/${config.projectId}/inkeep.config.ts`, inkeepConfig);

  if (config.customProject) {
    const customIndexContent = `import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: "${config.projectId}",
  name: "${config.projectId}",
  description: "",
  graphs: () => [],
});`;
    await fs.writeFile(`src/${config.projectId}/index.ts`, customIndexContent);
  }
}

async function createTurboConfig() {
  const turboConfig = {
    $schema: 'https://turbo.build/schema.json',
    ui: 'tui',
    globalDependencies: ['**/.env', '**/.env.local', '**/.env.*'],
    globalEnv: [
      'NODE_ENV',
      'CI',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'ENVIRONMENT',
      'DB_FILE_NAME',
      'MANAGE_API_PORT',
      'RUN_API_PORT',
      'LOG_LEVEL',
      'NANGO_SECRET_KEY',
    ],
    tasks: {
      build: {
        dependsOn: ['^build'],
        inputs: ['$TURBO_DEFAULT$', '.env*'],
        outputs: ['dist/**', 'build/**', '.next/**', '!.next/cache/**'],
      },
      dev: {
        cache: false,
        persistent: true,
      },
      start: {
        dependsOn: ['build'],
        cache: false,
      },
      'db:push': {
        cache: false,
        inputs: ['drizzle.config.ts', 'src/data/db/schema.ts'],
      },
    },
  };

  await fs.writeJson('turbo.json', turboConfig, { spaces: 2 });
}

async function createDocumentation(config: FileConfig) {
  const readme = `# ${config.dirName}

An Inkeep Agent Framework project with multi-service architecture.

## Architecture

This project follows a workspace structure with the following services:

- **Agents Manage API** (Port 3002): Agent configuration and managemen
  - Handles entity management and configuration endpoints.
- **Agents Run API** (Port 3003): Agent execution and chat processing  
  - Handles agent communication. You can interact with your agents either over MCP from an MCP client or through our React UI components library
- **Agents Manage UI** (Port 3000): Web interface available via \`inkeep dev\`
  - The agent framework visual builder. From the builder you can create, manage and visualize all your graphs.

## Quick Start
1. **Install the Inkeep CLI:**
   \`\`\`bash
   pnpm install -g @inkeep/agents-cli
   \`\`\`

1. **Start services:**
   \`\`\`bash
   # Start Agents Manage API and Agents Run API
   pnpm dev
   
   # Start the Dashboard
   inkeep dev
   \`\`\`

3. **Deploy your first agent graph:**
   \`\`\`bash
   # Navigate to your project's graph directory
   cd src/${config.projectId}/
   
   # Push the weather graph to create it
   inkeep push weather.graph.ts
   \`\`\`
  - Follow the prompts to create the project and graph
  - Click on the "View graph in UI:" link to see the graph in the management dashboard

## Project Structure

\`\`\`
${config.dirName}/
├── src/
│   ├── /${config.projectId}              # Agent configurations
├── apps/
│   ├── manage-api/          # Agents Manage API service
│   ├── run-api/             # Agents Run API service
│   └── shared/              # Shared code between API services
│       └── credential-stores.ts  # Shared credential store configuration
├── turbo.json               # Turbo configuration
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── package.json             # Root package configuration
\`\`\`

## Configuration

### Environment Variables

Environment variables are defined in the following places:

- \`apps/manage-api/.env\`: Agents Manage API environment variables
- \`apps/run-api/.env\`: Agents Run API environment variables
- \`src/${config.projectId}/.env\`: Inkeep CLI environment variables
- \`.env\`: Root environment variables 

To change the API keys used by your agents modify \`apps/run-api/.env\`. You are required to define at least one LLM provider key.

\`\`\`bash
# AI Provider Keys
ANTHROPIC_API_KEY=your-anthropic-key-here
OPENAI_API_KEY=your-openai-key-here
\`\`\`



### Agent Configuration

Your graphs are defined in \`src/${config.projectId}/weather.graph.ts\`. The default setup includes:

- **Weather Graph**: A graph that can forecast the weather in a given location.

Your inkeep configuration is defined in \`src/${config.projectId}/inkeep.config.ts\`. The inkeep configuration is used to configure defaults for the inkeep CLI. The configuration includes:

- \`tenantId\`: The tenant ID
- \`projectId\`: The project ID
- \`agentsManageApiUrl\`: The Manage API URL
- \`agentsRunApiUrl\`: The Run API URL


## Development

### Updating Your Agents

1. Edit \`src/${config.projectId}/weather.graph.ts\`
2. Push the graph to the platform to update: \`inkeep pus weather.graph.ts\` 

### API Documentation

Once services are running, view the OpenAPI documentation:

- Manage API: http://localhost:${config.manageApiPort}/docs
- Run API: http://localhost:${config.runApiPort}/docs

## Learn More

- [Inkeep Documentation](https://docs.inkeep.com)

## Troubleshooting

## Inkeep CLI commands

- Ensure you are runnning commands from \`cd src/${config.projectId}\`.
- Validate the \`inkeep.config.ts\` file has the correct api urls.
- Validate that the \`.env\` file in \`src/${config.projectId}\` has the correct \`DB_FILE_NAME\`.

### Services won't start

1. Ensure all dependencies are installed: \`pnpm install\`
2. Check that ports 3000-3003 are available

### Agents won't respond

1. Ensure that the Agents Run API is running and includes a valid Anthropic or OpenAI API key in its .env file
`;

  await fs.writeFile('README.md', readme);
}

async function installDependencies() {
  await execAsync('pnpm install');
}

async function setupProjectInDatabase(config: FileConfig) {
  // Start development servers in background
  const { spawn } = await import('child_process');
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
    const { stdout, stderr } = await execAsync(
      `pnpm inkeep push --project src/${config.projectId}`
    );
  } catch (error) {
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
      } catch (error) {
        // Process might already be dead, that's fine
        console.log('Note: Dev servers may still be running in background');
      }
    }
  }
}

async function setupDatabase() {
  try {
    // Run drizzle-kit push to create database file and apply schema
    await execAsync('pnpm db:push');
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
