import color from 'picocolors';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { defaultOpenaiModelConfigurations, defaultAnthropicModelConfigurations, defaultDualModelConfigurations, ModelConfigurationResult } from '../utils/model-config';

const execAsync = promisify(exec);

type FileConfig = {
  dirName: string;
  tenantId?: string;
  projectId?: string;
  openAiKey?: string;
  anthropicKey?: string;
  manageApiPort: string;
  runApiPort: string;
  modelSettings: Record<string, any>;
};

export const createAgents = async (
  args: {
    tenantId?: string;
    projectId?: string;
    dirName?: string;
    openAiKey?: string;
    anthropicKey?: string;
    manageApiPort?: string;
    runApiPort?: string;
  } = {}
) => {
  let { tenantId, projectId, dirName, openAiKey, anthropicKey, manageApiPort, runApiPort } = args;

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

  // Prompt for tenant id
  if (!tenantId) {
    const tenantIdResponse = await p.text({
      message: 'Enter your tenant ID :',
      placeholder: '(default)',
      defaultValue: 'default',
    });

    if (p.isCancel(tenantIdResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    tenantId = tenantIdResponse as string;
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

  let defaultModelSettings = {}
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

    s.stop();

    // Success message with next steps
    p.note(
      `${color.green('✓')} Project created at: ${color.cyan(directoryPath)}\n\n` +
        `${color.yellow('Next steps:')}\n` +
        `  cd ${dirName}\n` +
        `  pnpm run dev (for APIs only)\n` +
        `  inkeep dev (for APIs + Management Dashboard)\n\n` +
        `${color.yellow('Available services:')}\n` +
        `  • Management API: http://localhost:${manageApiPort || '3002'}\n` +
        `  • Execution API: http://localhost:${runApiPort || '3003'}\n` +
        `  • Management Dashboard: Available with 'inkeep dev'\n` +
        `\n${color.yellow('Configuration:')}\n` +
        `  • Edit .env for environment variables\n` +
        `  • Edit src/${projectId}/hello.graph.ts for agent definitions\n` +
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
    },
    dependencies: {},
    devDependencies: {
      '@biomejs/biome': '^1.8.0',
      '@inkeep/agents-cli': '^0.1.1',
      'drizzle-kit': '^0.31.4',
      tsx: '^4.19.0',
      turbo: '^2.5.5',
    },
    engines: {
      node: '>=22.x',
    },
    packageManager: 'pnpm@10.10.0',
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
    zod: '^4.1.5',
  };

  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // Management API package
  const manageApiPackageJson = {
    name: `@${dirName}/manage-api`,
    version: '0.1.0',
    description: 'Management API for agents',
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

  // Execution API package
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
NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=http://localhost:${config.manageApiPort}
NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL=http://localhost:${config.runApiPort}
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
`;

  const manageApiEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from API directory)
DB_FILE_NAME=file:../../local.db
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

async function createServiceFiles(config: FileConfig) {
  const agentsGraph = `import { agent, agentGraph } from '@inkeep/agents-sdk';

// Router agent - the entry point that routes users to specialist agents
const helloAgent = agent({
  id: 'hello',
  name: 'Hello Agent',
  description: 'A hello agent that just says hello.',
  prompt: \`You are a hello agent that just says hello. You only reply with the word "hello", but you may do it in different variations like h3110, h3110w0rld, h3110w0rld! etc...\`,
});


// Create the agent graph
export const graph = agentGraph({
  id: 'hello',
  name: 'Hello Graph',
  description: 'A graph that contains the hello agent.',
  defaultAgent: helloAgent,
  agents: () => [helloAgent],
});`;

  await fs.writeFile(`src/${config.projectId}/hello.graph.ts`, agentsGraph);

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

# UI Configuration (for dashboard)
NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=http://localhost:${config.manageApiPort}
NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL=http://localhost:${config.runApiPort}

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

  // Management API
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

  // Execution API
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
    logger.info({}, \`📝 Execution API running on http://localhost:\${info.port}\`);
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

- **Agents Management API** (Port 3002): Agent configuration and managemen
  - Handles entity management and configuration endpoints.
- **Agents Run API** (Port 3003): Agent execution and chat processing  
  - Handles agent communication. You can interact with your agents either over MCP from an MCP client or through our React UI components library
- **Management Dashboard** (Port 3000): Web interface available via \`inkeep dev\`
  - The agent framework visual builder. From the builder you can create, manage and visualize all your graphs.

## Quick Start
1. **Install the Inkeep CLI:**
   \`\`\`bash
   pnpm install -g @inkeep/agents-cli
   \`\`\`

1. **Start services:**
   \`\`\`bash
   # Start Agents Management API and Agents Run API
   pnpm run dev
   
   # Start Dashboard
   inkeep dev
   \`\`\`

3. **Deploy your first agent graph:**
   \`\`\`bash
   # Navigate to your project's graph directory
   cd src/${config.projectId}/
   
   # Push the hello graph to create it
   inkeep push hello.graph.ts
   \`\`\`
  - Follow the prompts to create the project and graph
  - Click on the \"View graph in UI:\" link to see the graph in the management dashboard

## Project Structure

\`\`\`
${config.dirName}/
├── src/
│   ├── /${config.projectId}              # Agent configurations
├── apps/
│   ├── manage-api/          # Agents Management API service
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

- \`apps/manage-api/.env\`: Agents Management API environment variables
- \`apps/run-api/.env\`: Agents Run API environment variables
- \`src/${config.projectId}/.env\`: Inkeep CLI environment variables
- \`.env\`: Root environment variables 

To change the API keys used by your agents modify \`apps/run-api/.env\`. You are required to define at least one LLM provider key.

\`\`\`bash
# AI Provider Keys
ANTHROPIC_API_KEY=your-anthropic-key-here
OPENAI_API_KEY=your-openai-key-here
\`\`\`

To change the ports used by your services modify \`apps/manage-api/.env\` and \`apps/run-api/.env\` respectively:

\`\`\`bash
# Service port for apps/run-api 
RUN_API_PORT=3003

# Service port for apps/manage-api
MANAGE_API_PORT
\`\`\`

After changing the API Service ports make sure that you modify the dashboard API urls from whichever directory you are running \`inkeep dev\`:

\`\`\`bash
# UI Configuration (for dashboard)
NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=http://localhost:${config.manageApiPort}
NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL=http://localhost:${config.runApiPort}
\`\`\`

### Agent Configuration

Your agents are defined in \`src/${config.projectId}/index.ts\`. The default setup includes:

- **Hello Agent**: A hello agent that just says hello.

Your inkeep configuration is defined in \`src/${config.projectId}/inkeep.config.ts\`. The inkeep configuration is used to configure defaults for the inkeep CLI. The configuration includes:

- \`tenantId\`: The tenant ID
- \`projectId\`: The project ID
- \`agentsManageApiUrl\`: The management API URL
- \`agentsRunApiUrl\`: The execution API URL


## Development

### Updating Your Agents

1. Edit \`src/${config.projectId}/index.ts\`
2. Push the graph to the platform to update: \`inkeep push hello.graph.ts\` 

### API Documentation

Once services are running, view the OpenAPI documentation:

- Management API: http://localhost:${config.manageApiPort}/docs
- Execution API: http://localhost:${config.runApiPort}/docs

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
