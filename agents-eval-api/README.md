# Agents Evaluation API

The Agents Evaluation API handles evaluations, datasets, and evaluation runs for the Inkeep Agent Framework.

## Features

- Dataset management (CRUD operations)
- Dataset item management
- Dataset run configurations
- Evaluation configurations (evaluators, suites, runs, jobs)
- Evaluation result tracking
- Integration with Agents Run API for running evaluations

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Environment Variables

- `AGENTS_EVAL_API_URL` - Base URL for the evaluation API (default: `http://localhost:3005`)
- `AGENTS_RUN_API_URL` - URL for the agents run API (default: `http://localhost:3003`)
- `DATABASE_URL` - Database connection string
- `LOG_LEVEL` - Logging level (default: `debug`)
- `INKEEP_AGENTS_EVAL_API_BYPASS_SECRET` - Optional bypass secret for authentication

## API Documentation

Once the server is running, visit `/docs` for interactive API documentation.

