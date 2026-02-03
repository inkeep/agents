# Slack Work App - Developer Commands & Scripts

Quick reference for managing the Slack work app during development.

---

## Table of Contents

1. [Database Management](#database-management)
2. [User Management](#user-management)
3. [Slack Tables Operations](#slack-tables-operations)
4. [Testing Workflows](#testing-workflows)

---

## Database Management

### Reset Everything (Nuclear Option)

```bash
# Drop all tables and recreate (from monorepo root)
pnpm db:drop  # Select migrations to drop
pnpm db:generate
pnpm db:migrate
pnpm db:auth:init  # Recreate admin user
```

### Run Migrations

```bash
# Generate migrations from schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

### Check Migration Status

```sql
-- Check applied migrations (runtime DB)
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC;
```

---

## User Management

### Auth Model Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AUTHORIZATION MODEL                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Organization (tenant)                                              │
│  └── Members (users with roles)                                     │
│       ├── owner   → Full admin + can delete org                     │
│       ├── admin   → Full admin (install apps, manage settings)      │
│       └── member  → Basic user (link account, use agents)           │
│                                                                     │
│  For Slack Work App:                                                │
│  • owner/admin → Can install, configure workspace/channel agents    │
│  • member      → Can link account, use agents, set personal default │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Create Admin User (via script)

```bash
# Set environment variables in .env
INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com
INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12

# Run initialization
pnpm db:auth:init
```

### Create Additional Users via SQL

```sql
-- 1. Create a new user
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
VALUES (
  'user_' || substr(md5(random()::text), 1, 21),
  'Test User',
  'testuser@example.com',
  true,
  NOW(),
  NOW()
)
RETURNING id, email;

-- 2. Create password account (use bcrypt hash of your password)
-- Password: "password123" → bcrypt hash below
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT 
  'acc_' || substr(md5(random()::text), 1, 21),
  u.id,
  'credential',
  u.id,
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "password123"
  NOW(),
  NOW()
FROM "user" u
WHERE u.email = 'testuser@example.com';

-- 3. Add user to organization as member
INSERT INTO member (id, organization_id, user_id, role, created_at)
SELECT 
  'mem_' || substr(md5(random()::text), 1, 21),
  'default',  -- Your tenant/org ID
  u.id,
  'member',   -- 'owner', 'admin', or 'member'
  NOW()
FROM "user" u
WHERE u.email = 'testuser@example.com';
```

### Create Test Users Script (Recommended)

Run the test users script directly:

```bash
# From monorepo root
cd packages/agents-core && npx tsx src/auth/create-test-users.ts
```

This creates:
| Email | Password | Role |
|-------|----------|------|
| `admin2@test.com` | `testpass123` | admin |
| `member1@test.com` | `testpass123` | member |
| `member2@test.com` | `testpass123` | member |

### Create Test Users via SQL (Alternative)

```sql
-- Create 3 test users with different roles
DO $$
DECLARE
  user_id TEXT;
  users TEXT[][] := ARRAY[
    ['admin2@test.com', 'Admin Two', 'admin'],
    ['member1@test.com', 'Member One', 'member'],
    ['member2@test.com', 'Member Two', 'member']
  ];
  user_data TEXT[];
BEGIN
  FOREACH user_data SLICE 1 IN ARRAY users
  LOOP
    user_id := 'user_' || substr(md5(random()::text), 1, 21);
    
    -- Create user
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (user_id, user_data[2], user_data[1], true, NOW(), NOW());
    
    -- Create credential account (password: "testpass123")
    INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES (
      'acc_' || substr(md5(random()::text), 1, 21),
      user_id,
      'credential',
      user_id,
      '$2a$10$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4bK0VcXIAqLw8K8y', -- "testpass123"
      NOW(),
      NOW()
    );
    
    -- Add to organization
    INSERT INTO member (id, organization_id, user_id, role, created_at)
    VALUES (
      'mem_' || substr(md5(random()::text), 1, 21),
      'default',
      user_id,
      user_data[3],
      NOW()
    );
    
    RAISE NOTICE 'Created user: % with role: %', user_data[1], user_data[3];
  END LOOP;
END $$;
```

### View All Users and Roles

```sql
-- List all users with their org roles
SELECT 
  u.id,
  u.email,
  u.name,
  m.role as org_role,
  o.name as org_name,
  u.created_at
FROM "user" u
LEFT JOIN member m ON u.id = m.user_id
LEFT JOIN organization o ON m.organization_id = o.id
ORDER BY u.created_at DESC;
```

### Change User Role

```sql
-- Promote user to admin
UPDATE member 
SET role = 'admin' 
WHERE user_id = (SELECT id FROM "user" WHERE email = 'testuser@example.com');

-- Demote user to member
UPDATE member 
SET role = 'member' 
WHERE user_id = (SELECT id FROM "user" WHERE email = 'testuser@example.com');
```

### Delete User

```sql
-- Delete user (cascades to accounts, sessions, members)
DELETE FROM "user" WHERE email = 'testuser@example.com';
```

---

## Slack Tables Operations

### View All Slack Data

```sql
-- All workspaces with default agent info
SELECT 
  id,
  tenant_id,
  slack_team_id,
  slack_team_name,
  status,
  default_project_id,
  default_agent_id,
  default_agent_name,
  installed_by_user_id,
  created_at
FROM work_app_slack_workspaces;

-- All user mappings (Slack ↔ Inkeep links)
SELECT * FROM work_app_slack_user_mappings;

-- All channel configs
SELECT * FROM work_app_slack_channel_agent_configs;

-- All user settings
SELECT * FROM work_app_slack_user_settings;
```

### Set Workspace Default Agent (SQL)

```sql
-- Set default agent for a workspace
UPDATE work_app_slack_workspaces
SET 
  default_project_id = 'your-project-id',
  default_agent_id = 'your-agent-id',
  default_agent_name = 'Your Agent Name',
  updated_at = NOW()
WHERE slack_team_id = 'T0YOUR_TEAM_ID';

-- Clear workspace default
UPDATE work_app_slack_workspaces
SET 
  default_project_id = NULL,
  default_agent_id = NULL,
  default_agent_name = NULL,
  updated_at = NOW()
WHERE slack_team_id = 'T0YOUR_TEAM_ID';
```

### Set Workspace Default Agent (API)

```bash
# Via API endpoint (requires admin auth)
curl -X PUT "http://localhost:3002/work-apps/slack/workspaces/T0YOUR_TEAM_ID/settings" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "defaultAgent": {
      "projectId": "your-project-id",
      "agentId": "your-agent-id",
      "agentName": "Your Agent Name"
    }
  }'
```

### Clear All Slack Data (Fresh Start)

```sql
-- Delete all Slack work app data (keeps users intact)
TRUNCATE TABLE work_app_slack_user_settings CASCADE;
TRUNCATE TABLE work_app_slack_channel_agent_configs CASCADE;
TRUNCATE TABLE work_app_slack_user_mappings CASCADE;
TRUNCATE TABLE work_app_slack_workspaces CASCADE;
```

### Delete Specific Workspace

```sql
-- Delete a workspace and all related data
DELETE FROM work_app_slack_workspaces 
WHERE slack_team_id = 'T0YOUR_TEAM_ID';
```

### Unlink a Slack User

```sql
-- Remove a specific user's Slack link
DELETE FROM work_app_slack_user_mappings 
WHERE slack_user_id = 'U0YOUR_SLACK_USER_ID';

-- Or by Inkeep user ID
DELETE FROM work_app_slack_user_mappings 
WHERE inkeep_user_id = 'user_xyz123';
```

### View Linked Users with Details

```sql
SELECT 
  m.slack_username,
  m.slack_email,
  u.email as inkeep_email,
  u.name as inkeep_name,
  mem.role as org_role,
  w.slack_team_name,
  m.linked_at,
  s.default_agent_name
FROM work_app_slack_user_mappings m
JOIN "user" u ON m.inkeep_user_id = u.id
LEFT JOIN member mem ON u.id = mem.user_id
LEFT JOIN work_app_slack_workspaces w 
  ON m.slack_team_id = w.slack_team_id AND m.tenant_id = w.tenant_id
LEFT JOIN work_app_slack_user_settings s 
  ON m.slack_user_id = s.slack_user_id AND m.slack_team_id = s.slack_team_id
ORDER BY m.linked_at DESC;
```

---

## Testing Workflows

### Full Reset Workflow

```bash
# 1. Stop the API server
# 2. Clear and reinitialize
pnpm db:migrate
pnpm db:auth:init

# 3. Restart the API server
pnpm dev
```

### Test User Login Flow

```bash
# Sign in and get session token
curl -X POST http://localhost:3002/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"adminADMIN!@12"}' \
  -c cookies.txt

# Use session for authenticated requests
curl http://localhost:3002/work-apps/slack/workspaces \
  -b cookies.txt
```

### Test with Different Roles

```sql
-- Quick role toggle for testing
-- Make current user a member (loses admin)
UPDATE member SET role = 'member' 
WHERE user_id = (SELECT id FROM "user" WHERE email = 'admin@example.com');

-- Restore admin
UPDATE member SET role = 'admin' 
WHERE user_id = (SELECT id FROM "user" WHERE email = 'admin@example.com');
```

### Simulate Slack Link

```sql
-- Manually create a Slack user mapping for testing
INSERT INTO work_app_slack_user_mappings (
  id, tenant_id, client_id, slack_user_id, slack_team_id, 
  inkeep_user_id, slack_username, slack_email, linked_at, created_at, updated_at
)
SELECT 
  'wsum_' || substr(md5(random()::text), 1, 21),
  'default',
  'work-apps-slack',
  'U0TESTSLACK123',
  'T0TESTTEAM123',
  u.id,
  'testslackuser',
  u.email,
  NOW(),
  NOW(),
  NOW()
FROM "user" u 
WHERE u.email = 'admin@example.com';
```

---

## Quick Reference

### Environment Variables

```bash
# Required for auth init
INKEEP_AGENTS_MANAGE_UI_USERNAME=admin@example.com
INKEEP_AGENTS_MANAGE_UI_PASSWORD=adminADMIN!@12
BETTER_AUTH_SECRET=your-secret-key
TENANT_ID=default

# Slack app (from Slack API)
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...

# Nango (for OAuth)
NANGO_SECRET_KEY=...
NANGO_SLACK_SECRET_KEY=...  # Optional, falls back to NANGO_SECRET_KEY
```

### Common pnpm Commands

```bash
pnpm dev                    # Start API server
pnpm db:studio              # Open Drizzle Studio
pnpm db:migrate             # Apply migrations
pnpm db:generate            # Generate migrations from schema
pnpm db:auth:init           # Create/update admin user

# Run tests
pnpm --filter @inkeep/agents-work-apps test --run  # Slack tests
pnpm --filter @inkeep/agents-api test --run        # API tests
```

### Role Permissions Summary

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| Install Slack workspace | ✅ | ✅ | ❌ |
| Uninstall workspace | ✅ | ✅ | ❌ |
| Set workspace default agent | ✅ | ✅ | ❌ |
| Set channel default agent | ✅ | ✅ | ❌ |
| Link own Slack account | ✅ | ✅ | ✅ |
| Unlink own account | ✅ | ✅ | ✅ |
| Set personal default agent | ✅ | ✅ | ✅ |
| Use agents via Slack | ✅ | ✅ | ✅ |

---

*Last updated: February 2026*
