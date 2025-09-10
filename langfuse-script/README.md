# Langfuse Dataset Evaluation Script

This script runs Langfuse dataset evaluations against Inkeep agent graphs.

## Setup

1. Copy the environment example file:
   ```bash
   cp env.example .env
   ```

2. Fill in your configuration in `.env`:
   ```env
   # Required Langfuse credentials
   LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
   LANGFUSE_SECRET_KEY=your_langfuse_secret_key
   
   # Required Inkeep configuration
   INKEEP_API_KEY=your_inkeep_api_key
   INKEEP_TENANT_ID=inkeep
   INKEEP_PROJECT_ID=default
   INKEEP_GRAPH_ID=billing-qa-graph
   INKEEP_AGENTS_RUN_API_URL=http://localhost:3003
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

## Usage

### Simple Usage (using .env defaults)
```bash
# From project root
pnpm langfuse --dataset-id "testing-dataset"

# Or from langfuse-script directory
pnpm tsx langfuse-run.ts --dataset-id "testing-dataset"
```

### With Overrides
```bash
# From project root
pnpm langfuse \
  --dataset-id "testing-dataset" \
  --base-url "http://localhost:3002" \
  --run-description "Custom evaluation run"

# Or from langfuse-script directory
pnpm tsx langfuse-run.ts \
  --dataset-id "testing-dataset" \
  --base-url "http://localhost:3002" \
  --run-description "Custom evaluation run"
```

### All Available Options
```bash
# From project root
pnpm langfuse \
  --dataset-id "testing-dataset" \
  --tenant-id "custom-tenant" \
  --project-id "custom-project" \
  --graph-id "custom-graph" \
  --agent-id "specific-agent" \
  --run-name "Custom Evaluation" \
  --run-description "Custom description" \
  --base-url "http://localhost:3003" \
  --api-key "custom-api-key"
```

## Environment Variables

### Required
- `LANGFUSE_PUBLIC_KEY` - Your Langfuse public key
- `LANGFUSE_SECRET_KEY` - Your Langfuse secret key
- `INKEEP_API_KEY` - Your Inkeep API key
- `INKEEP_TENANT_ID` - Tenant ID for the agent
- `INKEEP_PROJECT_ID` - Project ID for the agent
- `INKEEP_GRAPH_ID` - Graph ID to evaluate

### Optional
- `LANGFUSE_BASE_URL` - Langfuse base URL (default: https://us.cloud.langfuse.com)
- `INKEEP_AGENTS_RUN_API_URL` - Inkeep agents API base URL (default: http://localhost:3002)
- `INKEEP_AGENT_ID` - Specific agent ID to use
- `INKEEP_RUN_NAME` - Default name for evaluation runs
- `INKEEP_RUN_DESCRIPTION` - Default description for evaluation runs
- `LOG_LEVEL` - Logging level (default: info)

## Command Line Arguments

Command line arguments override environment variables:

- `--dataset-id <id>` - **Required** Langfuse dataset ID
- `--tenant-id <id>` - Override `INKEEP_TENANT_ID`
- `--project-id <id>` - Override `INKEEP_PROJECT_ID`
- `--graph-id <id>` - Override `INKEEP_GRAPH_ID`
- `--agent-id <id>` - Override `INKEEP_AGENT_ID`
- `--run-name <name>` - Override `INKEEP_RUN_NAME`
- `--run-description <desc>` - Override `INKEEP_RUN_DESCRIPTION`
- `--base-url <url>` - Override `INKEEP_AGENTS_RUN_API_URL`
- `--api-key <key>` - Override `INKEEP_API_KEY`
- `--help, -h` - Show help message

## Example Workflow

1. Set up your environment variables with commonly used values
2. Run evaluations with just the dataset ID:
   ```bash
   pnpm langfuse --dataset-id "my-test-dataset"
   ```
3. Override specific values when needed:
   ```bash
   pnpm langfuse --dataset-id "my-test-dataset" --base-url "http://localhost:3002"
   ```
