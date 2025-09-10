# Environment Configuration Guide

## Overview

The Inkeep Agents framework uses a **centralized environment configuration** pattern inspired by [Cal.com](https://github.com/calcom/cal.com). This approach provides a single source of truth for all environment variables across the monorepo, eliminating duplication and simplifying configuration management.

## Quick Start

For first-time setup, run:

```bash
./scripts/setup.sh
```

This will:
1. Create `.env` from the template
2. Set up user-global config at `~/.inkeep/config`
3. Create `.env.local` for repo-specific overrides
4. Install dependencies
5. Initialize the database

## Configuration Structure

### Single Root Configuration

All packages in the monorepo reference a **single `.env` file** at the repository root. This is different from the typical approach of having separate `.env` files per package.

```
agents-4/
├── .env                    # Main configuration (gitignored)
├── .env.example            # Template with all variables
├── .env.local              # Repo-specific overrides (gitignored)
└── packages/
    └── agents-core/
        └── src/env.ts      # Centralized env loader
```

### Loading Priority

Environment variables are loaded in the following order (highest priority first):

1. **`.env.local`** - Repository-specific overrides
2. **`~/.inkeep/config`** - User-global settings (shared across all repo copies)
3. **`.env`** - Main configuration file
4. **`.env.example`** - Default values

This hierarchy allows for flexible configuration management across different scenarios.

## Use Cases

### 1. Basic Local Development

For simple local development with a single repository copy:

```bash
# Copy the template
cp .env.example .env

# Edit .env with your configuration
vim .env

# Start development
pnpm dev
```

### 2. Multiple Local Repository Copies

When working with multiple local copies of the repository (e.g., for different features or experiments):

**Step 1: Set up user-global config** (`~/.inkeep/config`):
```bash
# Shared settings across all repos
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
```

**Step 2: Configure repo-specific settings** (`.env.local` in each repo):
```bash
# Repo 1: Feature branch
DB_FILE_NAME=file:../../feature-x.db

# Repo 2: Bug fix branch  
DB_FILE_NAME=file:../../bugfix-y.db

# Repo 3: Experiments
DB_FILE_NAME=postgresql://localhost:5432/experiments
```

### 3. Team Development

While the current setup doesn't include team sharing tools, teams can:

1. Share a common `.env.example` template via Git
2. Document required variables and where to obtain them
3. Use a password manager to share API keys securely
4. Consider adding [dotenv-vault](https://github.com/dotenv-org/dotenv-vault) in the future for encrypted sharing

### 4. Production Deployment

For production deployments:

```dockerfile
# Docker example
FROM node:22-alpine
COPY . .
# Don't copy .env files
# Pass environment variables at runtime
ENV DATABASE_URL=$DATABASE_URL
ENV ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

```yaml
# Kubernetes example
apiVersion: v1
kind: Secret
metadata:
  name: inkeep-secrets
stringData:
  DATABASE_URL: "postgresql://..."
  ANTHROPIC_API_KEY: "sk-ant-..."
```

## Environment Variables Reference

### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENVIRONMENT` | Environment mode | `development` | Yes |
| `NODE_ENV` | Node environment | `development` | Yes |
| `LOG_LEVEL` | Logging level | `info` | No |

### Database

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_FILE_NAME` | Database connection string | `file:../../local.db` | Yes |
| `DATABASE_URL` | PostgreSQL URL (optional) | - | No |
| `DATABASE_DIRECT_URL` | Direct DB URL for migrations | - | No |

### API Endpoints

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `INKEEP_AGENTS_MANAGE_API_URL` | Management API URL | `http://localhost:3002` | Yes |
| `INKEEP_AGENTS_RUN_API_URL` | Run API URL | `http://localhost:3003` | Yes |
| `NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL` | UI Management API URL | `http://localhost:3002` | Yes |
| `NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL` | UI Run API URL | `http://localhost:3003` | Yes |

### AI Providers

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key | - | For agents |
| `OPENAI_API_KEY` | OpenAI API key | - | Optional |
| `INKEEP_API_KEY` | Inkeep API key | - | Optional |

### Third-Party Services

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NANGO_SECRET_KEY` | Nango secret key | - | For OAuth |
| `NANGO_HOST` | Nango host URL | `http://localhost:3050` | No |
| `SIGNOZ_URL` | SigNoz URL | `http://localhost:3080` | No |
| `SIGNOZ_API_KEY` | SigNoz API key | - | No |

## Migration from Package-Specific .env Files

If you're migrating from the old package-specific approach:

1. **Consolidate variables**: Collect all unique variables from package `.env` files
2. **Update `.env.example`**: Add any missing variables to the root template
3. **Remove old files**: Delete package-specific `.env` files (keep `.env.example` for documentation)
4. **Update imports**: Ensure all packages import from `@inkeep/agents-core/env`
5. **Test thoroughly**: Verify all services start correctly with the new configuration

## Troubleshooting

### Environment variables not loading

1. Check loading order - later sources override earlier ones
2. Verify file paths are correct
3. Ensure `packages/agents-core` is built: `pnpm --filter @inkeep/agents-core build`

### Multiple repositories conflicting

Use `.env.local` for repo-specific settings like database URLs to avoid conflicts.

### Missing variables in production

Ensure all required variables are set in your deployment environment. The application will fail fast if critical variables are missing.

### Database connection issues

- For SQLite: Use relative paths from `packages/agents-core`
- For PostgreSQL: Ensure both `DATABASE_URL` and `DB_FILE_NAME` are set

## Best Practices

1. **Never commit secrets**: Keep `.env`, `.env.local`, and `~/.inkeep/config` gitignored
2. **Document variables**: Keep `.env.example` updated with descriptions
3. **Use defaults wisely**: Provide sensible defaults for development
4. **Validate early**: Use Zod schemas to validate environment variables at startup
5. **Separate build/runtime**: Don't rely on environment variables during build time
6. **Use prefixes**: Use `NEXT_PUBLIC_` for client-side variables in Next.js apps

## Implementation Details

The centralized configuration is implemented in `packages/agents-core/src/env.ts`:

```typescript
// Loading order (highest to lowest priority)
1. .env.local (repo-specific)
2. ~/.inkeep/config (user-global)  
3. .env (main config)
4. .env.example (defaults)
```

All packages import and use this centralized configuration:

```typescript
import { env } from '@inkeep/agents-core/env';

// Use validated, typed environment variables
console.log(env.DATABASE_URL);
console.log(env.ANTHROPIC_API_KEY);
```

## Future Enhancements

- **Team sharing**: Add [dotenv-vault](https://github.com/dotenv-org/dotenv-vault) for encrypted team sharing
- **Secret rotation**: Integrate with secret management services
- **Environment validation**: Add runtime checks for production requirements
- **Configuration UI**: Build a configuration interface for easier setup