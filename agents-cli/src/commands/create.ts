import color from 'picocolors';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export const createAgents = async (
  args: {
    tenantId?: string;
    projectId?: string;
    dirName?: string;
    openAiKey?: string;
    anthropicKey?: string;
    nangoKey?: string;
  } = {}
) => {
  let { tenantId, projectId, dirName, openAiKey, anthropicKey, nangoKey } = args;

  p.intro(color.inverse(' Create Agents Project '));

  // Prompt for project name if not provided
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

  // Prompt for Anthropic API key
  if (!anthropicKey) {
    const anthropicKeyResponse = await p.text({
      message: 'Enter your Anthropic API key (recommended):',
      placeholder: 'sk-ant-...',
      defaultValue: '',
    });

    if (p.isCancel(anthropicKeyResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    anthropicKey = (anthropicKeyResponse as string) || undefined;
  }

  // Prompt for OpenAI API key
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

  // Prompt for Nango API key (optional)
  if (!nangoKey) {
    const nangoKeyResponse = await p.text({
      message: 'Enter your Nango Secret key (optional):',
      placeholder: 'nango-secret-key',
      defaultValue: '',
    });

    if (p.isCancel(nangoKeyResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    nangoKey = (nangoKeyResponse as string) || undefined;
  }

  const s = p.spinner();
  s.start('Creating project structure...');

  try {
    const projectPath = path.resolve(process.cwd(), dirName);

    // Check if directory already exists
    if (await fs.pathExists(projectPath)) {
      s.stop();
      const overwrite = await p.confirm({
        message: `Directory ${dirName} already exists. Do you want to overwrite it?`,
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Operation cancelled');
        process.exit(0);
      }
      s.start('Cleaning existing directory...');
      await fs.emptyDir(projectPath);
    }

    // Create the project directory
    await fs.ensureDir(projectPath);
    process.chdir(projectPath);

    // Create workspace structure
    s.message('Setting up workspace structure...');
    await createWorkspaceStructure(projectId);

    // Setup package configurations
    s.message('Creating package configurations...');
    await setupPackageConfigurations(dirName);

    // Create environment files
    s.message('Setting up environment files...');
    await createEnvironmentFiles({
      tenantId,
      projectId,
      openAiKey,
      anthropicKey,
      nangoKey,
    });

    // Create service files
    s.message('Creating service files...');
    await createServiceFiles({
      projectId,
      tenantId,
      anthropicKey,
      openAiKey,
      nangoKey,
    });

    // Create documentation
    s.message('Creating documentation...');
    await createDocumentation(dirName);

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
      `${color.green('✓')} Project created at: ${color.cyan(projectPath)}\n\n` +
        `${color.yellow('Next steps:')}\n` +
        `  cd ${dirName}\n` +
        `  npm run dev:apis (for APIs only)\n` +
        `  npx inkeep dev (for APIs + Management Dashboard)\n\n` +
        `${color.yellow('Available services:')}\n` +
        `  • Management API: http://localhost:3002\n` +
        `  • Execution API: http://localhost:3003\n` +
        `  • Management Dashboard: Available with 'npx inkeep dev'\n` +
        `\n${color.yellow('Configuration:')}\n` +
        `  • Edit .env for environment variables\n` +
        `  • Edit src/${projectId}/hello.graph.ts for agent definitions\n` +
        `  • Use 'npx inkeep push' to deploy agents to the platform\n` +
        `  • Use 'npx inkeep chat' to test your agents locally\n`,
      'Ready to go!'
    );
  } catch (error) {
    s.stop();
    p.cancel(`Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    description: 'An Inkeep Agent Framework project',
    private: true,
    type: 'module',
    scripts: {
      build: 'turbo build',
      dev: 'turbo dev',
      'dev:apis': 'turbo dev:apis',
      test: 'turbo test',
      'test:watch': 'turbo test:watch',
      'test:coverage': 'turbo test:coverage',
      lint: 'turbo lint',
      format: 'biome check --write .',
      typecheck: 'turbo typecheck',
      clean: 'npm run clean --workspaces',
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
      node: '>=20.x',
    },
    packageManager: 'npm@10.0.0',
    workspaces: ['apps/*'],
  };

  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // No need for pnpm-workspace.yaml since we're using npm workspaces

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
      test: 'vitest',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
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
      vitest: '^1.6.0',
    },
    engines: {
      node: '>=20.x',
    },
  };

  await fs.writeJson('apps/manage-api/package.json', manageApiPackageJson, { spaces: 2 });

  // Execution API package
  const runApiPackageJson = {
    name: `@${dirName}/run-api`,
    version: '0.1.0',
    description: 'Execution API for agents',
    type: 'module',
    scripts: {
      build: 'tsc',
      dev: 'tsx watch src/index.ts',
      start: 'node dist/index.js',
      test: 'vitest',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
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
      vitest: '^1.6.0',
    },
    engines: {
      node: '>=20.x',
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

async function createEnvironmentFiles(config: {
  tenantId?: string;
  projectId?: string;
  openAiKey?: string;
  anthropicKey?: string;
  nangoKey?: string;
}) {
  // Root .env file
  const envContent = `# Environment
ENVIRONMENT=development

# Database
DB_FILE_NAME=file:./local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}

# Nango (optional)
${config.nangoKey ? `NANGO_SECRET_KEY=${config.nangoKey}` : '# NANGO_SECRET_KEY=your-nango-secret-key'}

# Logging
LOG_LEVEL=debug

# Service Ports
MANAGEMENT_API_PORT=3002
EXECUTION_API_PORT=3003
`;

  await fs.writeFile('.env', envContent);

  // Create .env.example
  const envExample = envContent.replace(/=.+$/gm, '=');
  await fs.writeFile('.env.example', envExample);

  // Create .env files for each API service
  const apiEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from API directory)
DB_FILE_NAME=file:../../local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}

# Nango (optional)
${config.nangoKey ? `NANGO_SECRET_KEY=${config.nangoKey}` : '# NANGO_SECRET_KEY=your-nango-secret-key'}

# Logging
LOG_LEVEL=debug
`;

  await fs.writeFile('apps/manage-api/.env', apiEnvContent);
  await fs.writeFile('apps/run-api/.env', apiEnvContent);

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

async function createServiceFiles(config: {
  projectId: string;
  tenantId: string;
  anthropicKey?: string;
  openAiKey?: string;
  nangoKey?: string;
}) {
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
      managementApiUrl: process.env.INKEEP_API_URL || 'http://localhost:3002',
      executionApiUrl: process.env.INKEEP_API_KEY || 'http://localhost:3003',
    });
    
    export default config;`;

  await fs.writeFile(`src/${config.projectId}/inkeep.config.ts`, inkeepConfig);

  // Create .env file for the project directory (for inkeep CLI commands)
  const projectEnvContent = `# Environment
ENVIRONMENT=development

# Database (relative path from project directory)
DB_FILE_NAME=file:../../local.db

# AI Provider Keys  
ANTHROPIC_API_KEY=${config.anthropicKey || 'your-anthropic-key-here'}
OPENAI_API_KEY=${config.openAiKey || 'your-openai-key-here'}

# Nango (optional)
${config.nangoKey ? `NANGO_SECRET_KEY=${config.nangoKey}` : '# NANGO_SECRET_KEY=your-nango-secret-key'}

# Logging
LOG_LEVEL=debug
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
    port: Number(process.env.MANAGEMENT_API_PORT) || 3002,
    serverOptions: {
      requestTimeout: 60000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
});

const port = Number(process.env.MANAGEMENT_API_PORT) || 3002;

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
    port: Number(process.env.EXECUTION_API_PORT) || 3003,
    serverOptions: {
      requestTimeout: 120000,
      keepAliveTimeout: 60000,
      keepAlive: true,
    },
  },
  credentialStores,
});

const port = Number(process.env.EXECUTION_API_PORT) || 3003;

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

  //   // Create instrumentation stub files
  //   const instrumentation = `// OpenTelemetry instrumentation placeholder
  // // Add your tracing/monitoring setup here`;

  //   await fs.writeFile('apps/manage-api/src/instrumentation.js', instrumentation);
  //   await fs.writeFile('apps/run-api/src/instrumentation.js', instrumentation);

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
      'MANAGEMENT_API_PORT',
      'EXECUTION_API_PORT',
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
      test: {
        dependsOn: ['^build'],
        inputs: ['$TURBO_DEFAULT$', '**/*.{test,spec}.{js,jsx,ts,tsx}'],
        outputs: ['coverage/**'],
      },
      'test:watch': {
        cache: false,
        persistent: true,
      },
      'test:coverage': {
        dependsOn: ['^build'],
        inputs: ['$TURBO_DEFAULT$', '**/*.{test,spec}.{js,jsx,ts,tsx}'],
        outputs: ['coverage/**'],
      },
      lint: {
        inputs: ['$TURBO_DEFAULT$'],
        outputs: [],
      },
      typecheck: {
        dependsOn: ['^build'],
        inputs: ['$TURBO_DEFAULT$'],
        outputs: [],
      },
      'db:push': {
        cache: false,
        inputs: ['drizzle.config.ts', 'src/data/db/schema.ts'],
      },
      'dev:apis': {
        cache: false,
        persistent: true,
      },
    },
  };

  await fs.writeJson('turbo.json', turboConfig, { spaces: 2 });
}

async function createDocumentation(projectName: string) {
  const readme = `# ${projectName}

An Inkeep Agent Framework project with multi-service architecture.

## Architecture

This project follows a workspace structure with the following services:

- **Management API** (Port 3002): Agent configuration and management
- **Execution API** (Port 3003): Agent execution and chat processing  
- **Management Dashboard**: Web interface available via \`npx inkeep dev\`
- **Shared Source**: Agent definitions and tools in \`src/\`

## Quick Start

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment variables:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your API keys
   \`\`\`

3. **Start services:**
   \`\`\`bash
   # Start APIs only
   npm run dev:apis
   
   # Start APIs + Management Dashboard
   npx inkeep dev
   \`\`\`

4. **Access your services:**
   - Management API: http://localhost:3002  
   - Execution API: http://localhost:3003
   - Management Dashboard: Available when using \`npx inkeep dev\`

## Available Scripts

- \`npm run dev\` - Start API services in development mode
- \`npm run dev:apis\` - Start API services (same as npm run dev)
- \`npx inkeep dev\` - Start APIs + Management Dashboard
- \`npm run build\` - Build all packages
- \`npm run test\` - Run tests across all packages
- \`npm run lint\` - Run linting across all packages
- \`npm run typecheck\` - Run type checking

## Project Structure

\`\`\`
${projectName}/
├── src/
│   ├── agents/              # Agent configurations
│   └── tools/               # Tool implementations
├── apps/
│   ├── manage-api/          # Management API service
│   └── run-api/             # Execution API service
├── turbo.json               # Turbo configuration
└── package.json             # Root package configuration with npm workspaces
\`\`\`

## Configuration

### Environment Variables

Edit the \`.env\` file with your configuration:

\`\`\`bash
# AI Provider Keys (Required)
ANTHROPIC_API_KEY=your-anthropic-key-here
OPENAI_API_KEY=your-openai-key-here

# Optional integrations
NANGO_SECRET_KEY=your-nango-secret-key

# Database
DB_FILE_NAME=file:./local.db

# Service Ports (default values)
MANAGEMENT_API_PORT=3002
EXECUTION_API_PORT=3003
\`\`\`

### Agent Configuration

Your agents are defined in \`src/agents/index.ts\`. The default setup includes:

- **Router Agent**: Routes requests to appropriate specialist agents
- **QA Agent**: Handles questions and information requests
- **Task Agent**: Manages action-oriented requests

### Tools

Custom tools are defined in \`src/tools/\`. The default setup includes a search tool example.

## Development

### Adding New Agents

1. Edit \`src/agents/index.ts\`
2. Define your agent with \`agent()\` function
3. Add it to the \`agents\` array in \`agentGraph()\`
4. Restart the services: \`npm run dev\`

### Adding New Tools  

1. Create a new tool file in \`src/tools/\`
2. Export it from \`src/tools/index.ts\`
3. Import and use it in your agent definitions

### API Documentation

Once services are running, view the OpenAPI documentation:

- Management API: http://localhost:3002/openapi.json
- Execution API: http://localhost:3003/openapi.json

## Learn More

- [Inkeep Documentation](https://docs.inkeep.com)
- [Agents Framework Guide](https://docs.inkeep.com/agents)
- [Turbo Documentation](https://turbo.build/repo/docs)

## Troubleshooting

### Services won't start

1. Ensure all dependencies are installed: \`npm install\`
2. Check that ports 3000-3003 are available
3. Verify your \`.env\` file has the required API keys

### Build errors

1. Run \`npm run clean\` to clear build cache
2. Run \`npm run build\` to rebuild all packages
3. Check for TypeScript errors with \`npm run typecheck\`
`;

  await fs.writeFile('README.md', readme);
}

async function installDependencies() {
  await execAsync('npm install');
}

async function setupDatabase() {
  try {
    // Run drizzle-kit push to create database file and apply schema
    await execAsync('npx drizzle-kit push');
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
