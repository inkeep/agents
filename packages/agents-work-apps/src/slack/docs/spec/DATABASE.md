# Database Design

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## Entity Relationship Diagram

```mermaid
erDiagram
    organization ||--o{ workAppSlackWorkspaces : "has many"
    organization ||--o{ workAppSlackUserMappings : "has many"
    organization ||--o{ workAppSlackChannelAgentConfigs : "has many"
    organization ||--o{ workAppSlackUserSettings : "has many"
    user ||--o{ workAppSlackUserMappings : "linked to many"
    user ||--o| workAppSlackWorkspaces : "installed by"
    user ||--o| workAppSlackChannelAgentConfigs : "configured by"

    workAppSlackWorkspaces {
        varchar id PK "wsw_xxx"
        varchar tenant_id FK "organization.id"
        varchar slack_team_id UK "T0AA0UWRXJS"
        varchar slack_enterprise_id "E0AA0UUL7ML"
        varchar slack_app_id "A0AA0UWRXJS"
        varchar slack_team_name "Acme Corp"
        varchar nango_provider_config_key "work-apps-slack"
        varchar nango_connection_id UK "E:E123:T:T456"
        varchar status "active|inactive"
        text installed_by_user_id FK "user.id"
        timestamp created_at
        timestamp updated_at
    }

    workAppSlackUserMappings {
        varchar id PK "wsum_xxx"
        varchar tenant_id FK "organization.id"
        varchar client_id "work-apps-slack"
        varchar slack_user_id "U0A9WJVPN1H"
        varchar slack_team_id "T0AA0UWRXJS"
        varchar slack_enterprise_id "E0AA0UUL7ML"
        text inkeep_user_id FK "user.id"
        varchar slack_username "john.doe"
        varchar slack_email "john@acme.com"
        timestamp linked_at
        timestamp last_used_at
        timestamp created_at
        timestamp updated_at
    }

    workAppSlackChannelAgentConfigs {
        varchar id PK "wscac_xxx"
        varchar tenant_id FK "organization.id"
        varchar slack_team_id "T0AA0UWRXJS"
        varchar slack_channel_id UK "C0AA0UWRXJS"
        varchar slack_channel_name "#support"
        varchar slack_channel_type "public|private"
        varchar project_id "proj_xxx"
        varchar agent_id "agent_xxx"
        varchar agent_name "Support Agent"
        text configured_by_user_id FK "user.id"
        boolean enabled "true (default)"
        timestamp created_at
        timestamp updated_at
    }

    workAppSlackUserSettings {
        varchar id PK "wsus_xxx"
        varchar tenant_id FK "organization.id"
        varchar slack_team_id "T0AA0UWRXJS"
        varchar slack_user_id UK "U0A9WJVPN1H"
        varchar default_project_id "proj_xxx"
        varchar default_agent_id "agent_xxx"
        varchar default_agent_name "My Agent"
        timestamp created_at
        timestamp updated_at
    }
```

---

## Table Purposes

| Table | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `work_app_slack_workspaces` | Track installed Slack workspaces | `(tenant_id, slack_team_id)` |
| `work_app_slack_user_mappings` | Link Slack users to Inkeep users | `(tenant_id, client_id, slack_team_id, slack_user_id)` |
| `work_app_slack_channel_agent_configs` | Channel-specific agent overrides | `(tenant_id, slack_team_id, slack_channel_id)` |
| `work_app_slack_user_settings` | Personal default agent preferences | `(tenant_id, slack_team_id, slack_user_id)` |

---

## SQL: Understanding the Relationships

```sql
-- View all users with their organization memberships and Slack link status
SELECT 
  u.id as user_id,
  u.email,
  u.name,
  o.name as org_name,
  m.role as org_role,
  CASE 
    WHEN m.role IN ('owner', 'admin') THEN 'Can manage Slack workspace'
    ELSE 'Can only use agents'
  END as slack_permissions,
  CASE 
    WHEN wm.id IS NOT NULL THEN 'Linked'
    ELSE 'Not Linked'
  END as slack_link_status,
  wm.slack_username,
  ws.slack_team_name
FROM "user" u
LEFT JOIN member m ON u.id = m.user_id
LEFT JOIN organization o ON m.organization_id = o.id
LEFT JOIN work_app_slack_user_mappings wm ON u.id = wm.inkeep_user_id
LEFT JOIN work_app_slack_workspaces ws ON wm.slack_team_id = ws.slack_team_id
ORDER BY u.created_at;
```

---

## Nango Connection ID Format

Bot tokens are stored in Nango. The connection ID format:

```
Non-enterprise: T:{teamId}         → T:T0AA0UWRXJS
Enterprise:     E:{enterpriseId}:T:{teamId} → E:E0AA0UUL7ML:T:T0AA0UWRXJS
```

This format enables:
- Quick lookup by team ID
- Enterprise Grid support
- Deterministic connection IDs (no random suffixes)
