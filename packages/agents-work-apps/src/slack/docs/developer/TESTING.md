# Testing Strategy

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## Test Categories

| Category | Location | Coverage |
|----------|----------|----------|
| Unit Tests | `services/__tests__/` | Command handlers, block builders, security, agent resolution |
| Route Tests | `__tests__/routes.test.ts` | API endpoint behavior |

---

## Test Mocks

- **Slack API**: Mocked responses for all Slack operations
- **Nango**: Mocked connection/token operations
- **Database**: In-memory PGlite for isolation

---

## Key Test Scenarios

1. **Slash Commands**: All `/inkeep *` commands
2. **Linking Flow**: JWT verification and user creation
3. **Agent Resolution**: Priority ordering (user > channel > workspace)
4. **Error Handling**: Invalid tokens, unlinked users, expired tokens
5. **Security**: Signature verification, permission checks, timing attacks

---

## Running Tests

```bash
# Run all Slack tests
cd packages/agents-work-apps && pnpm vitest --run

# Run specific test file
pnpm vitest --run src/slack/services/__tests__/commands.test.ts

# Run with coverage
pnpm vitest --run --coverage
```

---

## Test File Structure

```
packages/agents-work-apps/src/slack/
├── __tests__/
│   └── routes.test.ts                  # Route-level tests
└── services/
    └── __tests__/
        ├── agent-resolution.test.ts    # Agent priority resolution tests
        ├── api-client.test.ts          # Internal API client tests
        ├── blocks.test.ts              # Block Kit message tests
        ├── client.test.ts              # Slack Web API tests
        ├── commands.test.ts            # Slash command handler tests
        ├── events.test.ts              # Event handler tests
        ├── nango.test.ts               # Nango integration tests
        └── security.test.ts            # Security/signature tests
```

---

## Creating Test Users

For testing with different permission levels, see [COMMANDS.md](./COMMANDS.md#user-management).
