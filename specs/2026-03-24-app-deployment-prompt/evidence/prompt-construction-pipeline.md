# Evidence: Prompt Construction Pipeline

## Summary

Traced the full flow from chat request → agent resolution → system prompt assembly → LLM call.

## Key Findings

### Prompt Hierarchy (two levels)
1. **Agent-level prompt** (`agents` table, `prompt` column) → rendered into `<agent_context>` section
2. **Sub-agent prompt** (`subAgents` table, `prompt` column) → rendered into `<core_instructions>` section

### System Prompt Template (`templates/v1/prompt/system-prompt.xml`)
Section order:
1. `<agent_identity>` — static base identity
2. `{{CURRENT_TIME_SECTION}}`
3. `{{SKILLS_SECTION}}`
4. `<core_instructions>` → sub-agent's prompt
5. `{{AGENT_CONTEXT_SECTION}}` → agent-level prompt
6. `{{ARTIFACTS_SECTION}}`
7. `{{TOOLS_SECTION}}`
8. `{{DATA_COMPONENTS_SECTION}}`
9. `<behavioral_constraints>` → security, interaction guidelines, transfer/delegation

### Injection Point for App Prompt
A new `{{APP_CONTEXT_SECTION}}` placeholder should go after `{{AGENT_CONTEXT_SECTION}}` (line 11) and before `{{ARTIFACTS_SECTION}}` (line 12).

### Config Assembly Chain
1. `runAuth.ts` resolves app → sets `executionContext.agentId` + metadata
2. `projectConfig.ts` loads full project → `FullExecutionContext`
3. `generateTaskHandler.ts` extracts agent/sub-agent config → creates Agent instance
4. `system-prompt.ts:buildSystemPrompt()` assembles `SystemPromptV1` config
5. `PromptConfig.ts:assemble()` renders template with config values
6. `generate.ts` passes rendered prompt to AI SDK

### App Config (current state)
- `AppConfig` is a discriminated union on `type`: `web_client` | `api`
- `web_client` has only `allowedDomains` config
- `api` has empty config object
- No prompt-related fields exist on apps today
- The `prompt` field would be a top-level column on the `apps` table (not nested in config)

### How App Identity Reaches Runtime
- `runAuth.ts` stores `apiKeyId: 'app:${app.id}'` in execution context
- `metadata.authMethod` is set to `'app_credential_web_client'` or `'app_credential_api'`
- The app object itself is NOT passed through to the agent runtime — only the resolved agentId and metadata
- **Key gap**: The app prompt must be threaded from auth resolution through to the prompt builder
