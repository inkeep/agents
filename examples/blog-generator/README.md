# Blog Generator Project

An Inkeep Agent project for generating blog posts from URLs and research materials.

## Project Structure

```
blog-generator/
├── index.ts                    # Main project export
├── agents/                     # Agent definitions
│   ├── jzgxqg7rxvmofnvl7ysxp.ts  # Main agent
│   ├── orchestrator.ts         # Orchestrator sub-agent
│   ├── 02-url-to-markdown.ts   # URL scraper (uses Firecrawl)
│   ├── 03-qualification-agent.ts # Content qualifier
│   ├── 04-content-strategist-agent.ts # Content strategist
│   └── 05-content-writer.ts    # Content writer
├── tools/                      # Tool definitions
│   └── firecrawl-mcp.ts       # Firecrawl MCP tool
└── README.md                   # This file
```

## Agents

### 02-url-to-markdown
Scrapes URLs and converts them to clean markdown using Firecrawl MCP. This is the first step in the blog creation workflow.

### 03-qualification-agent
Evaluates the quality and relevance of source material.

### 04-content-strategist-agent
Plans the content strategy and structure for the blog post.

### 05-content-writer
Generates the final blog post content.

### Orchestrator
Coordinates the workflow between all agents.

## Setup

### 1. Install Dependencies

Make sure you have the Inkeep Agent Framework installed:

```bash
cd /Users/omarnasser/Documents/Growth-stuff/Inkeep_Blog_Generator/my-agent-directory
pnpm install
```

### 2. Start Inkeep Services

```bash
pnpm dev
```

This will start:
- Management API (port 3002)
- Run API (port 3003)
- Visual Builder UI (port 3000)

### 3. Setup Firecrawl MCP Tool

The `02-url-to-markdown` agent uses Firecrawl MCP for web scraping. Since Firecrawl MCP uses stdio transport, you need to run a proxy to convert it to HTTP/SSE for the Visual Builder.

#### Option 1: Use the provided script (Recommended)

```bash
# Install mcp-proxy globally
npm install -g mcp-proxy

# Run the proxy script
./start-firecrawl-proxy.sh
```

This will start the Firecrawl MCP proxy on `http://localhost:4000/mcp`.

#### Option 2: Run manually

```bash
# Set your Firecrawl API key
export FIRECRAWL_API_KEY="fc-a714655fe4e94a0086be8c2c7d5bf759"

# Start the proxy
mcp-proxy --port 4000 --shell "npx -y firecrawl-mcp"
```

#### Option 3: Use environment configuration

You can also configure Firecrawl MCP to use different settings per environment (development, staging, production). See the Inkeep documentation on [Environment Management](https://docs.inkeep.com/typescript-sdk/environments).

## Usage

### Via Visual Builder

1. Open http://localhost:3000
2. Navigate to your project: `blog-generator`
3. Start a conversation with the orchestrator agent
4. Provide URLs or research materials to generate a blog post

### Via CLI

```bash
# Push project to server
cd /Users/omarnasser/Documents/Growth-stuff/Inkeep_Blog_Generator/my-agent-directory/src/projects/blog-generator
npx inkeep push --config ../../../src/inkeep.config.ts

# Pull latest changes from server
npx inkeep pull --config ../../../src/inkeep.config.ts
```

## Workflow

1. **User provides URLs** → Orchestrator receives request
2. **Orchestrator delegates to 02-url-to-markdown** → Scrapes URLs using Firecrawl
3. **Source material created** → Consolidated markdown file with all content
4. **03-qualification-agent evaluates** → Checks quality and relevance
5. **04-content-strategist-agent plans** → Creates content structure
6. **05-content-writer generates** → Produces final blog post

## Configuration

### Firecrawl API Key

The Firecrawl API key is currently hardcoded in:
- `tools/firecrawl-mcp.ts` (for proxy configuration)
- `start-firecrawl-proxy.sh` (for running the proxy)

For production use, consider:
1. Moving the API key to environment variables
2. Using Inkeep's credential management system
3. Setting up environment-specific configurations

### Project Models

The project uses Claude Sonnet 4.5 for all model types:
- Base model
- Structured output
- Summarizer

You can modify these in `index.ts`.

## Troubleshooting

### Firecrawl MCP not working

1. Make sure the proxy is running on port 4000:
   ```bash
   curl http://localhost:4000/mcp
   ```

2. Check that mcp-proxy is installed:
   ```bash
   which mcp-proxy
   ```

3. Verify your Firecrawl API key is valid

### Agent not using Firecrawl tool

1. Check that the tool is properly imported in `02-url-to-markdown.ts`
2. Verify the agent has `canUse: () => [firecrawlMcpTool]` configured
3. Push the project again to sync changes

### Port conflicts

If port 4000 is already in use, you can change it:

1. Edit `tools/firecrawl-mcp.ts` and change the `serverUrl` port
2. Edit `start-firecrawl-proxy.sh` and change the `--port` value
3. Restart the proxy

## Resources

- [Inkeep Documentation](https://docs.inkeep.com/)
- [MCP Tools Guide](https://docs.inkeep.com/typescript-sdk/tools/mcp-tools)
- [Firecrawl MCP](https://github.com/mendableai/firecrawl)
- [mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)


