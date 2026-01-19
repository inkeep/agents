# Bug: Conversation Traces Show No Data After Successful Agent Execution

## Summary

Conversation traces display "No AI calls found", "Timing data not available", and an empty activity timeline even when agent execution completes successfully. The trigger invocation shows a "success" status, but the corresponding conversation trace page contains no trace data.

## Steps to Reproduce

1. Configure a trigger for an agent (e.g., webhook trigger)
2. Invoke the trigger via webhook:
   ```bash
   curl -X POST "http://localhost:3003/webhooks/{trigger-id}" \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello"}'
   ```
3. Verify the invocation completes successfully (status: "success" in invocations table)
4. Click "View" on the invocation to open the conversation trace
5. Observe: Conversation trace shows no data

## Expected Behavior

- **Duration**: Should show the actual execution time
- **AI Calls**: Should show the number of LLM calls made (e.g., 1 for a simple response)
- **Activity Timeline**: Should display the conversation messages and agent activity

## Actual Behavior

- **Duration**: "Timing data not available"
- **AI Calls**: "0 - No AI calls found"
- **Activity Timeline**: "Start a conversation to see the activity timeline"

## Environment

- Conversation ID example: `xlq0v0uuwe1w5m3462x53`
- Services: `agents-manage-ui`, `agents-manage-api`, `agents-run-api` all running
- SigNoz link available but likely not receiving traces

## Investigation Notes

### What Works
- Agent execution succeeds (verified by successful invocation status)
- Agent responds correctly to messages
- Invocation records are created in the database
- Conversation IDs are generated and linked

### What Doesn't Work
- OpenTelemetry traces are not appearing in SigNoz
- Conversation trace page shows no data

### Likely Root Causes

1. **OpenTelemetry Exporter Not Configured**: The OTEL exporter may not be properly configured to send traces to SigNoz
2. **SigNoz Not Running**: The SigNoz service may not be running or accessible at the expected endpoint
3. **Missing Trace Context Propagation**: Trace context may not be properly propagated from webhook invocation through to agent execution
4. **Silent Export Failures**: Trace export may be failing silently without error logging

## Files to Investigate

- `agents-run-api/src/routes/webhooks.ts` - Webhook handler that initiates agent execution
- `agents-run-api/src/handlers/executionHandler.ts` - Agent execution handler
- `packages/agents-core/src/telemetry/` - Telemetry/tracing configuration
- OpenTelemetry configuration files

## Acceptance Criteria

- [ ] Conversation traces show AI call count matching actual LLM calls
- [ ] Duration is calculated and displayed
- [ ] Activity timeline shows conversation messages
- [ ] MCP tool calls are recorded if any were made

## Priority

Medium - Core observability feature not working, but does not block agent execution

## Labels

- bug
- observability
- tracing
- opentelemetry
