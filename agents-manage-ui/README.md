This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Agent Builder

This application provides a UI for building and managing agents. It integrates with the agents-manage-api and agents-run-api backend services to provide full CRUD operations for agent management and real-time chat execution.

### Features

- **Full Agent API Integration**: Complete server actions for creating, reading, updating, and deleting agents
- **Type Safety**: Full TypeScript support with Zod schema validation
- **Server Actions**: Next.js server actions for seamless client-server communication
- **Error Handling**: Comprehensive error handling with proper error codes and messages

### Traces Feature

The Agent Builder includes a traces view that displays real-time conversation statistics from your agents. This feature integrates with SigNoz to provide insights into:

- Total conversations in the last 24 hours
- Tool calls per conversation (including MCP tools)
- Agent transfers tracking
- Agent delegations tracking

#### Setting up SigNoz for Traces

1. **Run SigNoz locally** (if not already running):
   - Ensure SigNoz is accessible at `http://localhost:3080`

2. **Create an API key in SigNoz**:
   - Navigate to SigNoz UI at `http://localhost:3080`
   - Go to **Settings** → **API Keys**
   - Click **New Key** and create a new API key
   - Copy the generated API key

3. **Configure environment variables** in your `.env.local`:
   ```bash
   SIGNOZ_URL=http://localhost:3080
   SIGNOZ_API_KEY=your-api-key-here
   ```

4. **Access the Traces view**:
   - Start the Agent Builder: `pnpm dev`
   - Navigate to the **Traces** section in the sidebar

### Configuration

Create a `.env.local` file with the following configuration:

```bash
# Inkeep Configuration
TENANT_ID="default"
INKEEP_AGENTS_MANAGE_API_URL="http://localhost:3002" # URL where agents-manage-api is running
INKEEP_AGENTS_RUN_API_URL="http://localhost:3003" # URL where agents-run-api is running

# SigNoz Configuration (for Traces feature)
SIGNOZ_URL=http://localhost:3080
SIGNOZ_API_KEY=your-signoz-api-key-here
```

For detailed usage instructions and examples, see the [Library Documentation](./src/lib/README.md).

## Getting Started

Install dependencies
```bash
pnpm install
```

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
