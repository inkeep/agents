import color from 'picocolors';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
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
      message: 'Enter your project ID:',
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
        { value: 'both', label: 'Both Anthropic and OpenAI (recommended)' },
        { value: 'anthropic', label: 'Anthropic only' },
        { value: 'openai', label: 'OpenAI only' },
      ],
    });

    if (p.isCancel(providerChoice)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }

    // Prompt for keys based on selection
    if (providerChoice === 'anthropic' || providerChoice === 'both') {
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

    if (providerChoice === 'openai' || providerChoice === 'both') {
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

    // Create the project directory
    await fs.ensureDir(directoryPath);
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

    // Create workspace structure
    s.message('Setting up workspace structure...');
    await createWorkspaceStructure(projectId);

    // Setup package configurations
    s.message('Creating package configurations...');
    await setupPackageConfigurations(dirName);

    // Create environment files
    s.message('Setting up environment files...');
    await createEnvironmentFiles(config);

    // Create service files
    s.message('Creating service files...');
    await createServiceFiles(config);

    // Create documentation
    s.message('Creating documentation...');
    await createDocumentation(config);

    // Create turbo config
    s.message('Setting up Turbo...');
    await createTurboConfig();

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
  await fs.ensureDir('apps/manage-api/src');
  await fs.ensureDir('apps/run-api/src');
  await fs.ensureDir('apps/shared');
  await fs.ensureDir('scripts');
}

async function setupPackageConfigurations(dirName: string) {
  // Root package.json (workspace root)
  const rootPackageJson = {
    name: dirName,
    version: '0.1.0',
    description: 'An Inkeep Agent Framework directory',
    private: true,
    type: 'module',
    scripts: {
      dev: 'turbo dev',
      'db:push': 'drizzle-kit push',
      setup: 'node scripts/setup.js',
      'dev:setup': 'node scripts/dev-setup.js',
      start: 'pnpm dev:setup',
    },
    dependencies: {},
    devDependencies: {
      '@biomejs/biome': '^1.8.0',
      '@inkeep/agents-cli': '^0.1.1',
      'drizzle-kit': '^0.31.4',
      tsx: '^4.19.0',
      turbo: '^2.5.5',
      concurrently: '^8.2.0',
      'wait-on': '^8.0.0',
    },
    engines: {
      node: '>=22.x',
    },
    packageManager: 'pnpm@10.10.0',
    pnpm: {
      onlyBuiltDependencies: ['keytar'],
    },
  };

  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // Create pnpm-workspace.yaml for pnpm workspaces
  const pnpmWorkspace = `packages:
  - "apps/*"
`;
  await fs.writeFile('pnpm-workspace.yaml', pnpmWorkspace);

  // Add shared dependencies to root package.json
  rootPackageJson.dependencies = {
    '@inkeep/agents-core': '^0.1.0',
    '@inkeep/agents-sdk': '^0.1.0',
    dotenv: '^16.0.0',
    zod: '^4.1.5',
  };

  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // Manage API package
  const manageApiPackageJson = {
    name: `@${dirName}/manage-api`,
    version: '0.1.0',
    description: 'Manage API for agents',
    type: 'module',
    scripts: {
      build: 'tsc',
      dev: 'tsx watch src/index.ts',
      start: 'node dist/index.js',
    },
    dependencies: {
      '@inkeep/agents-manage-api': '^0.1.1',
      '@inkeep/agents-core': '^0.1.0',
      '@hono/node-server': '^1.14.3',
    },
    devDependencies: {
      '@types/node': '^20.12.0',
      tsx: '^4.19.0',
      typescript: '^5.4.0',
    },
    engines: {
      node: '>=22.x',
    },
  };

  await fs.writeJson('apps/manage-api/package.json', manageApiPackageJson, { spaces: 2 });

  // Run API package
  const runApiPackageJson = {
    name: `@${dirName}/run-api`,
    version: '0.1.0',
    description: 'Run API for agents',
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      start: 'node dist/index.js',
    },
    dependencies: {
      '@inkeep/agents-run-api': '^0.1.1',
      '@inkeep/agents-core': '^0.1.0',
      '@hono/node-server': '^1.14.3',
    },
    devDependencies: {
      '@types/node': '^20.12.0',
      tsx: '^4.19.0',
      typescript: '^5.4.0',
    },
    engines: {
      node: '>=22.x',
    },
  };

  await fs.writeJson('apps/run-api/package.json', runApiPackageJson, { spaces: 2 });

  // TypeScript configs for API services
  const apiTsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      outDir: './dist',
      rootDir: '..',
      allowImportingTsExtensions: false,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: false,
    },
    include: ['src/**/*', '../shared/**/*'],
    exclude: ['node_modules', 'dist', '**/*.test.ts'],
  };

  await fs.writeJson('apps/manage-api/tsconfig.json', apiTsConfig, { spaces: 2 });
  await fs.writeJson('apps/run-api/tsconfig.json', apiTsConfig, { spaces: 2 });

  // No tsconfig needed for UI since we're using the packaged version
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

  // Create setup script
  await createSetupScript(config);

  // Create dev-setup script
  await createDevSetupScript(config);

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

  // Create .gitignore
  const gitignore = `# Dependencies
node_modules/
.pnpm-store/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
.next/
.turbo/

# Logs
*.log
logs/

# Database
*.db
*.sqlite
*.sqlite3

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Coverage
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
.cache/

# Runtime data
pids/
*.pid
*.seed
*.pid.lock
`;

  await fs.writeFile('.gitignore', gitignore);

  // Create biome.json
  const biomeConfig = {
    linter: {
      enabled: true,
      rules: {
        recommended: true,
      },
    },
    formatter: {
      enabled: true,
      indentStyle: 'space',
      indentWidth: 2,
    },
    organizeImports: {
      enabled: true,
    },
    javascript: {
      formatter: {
        semicolons: 'always',
        quoteStyle: 'single',
      },
    },
  };

  await fs.writeJson('biome.json', biomeConfig, { spaces: 2 });
}

async function createSetupScript(config: FileConfig) {
  const setupScriptContent = `#!/usr/bin/env node

import { createDatabaseClient, createProject, getProject } from '@inkeep/agents-core';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const dbUrl = process.env.DB_FILE_NAME || 'file:local.db';
const tenantId = '${config.tenantId}';
const projectId = '${config.projectId}';
const projectName = '${config.projectId}';
const projectDescription = 'Generated Inkeep Agents project';

async function setupProject() {
  console.log('🚀 Setting up your Inkeep Agents project...');
  
  try {
    const dbClient = createDatabaseClient({ url: dbUrl });
    
    // Check if project already exists
    console.log('📋 Checking if project already exists...');
    try {
      const existingProject = await getProject(dbClient)({ 
        id: projectId, 
        tenantId: tenantId 
      });
      
      if (existingProject) {
        console.log('✅ Project already exists in database:', existingProject.name);
        console.log('🎯 Project ID:', projectId);
        console.log('🏢 Tenant ID:', tenantId);
        return;
      }
    } catch (error) {
      // Project doesn't exist, continue with creation
    }
    
    // Create the project in the database
    console.log('📦 Creating project in database...');
    await createProject(dbClient)({
      id: projectId,
      tenantId: tenantId,
      name: projectName,
      description: projectDescription,
      models: ${JSON.stringify(config.modelSettings, null, 2)},
    });
    
    console.log('✅ Project created successfully!');
    console.log('🎯 Project ID:', projectId);
    console.log('🏢 Tenant ID:', tenantId);
    console.log('');
    console.log('🎉 Setup complete! Your development servers are running.');
    console.log('');
    console.log('📋 Available URLs:');
    console.log('   - Management UI: http://localhost:${config.manageApiPort}');
    console.log('   - Runtime API:   http://localhost:${config.runApiPort}');
    console.log('');
    console.log('🚀 Ready to build agents!');
    
  } catch (error) {
    console.error('❌ Failed to setup project:', error);
    process.exit(1);
  }
}

setupProject();
`;

  await fs.writeFile('scripts/setup.js', setupScriptContent);

  // Make the script executable
  await fs.chmod('scripts/setup.js', 0o755);
}

async function createDevSetupScript(config: FileConfig) {
  const devSetupScriptContent = `#!/usr/bin/env node

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

async function devSetup() {
  console.log('🚀 Starting Inkeep Agents development environment...');
  console.log('');
  
  try {
    // Start development servers in background
    console.log('📡 Starting development servers...');
    const devProcess = spawn('pnpm', ['dev'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    // Give servers time to start
    console.log('⏳ Waiting for servers to start...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('');
    console.log('📦 Servers are ready! Setting up project in database...');
    
    // Run the setup script
    await execAsync('pnpm setup');
    
    console.log('');
    console.log('🎉 Development environment is ready!');
    console.log('');
    console.log('📋 Available URLs:');
    console.log(\`   - Management UI: http://localhost:${config.manageApiPort}\`);
    console.log(\`   - Runtime API:   http://localhost:${config.runApiPort}\`);
    console.log('');
    console.log('✨ The servers will continue running. Press Ctrl+C to stop.');
    
    // Keep the script running so servers don't terminate
    process.on('SIGINT', () => {
      console.log('\\n👋 Shutting down development servers...');
      devProcess.kill();
      process.exit(0);
    });
    
    // Wait for the dev process to finish or be killed
    devProcess.on('close', (code) => {
      console.log(\`Development servers stopped with code \${code}\`);
      process.exit(code);
    });
    
  } catch (error) {
    console.error('❌ Failed to start development environment:', error.message);
    process.exit(1);
  }
}

devSetup();
`;

  await fs.writeFile('scripts/dev-setup.js', devSetupScriptContent);
  await fs.chmod('scripts/dev-setup.js', 0o755);
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

  // Shared credential stores
  const credentialStoresFile = `import {
  InMemoryCredentialStore,
  createNangoCredentialStore,
  createKeyChainStore,
} from '@inkeep/agents-core';

// Shared credential stores configuration for all services
export const credentialStores = [
  new InMemoryCredentialStore('memory-default'),
  ...(process.env.NANGO_SECRET_KEY
    ? [
        createNangoCredentialStore('nango-default', {
          apiUrl: process.env.NANGO_HOST || 'https://api.nango.dev',
          secretKey: process.env.NANGO_SECRET_KEY,
        }),
      ]
    : []),
  createKeyChainStore('keychain-default'),
];
`;

  await fs.writeFile('apps/shared/credential-stores.ts', credentialStoresFile);

  // Manage API
  const manageApiIndex = `import { serve } from '@hono/node-server';
import { createManagementApp } from '@inkeep/agents-manage-api';
import { getLogger } from '@inkeep/agents-core';
import { credentialStores } from '../../shared/credential-stores.js';

const logger = getLogger('management-api');

// Create the Hono app
const app = createManagementApp({
  serverConfig: {
    port: Number(process.env.MANAGE_API_PORT) || 3002,
    serverOptions: {
      requestTimeout: 60000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
});

const port = Number(process.env.MANAGE_API_PORT) || 3002;

// Start the server using @hono/node-server
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({}, \`📝 Management API running on http://localhost:\${info.port}\`);
    logger.info({}, \`📝 OpenAPI documentation available at http://localhost:\${info.port}/openapi.json\`);
  }
);`;

  await fs.writeFile('apps/manage-api/src/index.ts', manageApiIndex);

  // Run API
  const runApiIndex = `import { serve } from '@hono/node-server';
import { createExecutionApp } from '@inkeep/agents-run-api';
import { credentialStores } from '../../shared/credential-stores.js';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('execution-api');


// Create the Hono app
const app = createExecutionApp({
  serverConfig: {
    port: Number(process.env.RUN_API_PORT) || 3003,
    serverOptions: {
      requestTimeout: 120000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
});

const port = Number(process.env.RUN_API_PORT) || 3003;

// Start the server using @hono/node-server
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({}, \`📝 Run API running on http://localhost:\${info.port}\`);
    logger.info({}, \`📝 OpenAPI documentation available at http://localhost:\${info.port}/openapi.json\`);
  }
);`;

  await fs.writeFile('apps/run-api/src/index.ts', runApiIndex);

  // Database configuration
  const drizzleConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: 'node_modules/@inkeep/agents-core/dist/db/schema.js',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_FILE_NAME || 'file:./local.db'
  },
});`;

  await fs.writeFile('drizzle.config.ts', drizzleConfig);
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
  - Click on the \"View graph in UI:\" link to see the graph in the management dashboard

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
