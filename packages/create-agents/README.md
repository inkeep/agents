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

### Step 2: Run the setup script

Ensure Docker Desktop (or Docker daemon) is running before running the setup script.

```bash
pnpm setup-dev
```

Or if you are using a cloud database, you can skip the local Docker database startup by running:

```bash
pnpm setup-dev:cloud
```

Make sure your `INKEEP_AGENTS_MANAGE_DATABASE_URL` and `INKEEP_AGENTS_RUN_DATABASE_URL` environment variables are configured in `.env` for your cloud databases.

### Step 3: Launch the dev environment

```bash
pnpm dev
```

The Visual Builder will auto-open at http://localhost:3000. You'll be signed in automatically.

### Step 4: Chat with your agent

Navigate to the **Activities Planner** agent at http://localhost:3000 and ask about fun activities at a location of your choice:

![Chat with your agent](https://docs.inkeep.com/gifs/activities-planner.gif) 

### Next steps

- Set up [AI coding for Inkeep](https://docs.inkeep.com/get-started/ai-coding-setup-for-ide) with skills and MCP.
- Learn about [inkeep push / pull](https://docs.inkeep.com/get-started/push-pull) so you can go from `SDK -> Visual Builder` and `Visual Builder -> SDK`.
- Follow our [meeting prep agent tutorial](https://docs.inkeep.com/tutorials/agents/meeting-prep-assistant) to create an agent using the Visual Builder.
- Follow our [fact finder agent tutorial](https://docs.inkeep.com/tutorials/agents/fact-finder) to create an agent using the TypeScript SDK.