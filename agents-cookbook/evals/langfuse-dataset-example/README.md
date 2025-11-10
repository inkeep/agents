# Langfuse Dataset Evaluation

This project provides two scripts for working with Langfuse datasets:

1. **Langfuse Example** (`langfuse-example.ts`) - Initializes a dataset with sample items
2. **Dataset Runner** (`langfuse-dataset.ts`) - Runs dataset items and creates traces

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up environment variables in a `.env` file:
   ```bash
   # Langfuse configuration (required for both scripts)
   LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
   LANGFUSE_SECRET_KEY=your_langfuse_secret_key
   LANGFUSE_BASE_URL=https://cloud.langfuse.com

   # Chat API configuration (for dataset runner)
   INKEEP_AGENTS_RUN_API_KEY=your_api_key
   INKEEP_AGENTS_RUN_API_URL=your_chat_api_base_url

   # Execution context (for dataset runner)
   INKEEP_TENANT_ID=your_tenant_id
   INKEEP_PROJECT_ID=your_project_id
   INKEEP_AGENT_ID=your_agent_id
   ```

## Usage

### 1. Langfuse Example

Run the basic Langfuse example to initialize dataset with sample user messages:

```bash
pnpm run langfuse-init-example
```

### 2. Running Dataset Items 

Run dataset items to generate traces:

```bash
pnpm run langfuse-run-dataset
```
