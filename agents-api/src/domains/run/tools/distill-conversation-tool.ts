import type { ModelSettings } from '@inkeep/agents-core';
import { ModelFactory } from '@inkeep/agents-core';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getLogger } from '../../../logger';
import type { ArtifactInfo } from '../utils/artifact-utils';

const logger = getLogger('distill-conversation-tool');

/**
 * Conversation Summary Schema - structured object for maintaining conversation context
 */
export const ConversationSummarySchema = z.object({
  type: z.literal('conversation_summary_v1'),
  session_id: z.string().nullable().optional(),
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

/**
 * Core conversation distillation - takes messages and creates structured summary
 */
export async function distillConversation(params: {
  messages: any[];
  conversationId: string;
  currentSummary?: ConversationSummary | null;
  summarizerModel?: ModelSettings;
  toolCallToArtifactMap?: Record<string, ArtifactInfo>;
}): Promise<ConversationSummary> {
  const { messages, conversationId, currentSummary, summarizerModel, toolCallToArtifactMap } =
    params;

  try {
    // Choose model (prefer summarizer, fallback to base)
    const modelToUse = summarizerModel;
    if (!modelToUse?.model?.trim()) {
      throw new Error('Summarizer model is required');
    }

    const model = ModelFactory.createModel(modelToUse);

    // Build context sections
    const existingSummaryContext = currentSummary
      ? `**Current summary:**\n\n\`\`\`json\n${JSON.stringify(currentSummary, null, 2)}\n\`\`\``
      : '**Current summary:** None (first distillation)';

    // Format messages for prompt with proper content handling including tool calls/results
    const formattedMessages = messages
      .map((msg: any) => {
        const parts: string[] = [];

        if (typeof msg.content === 'string') {
          parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          // Handle all content types: text, tool-call, tool-result
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push(block.text);
            } else if (block.type === 'tool-call') {
              parts.push(
                `[TOOL CALL] ${block.toolName}(${JSON.stringify(block.input)}) [ID: ${block.toolCallId}]`
              );
            } else if (block.type === 'tool-result') {
              const artifactInfo = toolCallToArtifactMap?.[block.toolCallId];

              if (artifactInfo?.isOversized) {
                // Oversized artifact - use metadata instead of full output
                parts.push(
                  `[TOOL RESULT] ${block.toolName} [ID: ${block.toolCallId}]\nTool Arguments: ${JSON.stringify(artifactInfo.toolArgs)}\n[ARTIFACT CREATED: ${artifactInfo.artifactId}]\n${artifactInfo.oversizedWarning}\nStructure: ${artifactInfo.structureInfo}`
                );
              } else if (artifactInfo) {
                // Normal artifact created - include tool args and result
                parts.push(
                  `[TOOL RESULT] ${block.toolName} [ID: ${block.toolCallId}]\nTool Arguments: ${JSON.stringify(artifactInfo.toolArgs)}\n[ARTIFACT CREATED: ${artifactInfo.artifactId}]\nResult: ${JSON.stringify(block.output)}`
                );
              } else {
                // No artifact - include full output
                parts.push(
                  `[TOOL RESULT] ${block.toolName} [ID: ${block.toolCallId}]\nResult: ${JSON.stringify(block.output)}`
                );
              }
            }
          }
        } else if (msg.content?.text) {
          parts.push(msg.content.text);
        }

        return parts.length > 0 ? `${msg.role || 'system'}: ${parts.join('\n')}` : '';
      })
      .filter((line) => line.trim().length > 0) // Remove empty lines
      .join('\n\n');

    const prompt = `You are a conversation summarization assistant. Your job is to create or update a compact, structured summary that captures VALUABLE CONTENT and FINDINGS, not just operational details.

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

Return **only** valid JSON.`;

    const { output: summary } = await generateText({
      model,
      prompt,
      output: Output.object({
        schema: ConversationSummarySchema,
      }),
    });

    // Set session ID
    summary.session_id = conversationId;

    return summary;
  } catch (error) {
    logger.error(
      {
        conversationId,
        messageCount: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to distill conversation'
    );

    // Return minimal fallback summary
    return {
      type: 'conversation_summary_v1',
      session_id: conversationId,
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
