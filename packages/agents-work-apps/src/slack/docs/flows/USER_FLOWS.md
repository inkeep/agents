# User Flows

> Part of the [Slack Work App Technical Documentation](../INDEX.md)

## 1. Workspace Installation Flow

```mermaid
sequenceDiagram
    participant A as Admin
    participant D as Dashboard
    participant API as Inkeep API
    participant S as Slack
    participant N as Nango

    A->>D: Click "Connect Slack"
    D->>API: GET /install
    API-->>A: Redirect to Slack OAuth
    A->>S: Authorize app
    S-->>API: GET /oauth_redirect?code=xxx
    API->>N: Exchange code for tokens
    N-->>API: Bot token stored
    API->>API: Create workspace record
    API-->>A: Redirect to dashboard
    D->>A: "Workspace connected!"
```

---

## 2. User Linking Flow (JWT-Based)

```mermaid
sequenceDiagram
    participant U as Slack User
    participant S as Slack
    participant API as Inkeep API
    participant UI as Link Page
    participant DB as Database

    U->>S: /inkeep link
    S->>API: POST /commands
    API->>API: signSlackLinkToken()
    Note over API: JWT contains:<br/>slackUserId, slackTeamId,<br/>tenantId, username
    API-->>S: Link URL with JWT
    S-->>U: "Click to link: /link?token=xxx"
    
    U->>UI: Click link
    UI->>UI: User signs in (if needed)
    UI->>API: POST /users/link/verify-token
    API->>API: verifySlackLinkToken()
    API->>DB: createWorkAppSlackUserMapping()
    API-->>UI: { success: true }
    UI-->>U: "Account linked!"
```

---

## 3. Agent Query Flow

```mermaid
sequenceDiagram
    participant U as Slack User
    participant S as Slack
    participant API as Work Apps API
    participant R as Run API
    participant AI as AI Model

    U->>S: /inkeep What is X?
    S->>API: POST /commands
    API->>API: Verify Slack signature
    API->>API: Check user is linked
    API->>API: Resolve effective agent
    API->>API: signSlackUserToken()
    API->>R: POST /run/api/chat (with JWT)
    R->>R: Validate SlackUserToken
    R->>AI: Generate response
    AI-->>R: Streaming response
    R-->>API: Response chunks
    API->>S: Update message (chat.update)
    S-->>U: See response in Slack
```

---

## 4. Agent Resolution Flow

### Agent Resolution (All Contexts)

```mermaid
flowchart TD
    A[/inkeep or @mention] --> B{Channel has agent config?}
    B -->|Yes| C[Use channel default]
    B -->|No| D{Workspace has default?}
    D -->|Yes| E[Use workspace default]
    D -->|No| F[Error: No agent configured]
    
    C --> G[Generate SlackUserToken]
    E --> G
    G --> H[Call /run/api/chat]
    H --> I[Stream response to Slack]
```

### Priority Summary

| Context | Priority |
|---------|----------|
| `/inkeep` commands | Channel > Workspace |
| `@Inkeep` mentions | Channel > Workspace |

> **Note**: Both slash commands and @mentions use the same simplified resolution order.

---

## Detailed Flow Documentation

For more detailed flow diagrams with all edge cases:

- [SLASH_COMMANDS.md](./SLASH_COMMANDS.md) - `/inkeep` command flows
- [MENTIONS.md](./MENTIONS.md) - `@Inkeep` mention flows
