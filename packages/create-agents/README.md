## Launch your first agent

### Prerequisites

Before getting started, ensure you have the following installed on your system:

- [Node.js](https://nodejs.org/en/download/) version 22 or higher
- [Docker](https://docs.docker.com/get-docker/)
- [pnpm](https://pnpm.io/installation) version 10 or higher

You can verify by running:

```bash
node --version
pnpm --version
docker --version
```

### Step 1: Create a new agents project

Run the quickstart script on a target folder:

```bash
npx @inkeep/create-agents my-agents
```

Navigate to the folder

```bash
cd my-agents
```

Open the folder using your coding editor. To open with Cursor, you can run `cursor .`

### Step 2: Add SDK reference docs for AI coding (optional)

Add the Inkeep SDK skills to your project so AI coding assistants (Cursor, Copilot, Claude Code, etc.) have context about the Inkeep Agents SDK:

```bash
npx skills add inkeep/skills
```

This downloads reference documentation that AI assistants can use to help you build agents.

### Step 3: Run the setup script

Ensure Docker Desktop (or Docker daemon) is running before running the setup script.

```bash
pnpm setup-dev
```

Or if you are using a cloud database, you can skip the docker database startup by running:

```bash
pnpm setup-dev --skip-docker
```

Make sure your DATABASE_URL environment variable is configured for your cloud database.

### Step 4: Launch the dev environment

```bash
pnpm dev
```

The Visual Builder will auto-open at http://localhost:3000.

### Step 5: Chat with your agent

Navigate to the **Activities Planner** agent at http://localhost:3000 and ask about fun activities at a location of your choice:

![Chat with your agent](https://docs.inkeep.com/gifs/activities-planner.gif) 

### Next steps

- Learn about [inkeep push / pull](https://docs.inkeep.com/get-started/push-pull) so you can go from `SDK -> Visual Builder` and `Visual Builder -> SDK`.
- Follow our [meeting prep agent tutorial](https://docs.inkeep.com/tutorials/agents/meeting-prep-assistant) to create an agent using the Visual Builder.
- Follow our [fact finder agent tutorial](https://docs.inkeep.com/tutorials/agents/fact-finder) to create an agent using the TypeScript SDK.
- Install the [Inkeep MCP](https://docs.inkeep.com/get-started/inkeep-mcp) in your IDE to enable AI coding assistants to "vibe code" your Inkeep agents.