# create-agents

Create an Inkeep Agent Framework project with no build configuration.

## Quick Start

```bash
# Interactive mode
npm init agents
# or
npx create-agents

# With project name
npm init agents my-agent-project
# or
npx create-agents my-agent-project

# With options
npx create-agents my-project --template minimal --use-npm
```

## Usage

`create-agents` provides several ways to get started:

### Interactive Mode
Run without arguments for an interactive setup experience:
```bash
npx create-agents
```

You'll be prompted to choose:
- Project name
- Template type
- Package manager (pnpm, npm, yarn)
- Whether to install dependencies
- Whether to initialize git

### Direct Mode
Specify options directly:
```bash
npx create-agents my-project --template default --use-pnpm
```

## Templates

### `default` (recommended)
A complete setup with router and specialist agents:
- Router agent for handling user requests
- QA agent with search tools
- Task agent for action-oriented requests
- Full project structure with TypeScript, testing, and linting

### `minimal`
Bare minimum setup for quick prototyping:
- Single agent configuration
- Minimal dependencies
- Perfect for learning or simple use cases

### `hub-spoke` (coming soon)
Hub and spoke pattern with multiple specialist agents:
- Central router agent
- Multiple domain-specific agents
- Inter-agent communication examples

### `graph` (coming soon)
Complex agent network with delegation capabilities:
- Multi-agent workflows
- Task delegation patterns
- Advanced agent relationships

## Options

- `--template <template>` - Choose template: default, minimal, hub-spoke, graph
- `--use-npm` - Use npm instead of pnpm
- `--use-yarn` - Use yarn instead of pnpm
- `--skip-install` - Skip installing dependencies
- `--skip-git` - Skip git initialization

## What's Created

After running `create-agents`, you'll have:

```
my-project/
├── src/
│   ├── agents/          # Agent definitions
│   ├── tools/           # Tool implementations
│   └── server.ts        # Main server file
├── package.json
├── tsconfig.json
├── biome.json          # Linting and formatting
├── .env.example        # Environment variables
├── inkeep.config.ts    # Inkeep configuration
└── .gitignore
```

## Next Steps

1. **Navigate to your project:**
   ```bash
   cd my-project
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start development:**
   ```bash
   pnpm dev
   ```

4. **Push your agent configuration:**
   ```bash
   inkeep push src/agents/index.ts
   ```

5. **Start chatting:**
   ```bash
   inkeep chat
   ```

## Commands Available in Your Project

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm test` - Run test suite
- `pnpm lint` - Run linter
- `pnpm format` - Format code
- `pnpm typecheck` - Type checking

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
ANTHROPIC_API_KEY=your_key_here
INKEEP_TENANT_ID=your_tenant_id

# Optional
OPENAI_API_KEY=your_openai_key
PORT=3002
LOG_LEVEL=debug
```

## Learn More

- 📚 [Documentation](https://docs.inkeep.com/agents)
- 💬 [Discord Community](https://discord.gg/inkeep)
- 🐛 [Report Issues](https://github.com/inkeep/agents/issues)
- 📖 [Examples](https://github.com/inkeep/agents/tree/main/examples)

## Contributing

See the main [Inkeep Agents repository](https://github.com/inkeep/agents) for contribution guidelines.

## License

MIT