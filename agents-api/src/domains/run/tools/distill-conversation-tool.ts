import type { ModelSettings } from '@inkeep/agents-core';
import { z } from 'zod';
import { distillWithTruncation } from './distill-utils';

export const ConversationSummarySchema = z.object({
  type: z.literal('conversation_summary_v1'),
  session_id: z.string().nullable().optional(),
  _fallback: z.boolean().optional(),
  high_level: z.string().describe('1-3 sentences capturing what was discovered and learned'),
  user_intent: z.string().describe('Current main goal or what the user wants to accomplish'),
  decisions: z
    .array(z.string())
    .describe('Concrete decisions made about approach or implementation (≤5 items)'),
  open_questions: z
    .array(z.string())
    .describe('Unresolved questions about the subject matter (≤5 items)'),
  next_steps: z.object({
    for_agent: z
      .array(z.string())
      .describe(
        "Audit all tool calls in this batch AND in the current summary's related_artifacts. For any tool+input combination that has already been called: output \"STOP: '[tool_name]([input])' already called [N] times — use artifact [id]\". For oversized artifacts: output \"DO NOT RE-CALL '[tool_name]' for '[topic]' — artifact exists, name/preview sufficient, re-calling will not retrieve more\". Only list genuinely new actions if critical information is still missing. Keep to ≤5 items total."
      ),
    for_user: z.array(z.string()).describe('Actions for user based on discovered content'),
  }),
  related_artifacts: z
    .array(
      z.object({
        id: z.string().describe('Artifact ID'),
        name: z.string().describe('Human-readable name describing the content'),
        tool_name: z
          .string()
          .describe('Tool that generated this artifact (e.g. search-inkeep-docs)'),
        tool_call_id: z.string().describe('Specific tool call ID for precise referencing'),
        content_type: z
          .string()
          .describe('Type of content (e.g. search_results, api_response, documentation)'),
        key_findings: z
          .array(z.string())
          .describe('2-3 most important findings from this specific artifact'),
      })
    )
    .optional()
    .describe('Artifacts containing detailed findings with citation info'),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export async function distillConversation(params: {
  conversationId: string;
  currentSummary?: ConversationSummary | null;
  summarizerModel?: ModelSettings;
  messageFormatter: (maxChars?: number) => string;
  compressionCycle?: number;
}): Promise<ConversationSummary> {
  const {
    conversationId,
    currentSummary,
    summarizerModel,
    messageFormatter,
    compressionCycle = 0,
  } = params;

  const cycleNote =
    compressionCycle > 0
      ? `\n⚠️ This is compression cycle ${compressionCycle + 1} — context has already been compressed ${compressionCycle} time(s). Prefer flagging tool calls as STOP/DO NOT RE-CALL unless information is genuinely absent from all prior artifacts.`
      : '';

  const existingSummaryContext = currentSummary
    ? `**Current summary (MUST be preserved and built upon):**${cycleNote}

⚠️ CRITICAL: This is an INCREMENTAL UPDATE. The agent has already done substantial research. You MUST:
- PRESERVE every finding, fact, and detail from the current summary
- KEEP ALL related_artifacts from the current summary — do not drop any
- ADD new discoveries from the messages below on top of what already exists
- NEVER lose previously captured information

\`\`\`json\n${JSON.stringify(currentSummary, null, 2)}\n\`\`\``
    : `**Current summary:** None (first distillation)${cycleNote}`;

  const output = await distillWithTruncation({
    conversationId,
    summarizerModel,
    schema: ConversationSummarySchema,
    buildPrompt: (
      formattedMessages
    ) => `You are a conversation summarization assistant. Your job is to create or update a compact, structured summary that captures VALUABLE CONTENT and FINDINGS, not just operational details.

${existingSummaryContext}

**Messages to summarize:**

\`\`\`text
${formattedMessages}
\`\`\`

Create/update a summary using this exact JSON schema:

\`\`\`json
{
  "type": "conversation_summary_v1",
  "session_id": "<conversationId>",
  "high_level": "<1–3 sentences capturing what was discovered and learned>",
  "user_intent": "<current main goal>",
  "decisions": ["<concrete decisions made>"],
  "open_questions": ["<unresolved issues>"],
  "next_steps": {
    "for_agent": ["<see examples below>"],
    "for_user": ["<what user should do>"]
  },
  "related_artifacts": [
    {
      "id": "<artifact_id>",
      "name": "<descriptive name>",
      "tool_name": "<tool_name>",
      "tool_call_id": "<tool_call_id>",
      "content_type": "<search_results|api_response|documentation>",
      "key_findings": ["<important finding 1>", "<important finding 2>"]
    }
  ]
}
\`\`\`

**CRITICAL RULES - FOCUS ON CONTENT NOT OPERATIONS:**
🎯 **EXTRACT VALUABLE FINDINGS**: Capture the actual information discovered, data retrieved, insights gained
🎯 **IGNORE OPERATIONAL DETAILS**: Don't mention "tool was used", "artifact was created", "messages were compressed"
🎯 **PRESERVE SUBSTANCE**: Include specific facts, features, capabilities, configurations, results found
🎯 **BUILD KNOWLEDGE**: When updating existing summary, ADD new discoveries to existing knowledge
🎯 **BE CONCRETE**: Use specific details from tool results, not generic descriptions
🎯 **BE CONCISE**: Keep ALL fields brief - you are compressing to save context, not writing a report
🎯 **HANDLE TRANSFERS SIMPLY**: Agent transfers/delegations are just routing - don't look for reasons or justifications. Simply note "conversation transferred to [specialist]" if relevant.

**for_agent RULES — audit before suggesting any action:**
🔍 Check: has this tool+input already been called in this batch OR in the current summary's related_artifacts?
  → If yes: output "STOP: '[tool_name]([input])' already called [N] times — use artifact [id]"
🔍 Check: is this artifact oversized?
  → If yes: output "DO NOT RE-CALL '[tool_name]' for '[topic]' — artifact exists, name/preview sufficient, re-calling will not retrieve more content"
🔍 Only list a new action if genuinely critical information is completely absent from all artifacts and the summary

**for_agent Examples:**

Scenario A — everything already covered, agent should stop:
\`\`\`json
"for_agent": [
  "STOP: 'search_docs(authentication setup)' already called 3 times — use artifact compress_search_call-abc_123",
  "DO NOT RE-CALL 'get_api_reference' for 'rate limits' — artifact exists with name/preview, re-calling will not retrieve more",
  "Respond now with findings from existing artifacts"
]
\`\`\`

Scenario B — one gap remains, specific new action warranted:
\`\`\`json
"for_agent": [
  "STOP: 'search_docs(webhooks)' already called 2 times — use artifact compress_search_call-xyz_456",
  "Retrieve pricing page — not yet covered in any artifact"
]
\`\`\`

Scenario C — first compression, meaningful work still ahead:
\`\`\`json
"for_agent": [
  "Fetch the user permissions API endpoint — not yet covered",
  "Check if SSO is documented under enterprise features"
]
\`\`\`

**Focus on WHAT WAS LEARNED, not HOW IT WAS LEARNED**

Return **only** valid JSON.`,
    messageFormatter,
  });
  output.session_id = conversationId;
  return output;
}
