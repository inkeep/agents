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
pnpm start --dataset-id <id>
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
- `LOG_LEVEL` - Logging level (default: info)


## Example Workflow

1. Set up your environment variables with commonly used values
2. Run evaluations with just the dataset ID:
   ```bash
   pnpm langfuse --dataset-id "my-test-dataset"
   ```

