import type { ModelSettings } from '@inkeep/agents-core';
import { z } from 'zod';
import { getLogger } from '../../../logger';
import { distillWithTruncation } from './distill-utils';

const logger = getLogger('distill-conversation-tool');

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
        "Content-focused actions: what to discover, analyze, or present. Don't get trapped in an infinite loop of tool calls. You have already done a lot of work that is why you are being compressed. Don't encourage too much more work."
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
}): Promise<ConversationSummary> {
  const { conversationId, currentSummary, summarizerModel, messageFormatter } = params;

  const existingSummaryContext = currentSummary
    ? `**Current summary (MUST be preserved and built upon):**

⚠️ CRITICAL: This is an INCREMENTAL UPDATE. The agent has already done substantial research. You MUST:
- PRESERVE every finding, fact, and detail from the current summary
- KEEP ALL related_artifacts from the current summary — do not drop any
- ADD new discoveries from the messages below on top of what already exists
- NEVER lose previously captured information

\`\`\`json\n${JSON.stringify(currentSummary, null, 2)}\n\`\`\``
    : '**Current summary:** None (first distillation)';

  try {
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
    "for_agent": ["<what agent should do>"],
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
🎯 **LIMIT NEXT STEPS**: Agent has already done substantial work - suggest minimal follow-up actions only
🎯 **HANDLE TRANSFERS SIMPLY**: Agent transfers/delegations are just routing - don't look for reasons or justifications. Simply note "conversation transferred to [specialist]" if relevant.

**Examples:**
❌ BAD: "Assistant used search tool and created artifacts"
✅ GOOD: "Inkeep supports streaming structured objects, OpenAI-compatible APIs, analytics logging, and Zendesk integration"

❌ BAD: "Tool calls were made to gather information"
✅ GOOD: "Platform includes 10 feature categories: chat widgets, knowledge base, analytics, integrations, theming options"

❌ BAD: "Assistant needed to transfer to QA because user required specialized testing help"
✅ GOOD: "Conversation transferred to QA specialist"

**Focus on WHAT WAS LEARNED, not HOW IT WAS LEARNED**

Return **only** valid JSON.`,
      messageFormatter,
    });
    output.session_id = conversationId;
    return output;
  } catch (error) {
    logger.error(
      { conversationId, error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to distill conversation'
    );

    return {
      type: 'conversation_summary_v1',
      session_id: conversationId,
      _fallback: true,
      high_level: 'Ongoing conversation session',
      user_intent: 'Continue working on current task',
      related_artifacts: [],
      decisions: [],
      open_questions: ['Review recent work and determine next steps'],
      next_steps: {
        for_agent: ['Continue with current task'],
        for_user: ['Provide additional guidance if needed'],
      },
    };
  }
}
