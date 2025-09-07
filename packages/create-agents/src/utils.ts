import color from 'picocolors';
import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export const createAgents = async (args: {
  projectName?: string;
  openAiKey?: string;
  anthropicKey?: string;
  nangoKey?: string;
} = {}) => {
  let {
    projectName,
    openAiKey,
    anthropicKey,
    nangoKey,
  } = args;

  p.intro(color.inverse(' Create Agents Project '));

  // Prompt for project name if not provided
  if (!projectName) {
    const projectResponse = await p.text({
      message: 'What do you want to name your project?',
      placeholder: 'my-agent-project',
      defaultValue: 'my-agent-project',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Project name is required';
        }
        return undefined;
      },
    });

    if (p.isCancel(projectResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    projectName = projectResponse as string;
  }

  // Prompt for Anthropic API key if not provided
  if (!anthropicKey) {
    const anthropicResponse = await p.text({
      message: 'Enter your Anthropic API key (required):',
      placeholder: '...',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Anthropic API key is required';
        }

        return undefined;
      },
    });

    if (p.isCancel(anthropicResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    anthropicKey = anthropicResponse as string;
  }

  // Prompt for OpenAI API key if not provided
  if (!openAiKey) {
    const openAiResponse = await p.text({
      message: 'Enter your OpenAI API key (optional, press Enter to skip):',
      placeholder: '...',
      
    });

    if (p.isCancel(openAiResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    openAiKey = openAiResponse as string || '';
  }

  // Prompt for Nango API key if not provided
  if (!nangoKey) {
    const nangoResponse = await p.text({
      message: 'Enter your Nango API key (optional, press Enter to skip):',
      placeholder: '...',
    });

    if (p.isCancel(nangoResponse)) {
      p.cancel('Operation cancelled');
      process.exit(0);
    }
    nangoKey = nangoResponse as string || '';
  }

  const project = projectName;

  const s = p.spinner();
  const projectPath = path.resolve(project as string);

  try {
    s.start('Creating project directory');
    
    // Create project directory
    try {
      await fs.mkdir(projectPath);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        s.stop(`A directory named "${project}" already exists. Please choose a different name.`);
        process.exit(1);
      }
      throw new Error(
        `Failed to create project directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    process.chdir(projectPath);

    s.message('Creating workspace structure');
    await createWorkspaceStructure(project as string);

    s.message('Setting up package configurations');
    await setupPackageConfigurations(project as string);

    s.message('Creating environment configuration');
    await createEnvironmentFiles({
      openAiKey,
      anthropicKey,
      nangoKey,
    });

    s.message('Setting up services');
    await createServiceFiles();

    s.message('Creating turbo configuration');
    await createTurboConfig();

    s.message('Creating README and documentation');
    await createDocumentation(project as string);

    s.message('Installing dependencies');
    await installDependencies();

    s.stop('Project created successfully!');

    // Success message with next steps
    p.note(
      `${color.green('✓')} Project created at: ${color.cyan(projectPath)}\n\n` +
      `${color.yellow('Next steps:')}\n` +
      `  cd ${project}\n` +
      `  npm run dev\n\n` +
      `${color.yellow('Available services:')}\n` +
      `  • Management API: http://localhost:3002\n` +
      `  • Execution API: http://localhost:3003\n` +
      `  • Management UI: http://localhost:3000\n` +
      `\n${color.yellow('Configuration:')}\n` +
      `  • Edit .env for environment variables\n` +
      `  • Edit src/agents/index.ts for agent definitions\n`,
      'Ready to go!'
    );

  } catch (error) {
    s.stop();
    p.cancel(`Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
};

async function createWorkspaceStructure(projectName: string) {
  // Create the workspace directory structure
  await fs.ensureDir('src/agents');
  await fs.ensureDir('src/tools');
  await fs.ensureDir('apps/manage-api/src');
  await fs.ensureDir('apps/run-api/src');
  await fs.ensureDir('apps/manage-ui');
}

async function setupPackageConfigurations(projectName: string) {
  // Root package.json (workspace root)
  const rootPackageJson = {
    name: projectName,
    version: "0.1.0",
    description: "An Inkeep Agent Framework project",
    private: true,
    type: "module",
    scripts: {
      build: "turbo build",
      dev: "turbo dev",
      "dev:apis": "turbo dev:apis", 
      test: "turbo test",
      "test:watch": "turbo test:watch",
      "test:coverage": "turbo test:coverage",
      lint: "turbo lint",
      format: "biome check --write .",
      typecheck: "turbo typecheck",
      clean: "npm run clean --workspaces",
      "db:push": "turbo db:push"
    },
    dependencies: {},
    devDependencies: {
      "@biomejs/biome": "^1.8.0",
      "turbo": "^2.5.5"
    },
    engines: {
      node: ">=20.x"
    },
    workspaces: [
      "apps/*"
    ]
  };
  
  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // No need for pnpm-workspace.yaml since we're using npm workspaces

  // Add shared dependencies to root package.json
  rootPackageJson.dependencies = {
    "@inkeep/agents-core": "^0.1.0",
    "zod": "^4.1.5"
  };
  
  await fs.writeJson('package.json', rootPackageJson, { spaces: 2 });

  // Management API package
  const manageApiPackageJson = {
    name: `@${projectName}/manage-api`,
    version: "0.1.0", 
    description: "Management API for agents",
    type: "module",
    scripts: {
      build: "tsc",
      dev: "tsx watch src/index.ts",
      start: "node dist/index.js",
      test: "vitest",
      lint: "biome check .",
      typecheck: "tsc --noEmit"
    },
    dependencies: {
      "@inkeep/agents-manage-api": "^0.1.1",
      "@inkeep/agents-core": "^0.1.0"
    },
    devDependencies: {
      "@types/node": "^20.12.0", 
      "tsx": "^4.7.0",
      "typescript": "^5.4.0",
      "vitest": "^1.6.0"
    },
    engines: {
      node: ">=20.x"
    }
  };
  
  await fs.writeJson('apps/manage-api/package.json', manageApiPackageJson, { spaces: 2 });

  // Execution API package
  const runApiPackageJson = {
    name: `@${projectName}/run-api`,
    version: "0.1.0",
    description: "Execution API for agents", 
    type: "module",
    scripts: {
      build: "tsc",
      dev: "tsx watch src/index.ts",
      start: "node dist/index.js",
      test: "vitest",
      lint: "biome check .",
      typecheck: "tsc --noEmit"
    },
    dependencies: {
      "@inkeep/agents-run-api": "^0.1.1", 
      "@inkeep/agents-core": "^0.1.0"
    },
    devDependencies: {
      "@types/node": "^20.12.0",
      "tsx": "^4.7.0", 
      "typescript": "^5.4.0",
      "vitest": "^1.6.0"
    },
    engines: {
      node: ">=20.x"
    }
  };
  
  await fs.writeJson('apps/run-api/package.json', runApiPackageJson, { spaces: 2 });

  // Management UI package (Next.js app)
  const manageUiPackageJson = {
    name: `@${projectName}/manage-ui`,
    version: "0.1.0",
    description: "Management UI for agents",
    scripts: {
      build: "next build",
      dev: "next dev -p 3000",
      start: "next start",
      lint: "next lint",
      typecheck: "tsc --noEmit", 
      test: "vitest --run"
    },
    dependencies: {
      "@inkeep/agents-manage-ui": "^0.1.1",
      "next": "15.4.7",
      "react": "19.1.1",
      "react-dom": "19.1.1"
    },
    devDependencies: {
      "@types/node": "^20",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      "typescript": "^5",
      "vitest": "^3.2.4"
    },
    engines: {
      node: ">=20.x"
    }
  };
  
  await fs.writeJson('apps/manage-ui/package.json', manageUiPackageJson, { spaces: 2 });

  // TypeScript configs for API services
  const apiTsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext", 
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      outDir: "./dist",
      rootDir: "./src",
      allowImportingTsExtensions: false,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: false
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist", "**/*.test.ts"]
  };

  await fs.writeJson('apps/manage-api/tsconfig.json', apiTsConfig, { spaces: 2 });
  await fs.writeJson('apps/run-api/tsconfig.json', apiTsConfig, { spaces: 2 });

  // Next.js tsconfig for UI
  const nextTsConfig = {
    compilerOptions: {
      lib: ["dom", "dom.iterable", "es6"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: {
        "@/*": ["./src/*"]
      }
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"]
  };

  await fs.writeJson('apps/manage-ui/tsconfig.json', nextTsConfig, { spaces: 2 });
}

async function createEnvironmentFiles(config: {
  openAiKey?: string;
  anthropicKey?: string; 
  nangoKey?: string;
}) {
  // Root .env file
  const envContent = `# Environment
ENVIRONMENT=development

# Database
DB_FILE_NAME=./agent.sqlite

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
UI_PORT=3000
`;

  await fs.writeFile('.env', envContent);
  
  // Create .env.example
  const envExample = envContent.replace(/=.+$/gm, '=');
  await fs.writeFile('.env.example', envExample);

  // Inkeep config (if using CLI)
  const inkeepConfig = `import type { InkeepConfig } from '@inkeep/agents-core';

const config: InkeepConfig = {
  tenantId: process.env.INKEEP_TENANT_ID || 'your-tenant-id',
  apiUrl: process.env.INKEEP_API_URL || 'http://localhost:3003',
  apiKey: process.env.INKEEP_API_KEY || '',
};

export default config;`;

  await fs.writeFile('inkeep.config.ts', inkeepConfig);

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
    "linter": {
      "enabled": true,
      "rules": {
        "recommended": true
      }
    },
    "formatter": {
      "enabled": true,
      "indentStyle": "space",
      "indentWidth": 2
    },
    "organizeImports": {
      "enabled": true
    },
    "javascript": {
      "formatter": {
        "semicolons": "always",
        "quoteStyle": "single"
      }
    }
  };

  await fs.writeJson('biome.json', biomeConfig, { spaces: 2 });
}

async function createServiceFiles() {
  // Top-level exports
  const rootIndex = `export * from './agents/index.js';
export * from './tools/index.js';`;
  
  await fs.writeFile('src/index.ts', rootIndex);

  const agentsIndex = `import { agent, agentGraph } from '@inkeep/agents-core';
import { searchTool } from '../tools/search.js';

// Router agent - the entry point that routes users to specialist agents
const routerAgent = agent({
  id: 'router',
  name: 'Router Agent',
  instructions: \`You are a helpful AI router agent. Your job is to understand user requests and either:
1. Handle simple questions directly
2. Transfer control to a specialist agent when needed

Available specialist agents:
- qa-agent: For answering questions and providing information
- task-agent: For completing tasks and taking actions

Always be helpful and explain what you're doing when transferring to another agent.\`,
  
  canTransferTo: () => [qaAgent, taskAgent],
});

// QA agent - handles questions and information requests
const qaAgent = agent({
  id: 'qa-agent',
  name: 'QA Agent', 
  instructions: \`You are a knowledgeable QA agent specialized in answering questions and providing information.
Use the available tools to search for information when needed.
Always provide accurate, helpful responses and cite your sources.

When you've completed answering a question, you can transfer back to the router if the user has more requests.\`,
  
  tools: {
    search: searchTool,
  },
  
  canTransferTo: () => [routerAgent],
});

// Task agent - handles action-oriented requests
const taskAgent = agent({
  id: 'task-agent',
  name: 'Task Agent',
  instructions: \`You are a task-oriented agent that helps users complete actions and tasks.
You can help with:
- Planning and breaking down complex tasks
- Providing step-by-step instructions
- Coordinating multi-step workflows

Always be clear about what actions you can and cannot take.
When you've completed a task, you can transfer back to the router if the user needs more help.\`,
  
  canTransferTo: () => [routerAgent],
});

// Create the agent graph
export const graph = agentGraph({
  defaultAgent: routerAgent,
  agents: [routerAgent, qaAgent, taskAgent],
});

export { routerAgent, qaAgent, taskAgent };`;

  await fs.writeFile('src/agents/index.ts', agentsIndex);

  const toolsIndex = `export * from './search.js';`;
  await fs.writeFile('src/tools/index.ts', toolsIndex);

  const searchTool = `import { tool } from '@inkeep/agents-core';
import { z } from 'zod';

export const searchTool = tool({
  id: 'search',
  name: 'Search',
  description: 'Search for information on the web',
  parameters: z.object({
    query: z.string().describe('The search query'),
    maxResults: z.number().optional().default(5).describe('Maximum number of results to return'),
  }),
  handler: async ({ query, maxResults }) => {
    // This is a mock implementation - replace with actual search functionality
    console.log(\`🔍 Searching for: "\${query}" (max \${maxResults} results)\`);
    
    // Simulate search results
    const mockResults = [
      {
        title: \`Information about \${query}\`,
        url: \`https://example.com/search?q=\${encodeURIComponent(query)}\`,
        snippet: \`This is relevant information about \${query}. This would be actual search result content in a real implementation.\`,
      },
      {
        title: \`\${query} - Documentation\`,
        url: \`https://docs.example.com/\${query.toLowerCase().replace(' ', '-')}\`,
        snippet: \`Official documentation and guides related to \${query}.\`,
      },
    ];

    return {
      query,
      results: mockResults.slice(0, maxResults),
      total: mockResults.length,
    };
  },
});`;

  await fs.writeFile('src/tools/search.ts', searchTool);

  // Management API
  const manageApiIndex = `import './instrumentation.js';
import { ManagementServer } from '@inkeep/agents-manage-api';
import {
  InMemoryCredentialStore,
  createNangoCredentialStore,
  createKeyChainStore,
} from '@inkeep/agents-core';
import { graph } from '../../src/index.js';

const logger = console; // Replace with proper logger

// Create credential stores
const credentialStores = [
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

// Initialize the agent graph
await graph.init();

// Initialize Management Server  
const managementServer = new ManagementServer({
  port: Number(process.env.MANAGEMENT_API_PORT) || 3002,
  credentialStores,
  serverOptions: {
    requestTimeout: 60000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
});

// Start the server
managementServer
  .serve()
  .then(() => {
    logger.info(
      \`📝 Management API running on http://localhost:\${managementServer.port}\`
    );
    logger.info(
      \`📝 OpenAPI documentation available at http://localhost:\${managementServer.port}/openapi.json\`
    );
  })
  .catch((error) => {
    logger.error('Failed to start Management API server:', error);
    process.exit(1);
  });`;

  await fs.writeFile('apps/manage-api/src/index.ts', manageApiIndex);

  // Execution API
  const runApiIndex = `import './instrumentation.js';
import { AgentExecutionServer } from '@inkeep/agents-run-api';
import {
  InMemoryCredentialStore,
  createNangoCredentialStore,
  createKeyChainStore,
} from '@inkeep/agents-core';
import { graph } from '../../src/index.js';

const logger = console; // Replace with proper logger

// Create credential stores
const credentialStores = [
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

// Initialize the agent graph
await graph.init();

// Initialize Execution Server
const executionServer = new AgentExecutionServer({
  port: Number(process.env.EXECUTION_API_PORT) || 3003,
  credentialStores,
  serverOptions: {
    requestTimeout: 120000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
});

// Start the server
executionServer
  .serve()
  .then(() => {
    logger.info(
      \`📝 Execution API running on http://localhost:\${executionServer.port}\`
    );
    logger.info(
      \`📝 OpenAPI documentation available at http://localhost:\${executionServer.port}/openapi.json\`
    );
  })
  .catch((error) => {
    logger.error('Failed to start Execution API server:', error);
    process.exit(1);
  });`;

  await fs.writeFile('apps/run-api/src/index.ts', runApiIndex);

  // Create instrumentation stub files
  const instrumentation = `// OpenTelemetry instrumentation placeholder
// Add your tracing/monitoring setup here`;
  
  await fs.writeFile('apps/manage-api/src/instrumentation.js', instrumentation);
  await fs.writeFile('apps/run-api/src/instrumentation.js', instrumentation);

  // Management UI setup
  const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    MANAGEMENT_API_URL: process.env.MANAGEMENT_API_URL || 'http://localhost:3002',
    EXECUTION_API_URL: process.env.EXECUTION_API_URL || 'http://localhost:3003',
  },
  experimental: {
    serverComponentsExternalPackages: ['@inkeep/agents-core'],
  },
};

module.exports = nextConfig;`;

  await fs.writeFile('apps/manage-ui/next.config.js', nextConfig);

  // Basic Next.js app structure
  await fs.ensureDir('apps/manage-ui/src/app');
  
  const appLayout = `import './globals.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}`;

  await fs.writeFile('apps/manage-ui/src/app/layout.tsx', appLayout);

  const appPage = `export default function Home() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-4xl font-bold mb-4">Agent Management UI</h1>
      <p className="text-lg mb-4">
        Welcome to your Inkeep Agent Framework project!
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Management API</h2>
          <p className="text-gray-600 mb-2">Agent configuration and management</p>
          <a 
            href="http://localhost:3002/openapi.json" 
            target="_blank"
            className="text-blue-500 hover:underline"
          >
            View API Documentation →
          </a>
        </div>
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-2">Execution API</h2>
          <p className="text-gray-600 mb-2">Agent execution and chat</p>
          <a 
            href="http://localhost:3003/openapi.json" 
            target="_blank"
            className="text-blue-500 hover:underline"
          >
            View API Documentation →
          </a>
        </div>
      </div>
    </div>
  )
}`;

  await fs.writeFile('apps/manage-ui/src/app/page.tsx', appPage);

  const globalsCss = `@tailwind base;
@tailwind components;
@tailwind utilities;`;

  await fs.writeFile('apps/manage-ui/src/app/globals.css', globalsCss);

  // Tailwind config
  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

  await fs.writeFile('apps/manage-ui/tailwind.config.js', tailwindConfig);

  // Add Tailwind to UI dependencies
  const uiPackageJson = await fs.readJson('apps/manage-ui/package.json');
  uiPackageJson.devDependencies = {
    ...uiPackageJson.devDependencies,
    autoprefixer: '^10',
    postcss: '^8',
    tailwindcss: '^3',
  };
  await fs.writeJson('apps/manage-ui/package.json', uiPackageJson, { spaces: 2 });

  // PostCSS config
  const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
  await fs.writeFile('apps/manage-ui/postcss.config.js', postcssConfig);

  // Add next-env.d.ts
  const nextEnvDts = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.`;
  await fs.writeFile('apps/manage-ui/next-env.d.ts', nextEnvDts);
}

async function createTurboConfig() {
  const turboConfig = {
    "$schema": "https://turbo.build/schema.json",
    ui: "tui",
    globalDependencies: ["**/.env", "**/.env.local", "**/.env.*"],
    globalEnv: [
      "NODE_ENV",
      "CI",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "ENVIRONMENT",
      "DB_FILE_NAME",
      "MANAGEMENT_API_PORT",
      "EXECUTION_API_PORT",
      "UI_PORT",
      "LOG_LEVEL",
      "NANGO_SECRET_KEY"
    ],
    tasks: {
      build: {
        dependsOn: ["^build"],
        inputs: ["$TURBO_DEFAULT$", ".env*"],
        outputs: ["dist/**", "build/**", ".next/**", "!.next/cache/**"]
      },
      dev: {
        cache: false,
        persistent: true
      },
      start: {
        dependsOn: ["build"],
        cache: false
      },
      test: {
        dependsOn: ["^build"],
        inputs: ["$TURBO_DEFAULT$", "**/*.{test,spec}.{js,jsx,ts,tsx}"],
        outputs: ["coverage/**"]
      },
      "test:watch": {
        cache: false,
        persistent: true
      },
      "test:coverage": {
        dependsOn: ["^build"], 
        inputs: ["$TURBO_DEFAULT$", "**/*.{test,spec}.{js,jsx,ts,tsx}"],
        outputs: ["coverage/**"]
      },
      lint: {
        inputs: ["$TURBO_DEFAULT$"],
        outputs: []
      },
      typecheck: {
        dependsOn: ["^build"],
        inputs: ["$TURBO_DEFAULT$"],
        outputs: []
      },
      "db:push": {
        cache: false,
        inputs: ["drizzle.config.ts", "src/data/db/schema.ts"]
      },
      "dev:apis": {
        cache: false,
        persistent: true
      }
    }
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
- **Management UI** (Port 3000): Web interface for agent management
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

3. **Start all services:**
   \`\`\`bash
   npm run dev
   \`\`\`

4. **Access your services:**
   - Management UI: http://localhost:3000
   - Management API: http://localhost:3002  
   - Execution API: http://localhost:3003

## Available Scripts

- \`npm run dev\` - Start all services in development mode
- \`npm run dev:apis\` - Start only the API services
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
│   ├── run-api/             # Execution API service  
│   └── manage-ui/           # Management UI (Next.js)
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
DB_FILE_NAME=./agent.sqlite

# Service Ports (default values)
MANAGEMENT_API_PORT=3002
EXECUTION_API_PORT=3003
UI_PORT=3000
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