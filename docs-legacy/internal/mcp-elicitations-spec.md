# MCP Elicitations & User Interaction Abstraction

## Background

Our agent framework currently supports **tool approvals** - when an agent wants to run a sensitive tool, it pauses and asks the user "hey, can I run this?". The user clicks approve or deny, and execution continues.

This works, but it's limited. The MCP protocol has a more general concept called **elicitations** that lets servers request arbitrary structured data from users - not just yes/no approval, but actual form inputs, or even redirecting users to external URLs for things like OAuth.

We don't support elicitations today. And when our agents are exposed as MCP servers, we don't properly surface our internal tool approvals, or incoming elicitations from used MCP tools (we've not implemented this yet) to those IDEs either - they just hang waiting for approval that never comes.

---

## Problems We're Solving

### Problem 1: MCP servers can't ask users for input

When our agents connect to external MCP servers (Firecrawl, GitHub, custom tools), those servers might need to ask the user something:

- "Which repository do you want to work with?"
- "What date range should I search?"
- "Please authenticate with your GitHub account"

Right now, if an MCP server sends an elicitation request, we ignore it. The tool call just fails or times out.

### Problem 2: No way to handle OAuth mid-conversation

User says "search my private GitHub repos". The agent calls the GitHub MCP server. But wait - the user never authenticated with GitHub.

Today: the tool fails with "unauthorized".

What should happen: we prompt the user to authenticate, they click a link, complete OAuth, come back, and the tool runs.

### Problem 3: MCP Clients can't interact with our agents properly

When someone adds our agent as an MCP server in a client, and the agent internally needs tool approval, the client has no idea. It just sits there waiting.

The MCP protocol has a mechanism for this - servers can send elicitation requests to clients. We should use it.

### Problem 4: Tool approvals are a special case of a general pattern

Our current implementation treats tool approvals as their own thing with dedicated types, managers, events, etc. But conceptually, asking "can I run this tool?" is just one type of user interaction. We're going to need more types (elicitations), so we should abstract this now rather than copy-paste the approval code.

---

## Use Cases

### Use Case 1: Form-based elicitation

**Scenario**: User asks agent to create a GitHub issue. The GitHub MCP server needs to know which repo, what title, what labels, etc.

**Flow**:
1. Agent calls `create_issue` tool on GitHub MCP server
2. MCP server responds with elicitation request: "I need more info"
   - Fields: repo (dropdown), title (text), body (text), labels (multi-select)
3. Our framework surfaces this to the user as a form in the chat
4. User fills it out, submits
5. We send the response back to MCP server
6. Tool execution completes

### Use Case 2: OAuth authentication

**Scenario**: User asks agent to read their Slack messages. The Slack MCP server requires OAuth.

**Flow**:
1. Agent calls `list_messages` tool on Slack MCP server
2. MCP server responds with URL-mode elicitation: "User needs to authenticate"
   - URL: `https://slack.com/oauth/authorize?client_id=...&redirect_uri=...`
3. Our framework shows a message: "Please authenticate with Slack" + button/link
4. User clicks, completes OAuth in browser, gets redirected back
5. We detect completion, notify MCP server
6. Tool execution continues

### Use Case 3: MCP Clients tool approval

**Scenario**: Developer using Cursor has our agent as an MCP server. They ask a question, agent wants to run a tool that requires approval.

**Flow**:
1. Developer asks question in Cursor
2. Cursor calls our agent's `send-query-to-agent` MCP tool
3. Agent internally wants to run a tool marked `needsApproval: true`
4. Our MCP server sends elicitation to Cursor: "Allow agent to run `delete_file` tool?"
5. Cursor shows native approval UI
6. Developer approves
7. Tool runs, agent responds

### Use Case 4: Sensitive input collection

**Scenario**: Agent needs an API key to call an external service, but it's a one-time use case and user doesn't want to store it.

**Flow**:
1. Agent determines it needs an API key
2. Triggers URL-mode elicitation pointing to a secure input page
3. User enters API key on that page (never flows through chat/logs)
4. Agent receives confirmation, proceeds

---

## Proposed Solution

### Part 1: Abstract the user interaction system

Rename and generalize our existing tool approval infrastructure:

| Current | New |
|---------|-----|
| `PendingToolApprovalManager` | `PendingUserInteractionManager` |
| `ToolApprovalUiBus` | `UserInteractionUiBus` |
| `PendingToolApproval` type | `PendingUserInteraction` type |

The new system handles multiple interaction types:
- `tool-approval` - existing approve/deny flow
- `elicitation-form` - collect structured data via form
- `elicitation-url` - redirect user to external URL

All share the same lifecycle: create pending interaction → emit to stream → wait for response → resolve promise → continue execution.

### Part 2: New types and stream events

**New types** (in agents-core):

```typescript
// The different kinds of user interactions
type UserInteractionType = 'tool-approval' | 'elicitation-form' | 'elicitation-url';

// Form-mode elicitation request
interface ElicitationFormRequest {
  type: 'elicitation-form';
  interactionId: string;
  message: string;
  requestedSchema: JSONSchema; // What data we need
}

// URL-mode elicitation request  
interface ElicitationUrlRequest {
  type: 'elicitation-url';
  interactionId: string;
  message: string;
  url: string;
  returnPath?: string; // Where to redirect after completion
}

// User's response to an elicitation
interface ElicitationResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>; // Form data if accepted
}
```

**New stream events**:

- `elicitation-form-request` - server needs form input
- `elicitation-url-request` - server needs user to visit URL
- `elicitation-response` - user responded to elicitation

We keep `tool-approval-request` for backward compatibility with existing Vercel AI SDK clients.

### Part 3: MCP client elicitation handling

Update `McpClient` to handle elicitation requests from MCP servers:

```typescript
// In McpClient constructor or connect()
this.client.setRequestHandler('elicitation/create', async (request) => {
  // Bridge to our pending interaction system
  const result = await this.elicitationHandler?.(request.params);
  return result;
});
```

The `elicitationHandler` is injected by `AgentMcpManager` and connects to `PendingUserInteractionManager`.

### Part 4: MCP server elicitation emission

Update `/run/routes/mcp.ts` to emit elicitations when needed:

```typescript
const server = new McpServer({ ... }, {
  capabilities: { 
    logging: {},
    elicitation: {} // Declare we support elicitation
  }
});

// When we need user input during tool execution
const result = await server.createElicitation({
  message: "Allow agent to run 'delete_file'?",
  requestedSchema: {
    type: 'object',
    properties: {
      approved: { type: 'boolean' }
    }
  }
});
```

### Part 5: New API routes

**POST `/run/api/elicitations/{interactionId}/respond`**

```typescript
// Request
{
  action: 'accept' | 'decline' | 'cancel',
  content?: { ... } // Form data
}

// Response
{
  success: true
}
```

### Part 6: Elicitation Response Flow

When we're acting as `/api/chat` (not an MCP server), we need to bridge MCP's synchronous request-response model into our async streaming world.

**The flow:**

```
User                    Our API              MCP Server (external)
  |                        |                        |
  |-- chat message ------->|                        |
  |                        |--- tool call --------->|
  |                        |                        |
  |                        |<-- elicitation/create -|
  |                        |     (MCP request)      |
  |                        |                        |
  |<-- stream: elicitation-|   (we block here,     |
  |    form-request        |    holding the MCP    |
  |                        |    request open)      |
  |                        |                        |
  | (user sees form in UI) |                        |
  |                        |                        |
  |-- POST /elicitations/  |                        |
  |   {id}/respond ------->|                        |
  |                        |                        |
  |                        |-- elicitation -------->|
  |                        |   response (to MCP)    |
  |                        |                        |
  |                        |<-- tool result --------|
  |                        |                        |
  |<-- stream continues ---|                        |
```

**How it works internally:**

When `McpClient` receives an `elicitation/create` request from an MCP server:

1. **Emit to stream** - send `elicitation-form-request` event to the user
2. **Create pending promise** - register in `PendingUserInteractionManager`
3. **Block on that promise** - the MCP request handler `await`s it
4. **User responds** - via `POST /run/api/elicitations/{id}/respond`
5. **Promise resolves** - we return the response to the MCP SDK
6. **MCP SDK sends response** - back to the MCP server, tool call completes

The MCP server just sees a slow response to its elicitation request. It doesn't know we went to a human in between.

### Part 7: Why Elicitations Need a Dedicated Route

Tool approvals can be sent inline with chat messages because Vercel AI SDK has this built into their message schema (`state: 'approval-responded'`). Clients just attach the approval to their next message.

**Elicitations don't have this luxury.** They're not part of Vercel's spec, so we can't piggyback on the chat route.

**Solution:** Dedicated endpoint for elicitation responses.

```
Stream: elicitation-form-request { interactionId: "abc123", schema: {...} }
                    ↓
         (user fills form in UI)
                    ↓
POST /run/api/elicitations/abc123/respond { action: "accept", content: {...} }
                    ↓
            (execution continues)
```

This keeps things clean and works for all clients regardless of what SDK they use.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User/Client                              │
│  (Chat UI, Slack, IDE via MCP)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Stream Events                               │
│  - tool-approval-request (existing)                             │
│  - elicitation-form-request (new)                               │
│  - elicitation-url-request (new)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PendingUserInteractionManager                       │
│  - Tracks all pending interactions (approvals + elicitations)   │
│  - Promise-based resolution                                      │
│  - Timeout handling                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    Tool Approvals       │     │    MCP Elicitations     │
│  (needsApproval: true)  │     │  (from external MCP     │
│                         │     │   servers)              │
└─────────────────────────┘     └─────────────────────────┘
                                              │
                                              ▼
                              ┌─────────────────────────────┐
                              │        McpClient            │
                              │  - Handles elicitation/     │
                              │    create requests          │
                              │  - Bridges to interaction   │
                              │    manager                  │
                              └─────────────────────────────┘
```

When our agent IS the MCP server:

```
┌─────────────────────────┐
│   MCP Client            │
│   (IDE, other agent,    │
│    custom app, etc.)    │
└───────────┬─────────────┘
            │ MCP Protocol
            ▼
┌─────────────────────────┐
│  Our Agent as MCP       │
│  Server                 │
│  (/run/routes/mcp.ts)   │
└───────────┬─────────────┘
            │ Internal execution needs approval/elicitation
            ▼
┌─────────────────────────┐
│  Emit MCP elicitation   │
│  back to client         │◄──── This is the new part
└─────────────────────────┘
```

---

## Migration & Backward Compatibility

### What stays the same

- `tool-approval-request` stream event format unchanged
- Existing UI components for tool approval continue to work
- `toolPolicies.needsApproval` config unchanged

### What's new

- New stream events for elicitations (`elicitation-form-request`, `elicitation-url-request`)
- New `POST /run/api/elicitations/{interactionId}/respond` endpoint
- Internal refactor of manager classes (no external impact)
- MCP client can now handle elicitation requests from servers
- MCP server can now emit elicitations to clients

### What's deprecated

- `POST /run/api/tool-approvals` - will be migrated to the new unified elicitations endpoint. Tool approvals become a special case of elicitation with a simple approve/deny schema.

### Breaking changes

None for existing clients. Tool approval flow via chat messages continues to work.

---

## Open Questions / Future Considerations

1. **Elicitation UI components** - We'll need new UI components to render arbitrary JSON Schema forms. Could start with a library like `react-jsonschema-form` or build custom.

2. **URL-mode callback handling** - When user completes OAuth and gets redirected back, how do we detect completion? Options:
   - Polling from client
   - WebSocket notification
   - Redirect to a page that posts message back

3. **Elicitation persistence** - Currently tool approvals are in-memory only (lost on restart). Should elicitations be persisted to DB for longer flows like OAuth?

4. **Rate limiting** - Should we limit how many elicitations an MCP server can send? Prevent abuse.

5. **Elicitation timeout** - Tool approvals timeout after 10 minutes. Same for elicitations? Different for URL-mode (OAuth can take longer)?

6. **Tool approvals migration** - Should we eventually migrate tool approvals to use the elicitations endpoint too? Would unify the API surface but requires client updates. Could support both during transition period.

---

## Implementation Order

1. Types and schemas in agents-core
2. Abstract the pending interaction manager
3. Abstract the UI bus
4. Stream event helpers
5. API routes for elicitation responses
6. MCP client elicitation handling
7. Agent.ts integration
8. MCP server elicitation emission
9. Tests
10. Docs
