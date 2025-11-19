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
NC='\033[0m' # No Color

DB_HOST="localhost"
DB_USER="postgres"
DB_PASSWORD="password"
DB_NAME="inkeep_agents"

# Function to run psql commands
run_sql() {
  PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "$1"
}

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "❌ Error: Please run this script from the repository root directory"
  exit 1
fi

# 1. Create .env from template if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  
  # Get the current directory path for the database file
  CURRENT_DIR=$(pwd)
  DATABASE_URL="postgresql://appuser:password@localhost:5432/inkeep_agents"
  
  echo -e "${GREEN}✓${NC} Created .env from template"
  echo -e "${YELLOW}  → Please edit .env with your API keys and configuration${NC}"
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

# 6. Install dependencies
echo ""
echo "Installing dependencies..."
pnpm install
echo -e "${GREEN}✓${NC} Dependencies installed"

# 7. Setup database
echo ""
echo "Setting up database..."
if ! docker-compose -f docker-compose.db.yml up -d; then
  echo -e "${YELLOW}⚠️  Warning: Could not start local database with Docker${NC}"
  echo "   This is OK if the db is already running or you're using a cloud-hosted database (Neon, Vercel Postgres, etc.)"
  echo "   Make sure DATABASE_URL is set in your .env file"
  echo "\n"
  echo "\n"
fi

pnpm --filter @inkeep/agents-core db:migrate
echo -e "${GREEN}✓${NC} Database ready"


echo "Checking for changes..."
STATUS=$(run_sql "SELECT COUNT(*) FROM dolt_status;")
if [ "$STATUS" -gt 0 ]; then
  echo "Changes detected, staging..."
  run_sql "SELECT dolt_add('.');"
  
  echo "Committing..."
  COMMIT_HASH=$(run_sql "SELECT dolt_commit('-m', 'Applied database migrations');")
  echo "Committed: $COMMIT_HASH"
else
  echo "No changes to commit"
fi

echo ""
echo "================================================"
echo -e "${GREEN}  Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Edit .env with your configuration (API keys, etc.)"
echo "2. (Optional) Add personal settings to ~/.inkeep/config"
echo "3. (Optional) Add repo-specific overrides to .env"
echo "4. Run 'pnpm dev' to start the development servers"
echo ""
echo "Configuration loading order (highest priority first):"
echo "  1. .env (main config)"
echo "  2. ~/.inkeep/config (user-global)"
echo "  3. .env.example (defaults)"
echo ""