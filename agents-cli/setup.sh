#!/bin/bash

# Inkeep CLI Setup Script
# This script sets up the Inkeep CLI

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Inkeep CLI Setup"
echo "=================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js >= 20.x first"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm is not installed${NC}"
    echo "Installing pnpm..."
    npm install -g pnpm
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""

# Build and install
echo "Building CLI..."
pnpm install
pnpm build
echo -e "${GREEN}✓ Build complete${NC}"
echo ""

# Install globally
echo "Installing globally..."
npm link
echo -e "${GREEN}✓ Global installation complete${NC}"
echo ""

# Verify installation
if command -v inkeep &> /dev/null; then
    echo -e "${GREEN}✓ 'inkeep' command is available at: $(which inkeep)${NC}"
else
    echo -e "${RED}❌ 'inkeep' command not found in PATH${NC}"
    exit 1
fi
echo ""

# Configure tenant (optional)
echo "Tenant configuration (optional)"
echo "You can set a tenant ID now or later with: inkeep tenant <tenant-id>"
echo -n "Enter tenant ID (press Enter to skip): "
read -r TENANT_ID

if [ -n "$TENANT_ID" ]; then
    inkeep tenant "$TENANT_ID"
    echo -e "${GREEN}✓ Tenant ID set to: $TENANT_ID${NC}"
fi
echo ""

# Final instructions
echo "========================================="
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Test the CLI:"
echo "   inkeep --version"
echo ""
echo "2. Configure tenant (if not done):"
echo "   inkeep tenant <your-tenant-id>"
echo ""
echo "3. List available agents:"
echo "   inkeep list-agents"
echo ""
echo "4. Start a chat session:"
echo "   inkeep chat"
echo ""
echo "For more help, see README.md and SETUP.md"
echo "========================================="