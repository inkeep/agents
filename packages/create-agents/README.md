# create-agents

Create an Inkeep Agent Framework directory with multi-service architecture.

## Quick Start

```bash
# Interactive mode
npx create-agents

# With directory name
npx create-agents my-agent-directory

# With options
npx create-agents my-agent-directory  --project-id my-project --openai-key sk-... --anthropic-key sk-ant-...
```

## Usage

`@inkeep/create-agents` is a wrapper around the Inkeep CLI's `create` command that sets up a complete Agent Framework directory with:

### Interactive Mode
Run without arguments for an interactive setup experience:
```bash
npx create-agents
```

You'll be prompted for:
- Directory name
- Tenant ID
- Project ID  
- Anthropic API key (recommended)
- OpenAI API key (optional)

### Direct Mode
Specify options directly:
```bash
pnpm create-agents my-agent-directory --project-id my-project-id --anthropic-key sk-ant-... --openai-key sk-...
```

## Options

- `--project-id <project-id>` - Project identifier for your agents
- `--openai-key <openai-key>` - OpenAI API key (optional)
- `--anthropic-key <anthropic-key>` - Anthropic API key (recommended)

## What's Created

After running `@inkeep/create-agents`, you'll have a complete Agent Framework Directory:

```
my-agent-directory/
├── src/
│   └── <project-id>/           # Agent configurations
│       ├── hello.graph.ts      # Example agent graph
│       ├── inkeep.config.ts    # Inkeep CLI configuration
│       └── .env                # CLI environment variables
├── apps/
│   ├── manage-api/             # Manage API service
│   │   ├── src/index.ts        # API server entry point
│   │   ├── package.json        # Service dependencies
│   │   ├── tsconfig.json       # TypeScript config
│   │   └── .env                # Service environment
│   ├── run-api/                # Run API service  
│   │   ├── src/index.ts        # API server entry point
│   │   ├── package.json        # Service dependencies
│   │   ├── tsconfig.json       # TypeScript config
│   │   └── .env                # Service environment
│   └── shared/                 # Shared code
│       └── credential-stores.ts # Credential store config
├── package.json                # Root package with workspaces
├── turbo.json                  # Turbo build configuration
├── drizzle.config.ts           # Database configuration
├── biome.json                  # Linting and formatting
├── .env                        # Root environment variables
├── .env.example                # Environment template
├── .gitignore                  # Git ignore rules
└── README.md                   # Project documentation
```

## Next Steps

1. **Navigate to your directory:**
   ```bash
   cd my-agent-directory
   ```

2. **Start the services:**
   ```bash
   # Start both Manage API and Run API
   pnpm dev
   ```

3. **In a new terminal, start the Manage UI:**
   ```bash
   inkeep dev
   ```

4. **Deploy your project:**
   ```bash
   cd src/<project-id>/
   pnpm inkeep push
   ```

5. **Test your agents:**
   ```bash
   pnpm inkeep chat
   ```

## Available Services

After setup, you'll have access to:

- **Manage API** (Port 3002): Agent configuration and management
- **Run API** (Port 3003): Agent execution and chat processing  
- **Manage UI** (Port 3000): Visual agent builder (via `npx inkeep dev`)

## Commands Available in Your Directory

- `pnpm dev` - Start both API services with hot reload
- `pnpm db:push` - Apply database schema changes
- `inkeep dev` - Start the Manage UI
- `inkeep push` - Deploy project configurations
- `inkeep chat` - Interactive chat with your agents

## Environment Variables

The directory includes multiple environment files:

### Root `.env` (shared configuration)
```bash
# AI Provider Keys
ANTHROPIC_API_KEY=your-anthropic-key-here
OPENAI_API_KEY=your-openai-key-here

# Service Ports
MANAGE_API_PORT=3002
RUN_API_PORT=3003

# Database
DB_FILE_NAME=file:./local.db

# Environment
ENVIRONMENT=development
LOG_LEVEL=debug
```

### Service-specific `.env` files
- `apps/manage-api/.env` - Manage API configuration
- `apps/run-api/.env` - Run API configuration  
- `src/<project-id>/.env` - CLI configuration

## Learn More

- 📚 [Documentation](https://docs.inkeep.com)
