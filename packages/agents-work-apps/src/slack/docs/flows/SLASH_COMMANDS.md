# Slack /inkeep Slash Command Flow

## Overview

Slash commands (`/inkeep`) are **private** - only the user sees the response. This enables user-controlled agent preferences.

## Agent Resolution Priority

For slash commands, the resolution priority is **user-controlled**:

```
User personal default > Channel config > Workspace default
```

This differs from @mentions where admin-controlled defaults take precedence.

---

## Flow Diagram

```mermaid
flowchart TD
    Start([User runs /inkeep command]) --> ParseCommand{Parse command}
    
    ParseCommand -->|/inkeep help| ShowHelp["Show ephemeral:<br/>Command reference"]
    ParseCommand -->|/inkeep link| CheckExistingLink{Already linked?}
    ParseCommand -->|/inkeep unlink| Unlink["Remove link<br/>Show confirmation"]
    ParseCommand -->|/inkeep status| ShowStatus["Show ephemeral:<br/>Account & agent config status"]
    ParseCommand -->|/inkeep list| ListAgents["Show ephemeral:<br/>Available agents"]
    ParseCommand -->|/inkeep settings| ShowSettings["Show ephemeral:<br/>Current default agent"]
    ParseCommand -->|/inkeep settings set "agent"| SetDefault["Save personal default<br/>Show confirmation"]
    ParseCommand -->|/inkeep run "agent" question| RunSpecific["Run specific agent"]
    ParseCommand -->|/inkeep question| RunDefault["Run default agent"]
    
    CheckExistingLink -->|Yes| ShowAlreadyLinked["Show ephemeral:<br/>Already linked info"]
    CheckExistingLink -->|No| GenerateLinkToken["Generate JWT link token<br/>Show link button"]
    
    RunDefault --> CheckLinked{User linked?}
    RunSpecific --> CheckLinked
    
    CheckLinked -->|No| PromptLink["Show ephemeral:<br/>Link your account first"]
    CheckLinked -->|Yes| ResolveAgent{Resolve agent}
    
    ResolveAgent --> CheckUserDefault{User has<br/>personal default?}
    CheckUserDefault -->|Yes| UseUserDefault[Use user default]
    CheckUserDefault -->|No| CheckChannel{Channel has<br/>agent config?}
    CheckChannel -->|Yes| UseChannelDefault[Use channel default]
    CheckChannel -->|No| CheckWorkspace{Workspace has<br/>default?}
    CheckWorkspace -->|Yes| UseWorkspaceDefault[Use workspace default]
    CheckWorkspace -->|No| ShowNoAgent["Show error:<br/>No agent configured"]
    
    UseUserDefault --> ExecuteAgent
    UseChannelDefault --> ExecuteAgent
    UseWorkspaceDefault --> ExecuteAgent
    
    ExecuteAgent["Generate SlackUserToken JWT<br/>↓<br/>Call /run/api/chat<br/>↓<br/>Post ephemeral response"]
    
    ExecuteAgent --> Done([Done])
    ShowHelp --> End([End])
    ShowAlreadyLinked --> End
    GenerateLinkToken --> End
    Unlink --> End
    ShowStatus --> End
    ListAgents --> End
    ShowSettings --> End
    SetDefault --> End
    ShowNoAgent --> End
    PromptLink --> End

    style Start fill:#e1f5fe
    style Done fill:#c8e6c9
    style End fill:#c8e6c9
    style ShowNoAgent fill:#ffcdd2
    style PromptLink fill:#fff3e0
```

---

## Command Reference

| Command | Requires Link | Description |
|---------|---------------|-------------|
| `/inkeep help` | No | Show command reference |
| `/inkeep link` | No | Generate JWT link to connect accounts |
| `/inkeep unlink` | Yes | Remove Slack ↔ Inkeep account link |
| `/inkeep status` | No | Show account status and agent configuration |
| `/inkeep list` | Yes | List available agents from linked account |
| `/inkeep settings` | Yes | View current default agent |
| `/inkeep settings set "agent"` | Yes | Set personal default agent |
| `/inkeep run "agent" question` | Yes | Ask a specific agent (agent name in quotes) |
| `/inkeep [question]` | Yes | Ask using resolved default agent |

---

## User Scenarios

| Scenario | Command | Response |
|----------|---------|----------|
| **First time user** | `/inkeep` | Ephemeral: "Link your account" + link button |
| **View help** | `/inkeep help` | Ephemeral: Command list with examples |
| **Link account** | `/inkeep link` | Ephemeral: JWT link button (expires 10 min) |
| **Already linked** | `/inkeep link` | Ephemeral: "Already linked" + account info |
| **Check status** | `/inkeep status` | Ephemeral: Account, @mention agent, /inkeep agent |
| **List agents** | `/inkeep list` | Ephemeral: Available agents with projects |
| **View settings** | `/inkeep settings` | Ephemeral: Current default + how to change |
| **Set default** | `/inkeep settings set "My Agent"` | Ephemeral: Confirmation of new default |
| **Ask question** | `/inkeep What is X?` | Ephemeral: Agent response (private) |
| **Ask specific agent** | `/inkeep run "Helper" What is X?` | Ephemeral: Response from "Helper" agent |
| **No agent configured** | `/inkeep What is X?` | Ephemeral: Error + instructions to set default |

---

## Response Handling

### Background Execution

For `/inkeep [question]` and `/inkeep run "agent" question`:

1. **Immediate response**: Return empty body (HTTP 200) to acknowledge
2. **Background execution**: Call `/run/api/chat` asynchronously
3. **Delayed response**: Post result to `response_url` (ephemeral)

```
User: /inkeep What is the weather?
                    │
                    ▼
[Immediate] Return HTTP 200 (empty body - no visible message)
                    │
                    ▼
[Background] Generate SlackUserToken JWT
             Call /run/api/chat with JWT
             Wait for response
                    │
                    ▼
[Delayed] POST to response_url with ephemeral response
                    │
                    ▼
User sees: "It's sunny today..." (only visible to them)
```

### Why No "Thinking" Message?

Unlike @mentions which show a "thinking..." message, slash commands return silently to avoid double messages. The ephemeral response appears when ready (typically 2-5 seconds).

---

## Agent Resolution Details

### Priority Order

```
1. User personal default (/inkeep settings set)
2. Channel agent config (admin-set)
3. Workspace default (admin-set via dashboard/Nango)
```

### Why User First?

Slash command responses are **private** (only visible to the user), so:
- Users can customize without affecting others
- Power users can override workspace defaults
- Flexibility for multi-team workspaces

### Comparison with @Mentions

| Aspect | `/inkeep` Commands | `@Inkeep` Mentions |
|--------|--------------------|--------------------|
| Visibility | Private (ephemeral) | Public (channel/thread) |
| Priority | User > Channel > Workspace | Channel > Workspace |
| User control | Full (can set personal default) | None (admin-controlled) |
| Use case | Personal queries | Team collaboration |

---

## Code Organization

```
packages/agents-work-apps/src/slack/services/commands/
└── index.ts              # All slash command handlers
    ├── handleCommand()         - Main dispatcher
    ├── handleHelpCommand()     - /inkeep help
    ├── handleLinkCommand()     - /inkeep link
    ├── handleUnlinkCommand()   - /inkeep unlink
    ├── handleStatusCommand()   - /inkeep status
    ├── handleAgentListCommand() - /inkeep list
    ├── handleSettingsCommand() - /inkeep settings [set|clear]
    ├── handleRunCommand()      - /inkeep run "agent" question
    ├── handleQuestionCommand() - /inkeep [question]
    └── parseAgentAndQuestion() - Parse "agent" question syntax
```

## Key Files

| File | Purpose |
|------|---------|
| `services/commands/index.ts` | All slash command handling logic |
| `services/agent-resolution.ts` | Agent priority resolution (user > channel > workspace) |
| `services/blocks/index.ts` | Message builders for all responses |
| `routes/events.ts` | Routes `/commands` POST to handler |

---

*See also: [MENTIONS.md](./MENTIONS.md) for `@Inkeep` mention flows*
