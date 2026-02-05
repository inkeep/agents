# Slack /inkeep Slash Command Flow

## Overview

Slash commands (`/inkeep`) are **private** - only the user sees the response. This enables user-controlled agent preferences.

## Agent Resolution Priority

For slash commands, the resolution priority is:

```
Channel config > Workspace default
```

This is the same resolution order used for @mentions. All agent configuration is admin-controlled.

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
    ParseCommand -->|/inkeep run "agent" question| RunSpecific["Run specific agent"]
    ParseCommand -->|/inkeep question| RunDefault["Run default agent"]
    ParseCommand -->|/inkeep (no args)| OpenModal["Open agent picker modal"]
    
    CheckExistingLink -->|Yes| ShowAlreadyLinked["Show ephemeral:<br/>Already linked info"]
    CheckExistingLink -->|No| GenerateLinkToken["Generate JWT link token<br/>Show link button"]
    
    RunDefault --> CheckLinked{User linked?}
    RunSpecific --> CheckLinked
    OpenModal --> CheckLinked
    
    CheckLinked -->|No| PromptLink["Show ephemeral:<br/>Link your account first"]
    CheckLinked -->|Yes| ResolveAgent{Resolve agent}
    
    ResolveAgent --> CheckChannel{Channel has<br/>agent config?}
    CheckChannel -->|Yes| UseChannelDefault[Use channel default]
    CheckChannel -->|No| CheckWorkspace{Workspace has<br/>default?}
    CheckWorkspace -->|Yes| UseWorkspaceDefault[Use workspace default]
    CheckWorkspace -->|No| ShowNoAgent["Show error:<br/>No agent configured"]
    
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
| `/inkeep` | Yes | Open agent picker modal |
| `/inkeep help` | No | Show command reference |
| `/inkeep link` | No | Generate JWT link to connect accounts |
| `/inkeep unlink` | Yes | Remove Slack ↔ Inkeep account link |
| `/inkeep status` | No | Show account status and agent configuration |
| `/inkeep list` | Yes | List available agents from linked account |
| `/inkeep run "agent" question` | Yes | Ask a specific agent (agent name in quotes) |
| `/inkeep [question]` | Yes | Ask using resolved default agent |

---

## User Scenarios

| Scenario | Command | Response |
|----------|---------|----------|
| **Open modal** | `/inkeep` | Opens agent picker modal |
| **First time user** | `/inkeep` (not linked) | Ephemeral: "Link your account" + link button |
| **View help** | `/inkeep help` | Ephemeral: Command list with examples |
| **Link account** | `/inkeep link` | Ephemeral: JWT link button (expires 10 min) |
| **Already linked** | `/inkeep link` | Ephemeral: "Already linked" + account info |
| **Check status** | `/inkeep status` | Ephemeral: Account and agent config status |
| **List agents** | `/inkeep list` | Ephemeral: Available agents with projects |
| **Ask question** | `/inkeep What is X?` | Ephemeral: Agent response (private) |
| **Ask specific agent** | `/inkeep run "Helper" What is X?` | Ephemeral: Response from "Helper" agent |
| **No agent configured** | `/inkeep What is X?` | Ephemeral: Error + instructions to configure |

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
1. Channel agent config (admin or member-set)
2. Workspace default (admin-set via dashboard/Nango)
```

### Resolution Flow

1. Check if channel has a configured agent override
2. Fall back to workspace default agent
3. If neither is set, show error with configuration instructions

### Comparison with @Mentions

| Aspect | `/inkeep` Commands | `@Inkeep` Mentions |
|--------|--------------------|--------------------|
| Visibility | Private (ephemeral) | Public (channel/thread) |
| Priority | Channel > Workspace | Channel > Workspace |
| Use case | Personal queries | Team collaboration |

> **Note**: Both slash commands and @mentions use the same resolution priority for simplicity.

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
    ├── handleRunCommand()      - /inkeep run "agent" question
    ├── handleQuestionCommand() - /inkeep [question]
    ├── handleNoArgsCommand()   - /inkeep (opens modal)
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
