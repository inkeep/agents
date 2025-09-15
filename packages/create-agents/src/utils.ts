import color from 'picocolors';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { cloneTemplate } from './template.js';

const execAsync = promisify(exec);

export const defaultDualModelConfigurations = {
  base: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  structuredOutput: {
    model: 'openai/gpt-4.1-mini-2025-04-14',
  },
  summarizer: {
    model: 'openai/gpt-4.1-nano-2025-04-14',
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
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  summarizer: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
};

type FileConfig = {
  dirName: string;
  tenantId?: string;
  projectId?: string;
  openAiKey?: string;
  anthropicKey?: string;
  manageApiPort?: string;
  runApiPort?: string;
  modelSettings: Record<string, any>;
};

export const createAgents = async (
  args: { projectId?: string; dirName?: string; openAiKey?: string; anthropicKey?: string } = {}
) => {
  let { projectId, dirName, openAiKey, anthropicKey } = args;
  const tenantId = 'default';
  const manageApiPort = '3002';
  const runApiPort = '3003';

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

  // Prompt for project ID
  if (!projectId) {
    const projectIdResponse = await p.text({
      message: 'What do you want to name your project?',
      placeholder: '(default)',
      defaultValue: 'default',
    });

    if (p.isCancel(projectIdResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    projectId = projectIdResponse as string;
  }

  // If keys aren't provided via CLI args, prompt for provider selection and keys
  if (!anthropicKey && !openAiKey) {
    const providerChoice = await p.select({
      message: 'Which AI provider(s) would you like to use?',
      options: [
        { value: 'anthropic', label: 'Anthropic only' },
        { value: 'openai', label: 'OpenAI only' },
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
    }

    if (providerChoice === 'openai') {
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
    }
  } else {
    // If some keys are provided via CLI args, prompt for missing ones
    if (!anthropicKey) {
      const anthropicKeyResponse = await p.text({
        message: 'Enter your Anthropic API key (optional):',
        placeholder: 'sk-ant-...',
        defaultValue: '',
      });

      if (p.isCancel(anthropicKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      anthropicKey = (anthropicKeyResponse as string) || undefined;
    }

    if (!openAiKey) {
      const openAiKeyResponse = await p.text({
        message: 'Enter your OpenAI API key (optional):',
        placeholder: 'sk-...',
        defaultValue: '',
      });

      if (p.isCancel(openAiKeyResponse)) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      openAiKey = (openAiKeyResponse as string) || undefined;
    }
  }

  let defaultModelSettings = {};
  if (anthropicKey && openAiKey) {
    defaultModelSettings = defaultDualModelConfigurations;
  } else if (anthropicKey) {
    defaultModelSettings = defaultAnthropicModelConfigurations;
  } else if (openAiKey) {
    defaultModelSettings = defaultOpenaiModelConfigurations;
  }

  const s = p.spinner();
  s.start('Creating directory structure...');

  try {
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
    await cloneTemplate(directoryPath);

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
    };

    // Create workspace structure for project-specific files
    s.message('Setting up project structure...');
    await createWorkspaceStructure(projectId);

    // Create environment files
    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

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
    s.message('Setting up project in database...');
    await setupProjectInDatabase();

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
        `  • Edit src/${projectId}/weather.graph.ts for agent definitions\n` +
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

async function createWorkspaceStructure(projectId: string) {
  // Create the workspace directory structure
  await fs.ensureDir(`src/${projectId}`);
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
  const agentsGraph = `import { agent, agentGraph, mcpTool } from '@inkeep/agents-sdk';

// MCP Tools
const forecastWeatherTool = mcpTool({
  id: 'fUI2riwrBVJ6MepT8rjx0',
  name: 'Forecast weather',
  serverUrl: 'https://weather-forecast-mcp.vercel.app/mcp',
});

const geocodeAddressTool = mcpTool({
  id: 'fdxgfv9HL7SXlfynPx8hf',
  name: 'Geocode address',
  serverUrl: 'https://geocoder-mcp.vercel.app/mcp',
});

// Agents
const weatherAssistant = agent({
  id: 'weather-assistant',
  name: 'Weather assistant',
  description: 'Responsible for routing between the geocoder agent and weather forecast agent',
  prompt:
    'You are a helpful assistant. When the user asks about the weather in a given location, first ask the geocoder agent for the coordinates, and then pass those coordinates to the weather forecast agent to get the weather forecast',
  canDelegateTo: () => [weatherForecaster, geocoderAgent],
});

const weatherForecaster = agent({
  id: 'weather-forecaster',
  name: 'Weather forecaster',
  description:
    'This agent is responsible for taking in coordinates and returning the forecast for the weather at that location',
  prompt:
    'You are a helpful assistant responsible for taking in coordinates and returning the forecast for that location using your forecasting tool',
  canUse: () => [forecastWeatherTool],
});

const geocoderAgent = agent({
  id: 'geocoder-agent',
  name: 'Geocoder agent',
  description: 'Responsible for converting location or address into coordinates',
  prompt:
    'You are a helpful assistant responsible for converting location or address into coordinates using your geocode tool',
  canUse: () => [geocodeAddressTool],
});

// Agent Graph
export const weatherGraph = agentGraph({
  id: 'weather-graph',
  name: 'Weather graph',
  defaultAgent: weatherAssistant,
  agents: () => [weatherAssistant, weatherForecaster, geocoderAgent],
});`;

  await fs.writeFile(`src/${config.projectId}/weather.graph.ts`, agentsGraph);

  const projectIndex = `import { weatherGraph } from './weather.graph.ts';
import { project } from '@inkeep/agents-sdk';

export const myProject = project({
  id: '${config.projectId}',
  name: '${config.projectId}',
  description: '${config.projectId}',
  graphs: () => [weatherGraph],
});`;

  await fs.writeFile(`src/${config.projectId}/index.ts`, projectIndex);

  // Inkeep config (if using CLI)
  const inkeepConfig = `import { defineConfig } from '@inkeep/agents-cli/config';

const config = defineConfig({
  tenantId: "${config.tenantId}",
  projectId: "${config.projectId}",
  agentsManageApiUrl: \`http://localhost:\${process.env.MANAGE_API_PORT || '3002'}\`,
  agentsRunApiUrl: \`http://localhost:\${process.env.RUN_API_PORT || '3003'}\`,
  modelSettings: ${JSON.stringify(config.modelSettings, null, 2)},
});
    
export default config;`;

  await fs.writeFile(`src/${config.projectId}/inkeep.config.ts`, inkeepConfig);

  // Create .env file for the project directory (for inkeep CLI commands)
  const projectEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from project directory)
DB_FILE_NAME=file:../../local.db
`;

  await fs.writeFile(`src/${config.projectId}/.env`, projectEnvContent);

}


async function installDependencies() {
  await execAsync('pnpm install');
}

async function setupProjectInDatabase() {
  const s = p.spinner();
  s.start('🚀 Starting development servers and setting up database...');

  try {
    // Start development servers in background
    const { spawn } = await import('child_process');
    const devProcess = spawn('pnpm', ['dev'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true, // Detach so we can kill the process group
      cwd: process.cwd(),
    });

    // Give servers time to start
    await new Promise((resolve) => setTimeout(resolve, 5000));

    s.message('📦 Servers ready! Creating project in database...');

    // Run the database setup
    await execAsync('node scripts/setup.js');

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

    s.stop('✅ Project successfully created and configured in database!');
  } catch (error) {
    s.stop('❌ Failed to setup project in database');
    console.error('Setup error:', error);
    // Continue anyway - user can run setup manually
  }
}

async function setupDatabase() {
  try {
    // Run drizzle-kit push to create database file and apply schema
    await execAsync('pnpm db:push');
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
