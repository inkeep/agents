# Design Decisions & Rationale

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## 1. JWT-Based Linking (vs. Link Codes)

**Decision**: Use stateless JWT tokens for account linking instead of database-stored link codes.

**Rationale**:
- **Security**: JWT is cryptographically signed; 8-char codes can be brute-forced
- **Simplicity**: Single click vs. copy-paste code
- **Performance**: No database lookup for pending codes
- **Maintenance**: No cleanup job needed for expired codes
- **UX**: Better user experience with direct deep link

**Trade-offs**:
- Users can't manually enter a code (minor - deep links work better)
- Token in URL (mitigated by short 10-minute expiry and HTTPS)

---

## 2. Nango for OAuth Token Storage

**Decision**: Store Slack bot tokens in Nango rather than our database.

**Rationale**:
- **Security**: Nango specializes in secure token storage with encryption at rest
- **Token Refresh**: Automatic token refresh handling
- **Compliance**: Reduces PCI/SOC2 scope for our database
- **Standardization**: Same pattern for future integrations (Google, MS Teams)

**Trade-offs**:
- External dependency
- Additional cost
- Network latency for token retrieval

---

## 3. Context-Aware Agent Resolution

**Decision**: Implement different resolution priorities based on context:
- `/inkeep` slash commands: user personal > channel > workspace
- `@Inkeep` mentions: channel > workspace (admin-controlled)

**Rationale**:
- **User control for private**: Slash commands are private/ephemeral, users should control their default
- **Admin control for public**: @mentions are public in channels, admin should control the agent
- **Channel context**: Support channels can have support agent, engineering channels can have dev agent
- **User autonomy**: Power users can set their preferred agent for slash commands
- **Fallback**: Workspace default ensures something always works

**Trade-offs**:
- More complex resolution logic with context awareness
- Users need to understand two different priority systems

---

## 4. Stateless SlackUserToken (vs. Session)

**Decision**: Generate short-lived JWTs for each agent invocation rather than maintaining sessions.

**Rationale**:
- **Security**: 5-minute expiry limits token theft impact
- **Scalability**: No session storage needed
- **Simplicity**: No session management complexity
- **Audit**: Each token is traceable to a specific invocation

**Trade-offs**:
- Token generation overhead on every request
- Larger payloads than session IDs

---

## 5. Ephemeral Initial Response + Update

**Decision**: Post ephemeral "thinking" message, then update with final response.

**Rationale**:
- **UX**: User sees immediate feedback
- **Visibility**: Only requester sees "thinking" state
- **Streaming**: Can update message as response streams in
- **Error handling**: Can gracefully show errors

**Trade-offs**:
- More complex message handling
- Rate limit considerations

---

## 6. Per-Tenant Workspaces (Not Shared)

**Decision**: Each Slack workspace belongs to exactly one Inkeep tenant.

**Rationale**:
- **Data isolation**: Clear tenant boundaries
- **Billing**: Simple per-workspace billing
- **Admin control**: Single organization manages the workspace

**Trade-offs**:
- Can't share workspace across tenants
- Reinstallation required to change tenant

---

## Future Considerations

### Planned Enhancements

1. **Thread Support**: Follow-up questions in threads
2. **File Attachments**: Upload documents for context
3. **Rich Responses**: Charts, tables, interactive elements
4. **DM Support**: Private conversations with bot
5. **Scheduled Queries**: Recurring agent runs

### Scalability Notes

- Bot tokens cached in Nango with automatic refresh
- Short-lived JWTs reduce database load
- Stateless design enables horizontal scaling
- Event processing can be queued for high volume

### Security Roadmap

- Rate limiting per user/workspace
- Audit logging for all operations
- IP allowlisting option
- Custom signing secrets per workspace
