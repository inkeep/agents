#!/bin/bash

# Inkeep Agents Development Environment Setup Script
# This script sets up the development environment for first-time users

set -e

echo "================================================"
echo "  Inkeep Agents Development Environment Setup"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Doltgres (Manage DB) configuration
MANAGE_DB_HOST="localhost"
MANAGE_DB_PORT="5432"
MANAGE_DB_USER="appuser"
MANAGE_DB_PASSWORD="password"
MANAGE_DB_NAME="inkeep_agents"

# Postgres (Runtime DB) configuration
RUN_DB_HOST="localhost"
RUN_DB_PORT="5433"
RUN_DB_USER="appuser"
RUN_DB_PASSWORD="password"
RUN_DB_NAME="inkeep_agents"

# Function to run psql commands on Manage DB (Doltgres)
run_manage_sql() {
  PGPASSWORD=$MANAGE_DB_PASSWORD psql -h $MANAGE_DB_HOST -p $MANAGE_DB_PORT -U $MANAGE_DB_USER -d $MANAGE_DB_NAME -t -c "$1"
}

# Function to run psql commands on Runtime DB (Postgres)
run_runtime_sql() {
  PGPASSWORD=$RUN_DB_PASSWORD psql -h $RUN_DB_HOST -p $RUN_DB_PORT -U $RUN_DB_USER -d $RUN_DB_NAME -t -c "$1"
}

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "❌ Error: Please run this script from the repository root directory"
  exit 1
fi

# Check Node.js version (reads from .node-version)
NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED_VERSION=$(cat .node-version | tr -d '[:space:]')
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
  echo "❌ Error: Node.js >= $REQUIRED_VERSION is required (found v$NODE_VERSION)"
  echo "   Run 'nvm use' or install Node.js $REQUIRED_VERSION"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js v$NODE_VERSION detected"

# Enable corepack for package manager version management
echo "Enabling corepack..."
corepack enable
echo -e "${GREEN}✓${NC} Corepack enabled"

# 1. Create .env from template if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  
  echo -e "${GREEN}✓${NC} Created .env from template"
  echo -e "${YELLOW}  → Please edit .env with your API keys and configuration${NC}"
  echo -e "${YELLOW}  → Make sure to set:${NC}"
  echo -e "${YELLOW}      INKEEP_AGENTS_MANAGE_DATABASE_URL=postgresql://appuser:password@localhost:5432/inkeep_agents${NC}"
  echo -e "${YELLOW}      INKEEP_AGENTS_RUN_DATABASE_URL=postgresql://appuser:password@localhost:5433/inkeep_agents${NC}"
else
  echo -e "${GREEN}✓${NC} .env already exists"
fi

# 2. Create user config directory if it doesn't exist
USER_CONFIG_DIR="$HOME/.inkeep"
if [ ! -d "$USER_CONFIG_DIR" ]; then
  mkdir -p "$USER_CONFIG_DIR"
  echo -e "${GREEN}✓${NC} Created user config directory at ~/.inkeep/"
fi

# 3. Create user config file with template if it doesn't exist
USER_CONFIG_FILE="$USER_CONFIG_DIR/config"
if [ ! -f "$USER_CONFIG_FILE" ]; then
  cat > "$USER_CONFIG_FILE" << 'EOF'
# ============================================
# Inkeep User-Global Configuration
# ============================================
# This file contains settings that apply to ALL local copies of the Inkeep repository.
# Add your personal API keys here to avoid duplicating them across multiple repos.

# Example: Add your API keys here
# ANTHROPIC_API_KEY=sk-ant-xxx
# OPENAI_API_KEY=sk-xxx

EOF
  echo -e "${GREEN}✓${NC} Created user config at ~/.inkeep/config"
  echo -e "${YELLOW}  → Add your personal API keys to ~/.inkeep/config${NC}"
else
  echo -e "${GREEN}✓${NC} User config already exists at ~/.inkeep/config"
fi

# 4. Add .env to .gitignore if not already there
if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
  echo ".env" >> .gitignore
  echo -e "${GREEN}✓${NC} Added .env to .gitignore"
fi

# 5. Install dependencies
echo ""
echo "Installing dependencies..."
pnpm install
echo -e "${GREEN}✓${NC} Dependencies installed"

# 6. Setup databases (Doltgres for manage, Postgres for runtime, optionally SpiceDB)
echo ""
echo "Setting up databases..."
echo "  - Doltgres (manage/config) on port $MANAGE_DB_PORT"
echo "  - Postgres (runtime) on port $RUN_DB_PORT"
if grep -qE "^ENABLE_AUTHZ=true" .env 2>/dev/null; then
  echo "  - SpiceDB (authz) on ports 50051 (gRPC), 8443 (HTTP), backed by postgres on 5434"
  DOCKER_COMPOSE_CMD="docker compose -f docker-compose.dbs.yml --profile authz up -d"
else
  DOCKER_COMPOSE_CMD="docker compose -f docker-compose.dbs.yml up -d"
fi

if ! $DOCKER_COMPOSE_CMD; then
  echo -e "${YELLOW}⚠️  Warning: Could not start local databases with Docker${NC}"
  echo "   This is OK if the databases are already running or you're using cloud-hosted databases"
  echo "   Make sure INKEEP_AGENTS_MANAGE_DATABASE_URL and INKEEP_AGENTS_RUN_DATABASE_URL are set in your .env file"
  echo ""
fi

# Wait for databases to be ready
echo "Waiting for databases to be ready..."
sleep 5

# 7. Run migrations for both databases
echo ""
echo "Running database migrations..."

# Create the database in Doltgres if it doesn't exist
echo "  Setting up Doltgres manage database..."
PGPASSWORD=$MANAGE_DB_PASSWORD psql -h $MANAGE_DB_HOST -p $MANAGE_DB_PORT -U $MANAGE_DB_USER -d postgres -c "CREATE DATABASE $MANAGE_DB_NAME;" 2>/dev/null || true

# Create the database in Postgres if it doesn't exist (usually auto-created by docker-compose)
echo "  Setting up Postgres runtime database..."

# Run migrations
echo "  Running manage database migrations..."
pnpm --filter @inkeep/agents-core db:manage:migrate
echo -e "${GREEN}✓${NC} Manage database migrations applied"

echo "  Running runtime database migrations..."
pnpm --filter @inkeep/agents-core db:run:migrate
echo -e "${GREEN}✓${NC} Runtime database migrations applied"

# 8. Setup SpiceDB schema (authorization) - only if ENABLE_AUTHZ=true
if grep -qE "^ENABLE_AUTHZ=true" .env 2>/dev/null; then
  echo ""
  echo "Setting up SpiceDB (ENABLE_AUTHZ=true)..."

  # Check if zed CLI is installed
  if command -v zed &> /dev/null; then
    # Wait for SpiceDB to be ready
    echo "  Waiting for SpiceDB to be ready..."
    for i in {1..30}; do
      if zed schema read --insecure --endpoint localhost:50051 --token dev-secret-key &>/dev/null; then
        break
      fi
      sleep 1
    done
    
    # Write schema from packages/agents-core/spicedb/schema.zed
    SCHEMA_PATH="packages/agents-core/spicedb/schema.zed"
    echo "  Writing SpiceDB schema from $SCHEMA_PATH..."
    if zed schema write $SCHEMA_PATH --insecure --endpoint localhost:50051 --token dev-secret-key 2>/dev/null; then
      echo -e "${GREEN}✓${NC} SpiceDB schema applied"
    else
      echo -e "${YELLOW}⚠️  Could not write SpiceDB schema (SpiceDB may still be starting)${NC}"
      echo "   Wait a few seconds and re-run 'pnpm setup-dev' to retry"
    fi
  else
    echo -e "${YELLOW}⚠️  zed CLI not installed - skipping SpiceDB schema setup${NC}"
    echo "   Install with: brew install authzed/tap/zed"
    echo "   Then re-run 'pnpm setup-dev' to apply the schema"
  fi
else
  echo ""
  echo -e "${GREEN}✓${NC} Skipping SpiceDB setup (ENABLE_AUTHZ=false)"
  echo "   Set ENABLE_AUTHZ=true in .env to enable fine-grained authorization"
fi

# 9. Commit Doltgres changes (Dolt versioning)
echo ""
echo "Checking for Doltgres changes..."
STATUS=$(run_manage_sql "SELECT COUNT(*) FROM dolt_status;" 2>/dev/null || echo "0")
STATUS=$(echo "$STATUS" | tr -d '[:space:]')

if [ "$STATUS" != "" ] && [ "$STATUS" -gt 0 ] 2>/dev/null; then
  echo "  Changes detected in Doltgres, staging..."
  run_manage_sql "SELECT dolt_add('.');"
  
  echo "  Committing..."
  COMMIT_HASH=$(run_manage_sql "SELECT dolt_commit('-m', 'Applied database migrations');")
  echo -e "${GREEN}✓${NC} Doltgres changes committed: $COMMIT_HASH"
else
  echo -e "${GREEN}✓${NC} No Doltgres changes to commit"
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Database Architecture:"
echo "  - Doltgres (port $MANAGE_DB_PORT): Configuration/management entities (versioned)"
echo "  - Postgres (port $RUN_DB_PORT): Runtime entities (conversations, messages, etc.)"
if grep -qE "^ENABLE_AUTHZ=true" .env 2>/dev/null; then
  echo "  - SpiceDB (port 5434): Authorization (fine-grained permissions)"
fi
echo ""
echo "Next steps:"
echo "1. Edit .env with your configuration (API keys, etc.)"
echo "2. (Optional) Add personal settings to ~/.inkeep/config"
if grep -qE "^ENABLE_AUTHZ=true" .env 2>/dev/null; then
  echo "3. (Optional) Sync existing data to SpiceDB: pnpm spicedb:sync:apply"
  echo "4. Run 'pnpm dev' to start the development servers"
else
  echo "3. Run 'pnpm dev' to start the development servers"
fi
echo ""
echo "Configuration loading order (highest priority first):"
echo "  1. .env (main config)"
echo "  2. ~/.inkeep/config (user-global)"
echo "  3. .env.example (defaults)"
echo ""
