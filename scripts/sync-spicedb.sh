#!/bin/bash
#
# SpiceDB Migration Script
#
# One-time migration to sync existing organizations and projects to SpiceDB.
#
# Prerequisites:
#   - zed CLI installed (brew install authzed/tap/zed)
#   - psql installed (for database queries)
#   - SpiceDB running with schema applied
#
# Environment:
#   - INKEEP_AGENTS_RUN_DATABASE_URL (or DATABASE_URL) - Runtime database connection
#   - SPICEDB_ENDPOINT - SpiceDB gRPC endpoint (default: localhost:50051)
#   - SPICEDB_PRESHARED_KEY - SpiceDB auth token
#   - SYNC_TENANT_ID - (optional) Sync only this organization ID. If not set, syncs all orgs.
#
# Tables queried (from runtime DB):
#   - organization: org IDs and names
#   - member: user-org memberships with roles
#   - project_metadata: project IDs and tenant IDs
#
# Usage (Local Dev - uses .env automatically):
#   ./scripts/sync-spicedb.sh                    # Dry run (all orgs)
#   ./scripts/sync-spicedb.sh --apply            # Apply to local SpiceDB
#   SYNC_TENANT_ID=default ./scripts/sync-spicedb.sh --apply  # Sync only one org
#
# Usage (Production - Authzed Cloud):
#   SPICEDB_ENDPOINT=<your-endpoint>:443 \
#   SPICEDB_PRESHARED_KEY=<your-api-key> \
#   INKEEP_AGENTS_RUN_DATABASE_URL=<prod-db-url> \
#   SYNC_TENANT_ID=<org-id> \
#   ./scripts/sync-spicedb.sh --apply
#
# What it does:
#   1. Syncs all organization members with their roles (owner/admin/member)
#   2. Links all projects to their organizations
#   3. Does NOT grant project-level access (org admins will do this manually)
#

set -e

# Auto-load .env from project root if it exists (safely parse only valid lines)
# IMPORTANT: Only set variables that aren't already defined (don't overwrite CLI args)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
if [ -f "$PROJECT_ROOT/.env" ]; then
  # Only export lines that look like VAR=value (ignore comments, empty lines, invalid syntax)
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Only process lines that match VAR=value pattern
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)= ]]; then
      var_name="${BASH_REMATCH[1]}"
      # Only set if not already defined (preserve CLI/env overrides)
      if [ -z "${!var_name+x}" ]; then
        export "$line" 2>/dev/null || true
      fi
    fi
  done < "$PROJECT_ROOT/.env"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=true
VERBOSE=false

for arg in "$@"; do
  case $arg in
    --apply)
      DRY_RUN=false
      ;;
    --verbose|-v)
      VERBOSE=true
      ;;
  esac
done

# Environment variables with defaults
# Use INKEEP_AGENTS_RUN_DATABASE_URL (runtime DB has organization, member, project_metadata tables)
DATABASE_URL="${INKEEP_AGENTS_RUN_DATABASE_URL:-${DATABASE_URL:-}}"
SPICEDB_ENDPOINT="${SPICEDB_ENDPOINT:-localhost:50051}"
SPICEDB_TOKEN="${SPICEDB_PRESHARED_KEY:-dev-secret-key}"
SYNC_TENANT_ID="${SYNC_TENANT_ID:-}"  # Optional: sync only this org (won't conflict with .env TENANT_ID)

# Validate required env vars
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ DATABASE_URL or INKEEP_AGENTS_RUN_DATABASE_URL environment variable is required${NC}"
  echo ""
  echo "Example:"
  echo "  INKEEP_AGENTS_RUN_DATABASE_URL=postgres://user:pass@localhost:5432/dbname ./scripts/sync-spicedb.sh"
  exit 1
fi

# Check for required tools
if ! command -v psql &> /dev/null; then
  echo -e "${RED}❌ psql is required but not installed${NC}"
  echo "   Install with: brew install postgresql"
  exit 1
fi

if ! command -v zed &> /dev/null; then
  echo -e "${RED}❌ zed CLI is required but not installed${NC}"
  echo "   Install with: brew install authzed/tap/zed"
  exit 1
fi

# Build zed connection args
ZED_ARGS="--endpoint $SPICEDB_ENDPOINT --token $SPICEDB_TOKEN"

# Use insecure for localhost, otherwise TLS is required (Authzed Cloud)
if [[ "$SPICEDB_ENDPOINT" == *"localhost"* ]] || [[ "$SPICEDB_ENDPOINT" == *"127.0.0.1"* ]]; then
  ZED_ARGS="$ZED_ARGS --insecure"
fi
# Note: For Authzed Cloud endpoints (*.authzed.cloud), TLS is used by default - no flag needed

# Stats
ORGS_PROCESSED=0
MEMBERS_PROCESSED=0
PROJECTS_PROCESSED=0
RELATIONSHIPS_CREATED=0

# Header
echo ""
echo -e "${BLUE}🔧 SpiceDB Migration Script${NC}"
echo "═══════════════════════════════════════════════════════════════"
if [ "$DRY_RUN" = true ]; then
  echo -e "Mode:     ${YELLOW}🔍 DRY RUN (no changes)${NC}"
else
  echo -e "Mode:     ${GREEN}✏️  APPLY (writing to SpiceDB)${NC}"
fi
echo "SpiceDB:  $SPICEDB_ENDPOINT"
echo "Database: ${DATABASE_URL//:*@/:****@}"
if [ -n "$SYNC_TENANT_ID" ]; then
  echo -e "Tenant:   ${GREEN}$SYNC_TENANT_ID${NC} (filtering to this org only)"
else
  echo "Tenant:   (all organizations)"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Function to write a relationship
write_relationship() {
  local resource_type=$1
  local resource_id=$2
  local relation=$3
  local subject_type=$4
  local subject_id=$5
  
  local rel_str="${resource_type}:${resource_id} ${relation} ${subject_type}:${subject_id}"
  
  if [ "$DRY_RUN" = true ]; then
    if [ "$VERBOSE" = true ]; then
      echo -e "  ${YELLOW}[DRY RUN]${NC} Would create: $rel_str"
    fi
    ((RELATIONSHIPS_CREATED++)) || true
    return 0
  fi
  
  # Use zed relationship touch (idempotent - creates or updates)
  if zed relationship touch $ZED_ARGS "${resource_type}:${resource_id}" "${relation}" "${subject_type}:${subject_id}" 2>/dev/null; then
    if [ "$VERBOSE" = true ]; then
      echo -e "  ${GREEN}✓${NC} Created: $rel_str"
    fi
    ((RELATIONSHIPS_CREATED++)) || true
  else
    echo -e "  ${RED}✗${NC} Error creating: $rel_str"
  fi
}

# Sync organizations and members
sync_organizations() {
  echo -e "${BLUE}📁 Syncing Organizations...${NC}"
  echo ""
  
  # Query organizations (filter by SYNC_TENANT_ID if set)
  local org_query="SELECT id, name FROM organization"
  if [ -n "$SYNC_TENANT_ID" ]; then
    org_query="$org_query WHERE id = '$SYNC_TENANT_ID'"
  fi
  local orgs=$(psql "$DATABASE_URL" -t -A -F '|' -c "$org_query")
  
  while IFS='|' read -r org_id org_name; do
    [ -z "$org_id" ] && continue
    
    echo "  Organization: $org_name ($org_id)"
    ((ORGS_PROCESSED++)) || true
    
    # Query members for this org
    local members=$(psql "$DATABASE_URL" -t -A -F '|' -c "SELECT user_id, COALESCE(role, 'member') FROM member WHERE organization_id = '$org_id'")
    local member_count=0
    
    while IFS='|' read -r user_id role; do
      [ -z "$user_id" ] && continue
      
      write_relationship "organization" "$org_id" "$role" "user" "$user_id"
      ((MEMBERS_PROCESSED++)) || true
      ((member_count++)) || true
    done <<< "$members"
    
    echo "    → $member_count members synced"
    echo ""
  done <<< "$orgs"
}

# Sync projects
sync_projects() {
  echo -e "${BLUE}📂 Syncing Projects...${NC}"
  echo ""
  
  # Query project_metadata (runtime DB) - filter by SYNC_TENANT_ID if set
  local project_query="SELECT id, tenant_id FROM project_metadata"
  if [ -n "$SYNC_TENANT_ID" ]; then
    project_query="$project_query WHERE tenant_id = '$SYNC_TENANT_ID'"
  fi
  local projects=$(psql "$DATABASE_URL" -t -A -F '|' -c "$project_query")
  local project_count=0
  
  while IFS='|' read -r project_id tenant_id; do
    [ -z "$project_id" ] && continue
    
    if [ "$VERBOSE" = true ]; then
      echo "  Project: $project_id → org:$tenant_id"
    fi
    
    write_relationship "project" "$project_id" "organization" "organization" "$tenant_id"
    ((PROJECTS_PROCESSED++)) || true
    ((project_count++)) || true
  done <<< "$projects"
  
  echo "  → $project_count projects synced"
  echo ""
}

# Main
sync_organizations
sync_projects

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 Summary${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo "  Organizations processed: $ORGS_PROCESSED"
echo "  Members processed:       $MEMBERS_PROCESSED"
echo "  Projects processed:      $PROJECTS_PROCESSED"
echo "  Relationships created:   $RELATIONSHIPS_CREATED"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}🔍 This was a DRY RUN. No changes were made to SpiceDB.${NC}"
  echo "   Run with --apply to actually sync data."
else
  echo ""
  echo -e "${GREEN}✅ Migration complete!${NC}"
fi

echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo "   1. Verify relationships: `pnpm spicedb:read:orgs` and `pnpm spicedb:read:projects`"
echo "   2. Org admins should assign users to projects via the UI"
echo "   3. Test access: zed permission check $ZED_ARGS project:<id> view user:<id>"
echo ""

