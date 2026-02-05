# Slack Work App - Technical Documentation

This directory contains the detailed technical specification for the Slack Work App integration.

## Documentation Structure

```
docs/
├── INDEX.md              # This file
├── spec/                 # Technical specifications
│   ├── ARCHITECTURE.md   # System overview, components, tech stack
│   ├── AUTHENTICATION.md # JWT tokens, Better Auth, permissions
│   ├── DATABASE.md       # Schema, ERD, table purposes
│   ├── API.md            # REST endpoints, request/response
│   └── DESIGN_DECISIONS.md # Rationale, trade-offs, future
├── flows/                # Flow diagrams
│   ├── USER_FLOWS.md     # Installation, linking, query flows
│   ├── SLASH_COMMANDS.md # /inkeep command flow diagrams
│   └── MENTIONS.md       # @Inkeep mention flow diagrams
└── developer/            # Developer resources
    ├── COMMANDS.md       # SQL snippets, scripts, testing
    └── TESTING.md        # Test strategy, mocks, scenarios
```

---

## Quick Links

### Technical Specifications

| Document | Description |
|----------|-------------|
| [spec/ARCHITECTURE.md](./spec/ARCHITECTURE.md) | System overview, components, technology choices |
| [spec/AUTHENTICATION.md](./spec/AUTHENTICATION.md) | JWT tokens, Better Auth, permissions |
| [spec/DATABASE.md](./spec/DATABASE.md) | Schema, ERD, table purposes |
| [spec/API.md](./spec/API.md) | REST endpoints, request/response formats |
| [spec/DESIGN_DECISIONS.md](./spec/DESIGN_DECISIONS.md) | Rationale, trade-offs, future considerations |

### Flow Diagrams

| Document | Description |
|----------|-------------|
| [flows/USER_FLOWS.md](./flows/USER_FLOWS.md) | Installation, linking, query flows |
| [flows/SLASH_COMMANDS.md](./flows/SLASH_COMMANDS.md) | `/inkeep` command flow diagrams |
| [flows/MENTIONS.md](./flows/MENTIONS.md) | `@Inkeep` mention flow diagrams |

### Developer Resources

| Document | Description |
|----------|-------------|
| [developer/COMMANDS.md](./developer/COMMANDS.md) | SQL snippets, scripts, testing workflows |
| [developer/TESTING.md](./developer/TESTING.md) | Test strategy, mocks, scenarios |

---

## Key Concepts

### Agent Resolution Priority

| Context | Priority Order |
|---------|----------------|
| `/inkeep` commands | Channel > Workspace |
| `@Inkeep` mentions | Channel > Workspace |

> **Note**: Personal user defaults were removed to simplify the architecture. Agents are resolved using admin-configured channel overrides or workspace defaults.

### Token Types

| Token | Lifetime | Purpose |
|-------|----------|---------|
| SlackLinkToken | 10 min | Account linking |
| SlackUserToken | 5 min | API authentication |
| Bot OAuth Token | Indefinite | Slack API calls |

### Permissions

| Role | Can Install | Set Workspace Default | Set Channel Overrides | Can Use Agents |
|------|-------------|----------------------|----------------------|----------------|
| Owner | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ |
| Member | ❌ | ❌ | ✅ (channels they're in) | ✅ |
