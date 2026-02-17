import type { ModelSettings } from '@inkeep/agents-core';
import { ModelFactory } from '@inkeep/agents-core';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getLogger } from '../../../logger';

const logger = getLogger('distill-conversation-history-tool');

/**
 * Conversation History Summary Schema - structured object for replacing entire conversation histories
 */
export const ConversationHistorySummarySchema = z.object({
  type: z.literal('conversation_history_summary_v1'),
  session_id: z.string().nullable().optional(),
  conversation_overview: z
    .string()
    .describe('2-4 sentences capturing the full conversation context and what was accomplished'),
  user_goals: z.object({
    primary: z.string().describe('Main objective the user was trying to achieve'),
    secondary: z
      .array(z.string())
      .describe('Additional goals or tasks that emerged during conversation'),
  }),
  key_outcomes: z.object({
    completed: z
      .array(z.string())
      .describe('Tasks, questions, or problems that were fully resolved'),
    partial: z.array(z.string()).describe('Work that was started but not completed'),
    discoveries: z
      .array(z.string())
      .describe('Important information, insights, or findings uncovered'),
  }),
  technical_context: z.object({
    technologies: z
      .array(z.string())
      .describe('Relevant technologies, frameworks, tools mentioned'),
    configurations: z
      .array(z.string())
      .describe('Settings, parameters, or configurations discussed'),
    issues_encountered: z
      .array(z.string())
      .describe('Problems, errors, or challenges that came up'),
    solutions_applied: z
      .array(z.string())
      .describe('Fixes, workarounds, or solutions that were implemented'),
  }),
  conversation_artifacts: z
    .array(
      z.object({
        id: z.string().describe('Artifact ID'),
        name: z.string().describe('Human-readable name describing the content'),
        tool_name: z.string().describe('Tool that generated this artifact'),
        tool_call_id: z.string().describe('Specific tool call ID for precise referencing'),
        content_summary: z.string().describe('Brief summary of what this artifact contains'),
        relevance: z
          .enum(['high', 'medium', 'low'])
          .describe('Importance of this artifact to the overall conversation'),
      })
    )
    .optional()
    .describe('All artifacts referenced in this conversation with their significance'),
  conversation_flow: z.object({
    major_phases: z
      .array(z.string())
      .describe('Main phases or stages the conversation went through'),
    decision_points: z.array(z.string()).describe('Key decisions made during the conversation'),
    topic_shifts: z.array(z.string()).describe('When and why the conversation changed direction'),
  }),
  context_for_continuation: z.object({
    current_state: z.string().describe('Where things stand now - current status or position'),
    next_logical_steps: z
      .array(z.string())
      .describe('What should naturally happen next based on conversation'),
    important_context: z
      .array(z.string())
      .describe('Critical background info needed for future interactions'),
  }),
});

export type ConversationHistorySummary = z.infer<typeof ConversationHistorySummarySchema>;

/**
 * Distill entire conversation history into a comprehensive summary that can replace the full message history
 */
export interface ArtifactInfo {
  artifactId: string;
  isOversized: boolean;
  toolArgs?: any;
  structureInfo?: string;
  oversizedWarning?: string;
}

export async function distillConversationHistory(params: {
  messages: any[];
  conversationId: string;
  summarizerModel: ModelSettings;
  toolCallToArtifactMap?: Record<string, ArtifactInfo>;
}): Promise<ConversationHistorySummary> {
  const { messages, conversationId, summarizerModel, toolCallToArtifactMap } = params;

  try {
    if (!summarizerModel?.model?.trim()) {
      throw new Error('Summarizer model is required');
    }

    const model = ModelFactory.createModel(summarizerModel);

    // Format messages for prompt with comprehensive content handling
    const formattedMessages = messages
      .map((msg: any) => {
        const parts: string[] = [];

        if (typeof msg.content === 'string') {
          parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push(block.text);
            } else if (block.type === 'tool-call') {
              parts.push(
                `[TOOL CALL] ${block.toolName}(${JSON.stringify(block.input)}) [ID: ${block.toolCallId}]`
              );
            } else if (block.type === 'tool-result') {
              const artifactId = toolCallToArtifactMap?.[block.toolCallId];
              const artifactInfo = artifactId ? `\n[ARTIFACT CREATED: ${artifactId}]` : '';
              parts.push(
                `[TOOL RESULT] ${block.toolName} [ID: ${block.toolCallId}]${artifactInfo}\nResult: ${JSON.stringify(block.result)}`
              );
            }
          }
        } else if (msg.content?.text) {
          parts.push(msg.content.text);
        }

        return parts.length > 0 ? `${msg.role || 'system'}: ${parts.join('\n')}` : '';
      })
      .filter((line) => line.trim().length > 0)
      .join('\n\n');

    const prompt = `You are a conversation history summarization assistant. Your job is to create a comprehensive summary that can COMPLETELY REPLACE the original conversation history while preserving all essential context.

**Complete Conversation to Summarize:**

\`\`\`text
${formattedMessages}
\`\`\`

Create a comprehensive summary using this exact JSON schema:

\`\`\`json
{
  "type": "conversation_history_summary_v1",
  "session_id": "<conversationId>",
  "conversation_overview": "<2-4 sentences capturing full context and accomplishments>",
  "user_goals": {
    "primary": "<main objective user was trying to achieve>",
    "secondary": ["<additional goals that emerged>"]
  },
  "key_outcomes": {
    "completed": ["<tasks/questions fully resolved>"],
    "partial": ["<work started but not completed>"],
    "discoveries": ["<important findings uncovered>"]
  },
  "technical_context": {
    "technologies": ["<relevant tech/frameworks/tools>"],
    "configurations": ["<settings/parameters discussed>"],
    "issues_encountered": ["<problems/errors that came up>"],
    "solutions_applied": ["<fixes/workarounds implemented>"]
  },
  "conversation_artifacts": [
    {
      "id": "<artifact_id>",
      "name": "<descriptive name>",
      "tool_name": "<tool_name>",
      "tool_call_id": "<tool_call_id>",
      "content_summary": "<what this artifact contains>",
      "relevance": "<high|medium|low>"
    }
  ],
  "conversation_flow": {
    "major_phases": ["<main stages conversation went through>"],
    "decision_points": ["<key decisions made>"],
    "topic_shifts": ["<when/why conversation changed direction>"]
  },
  "context_for_continuation": {
    "current_state": "<where things stand now>",
    "next_logical_steps": ["<what should happen next>"],
    "important_context": ["<critical background for future interactions>"]
  }
}
\`\`\`

**CRITICAL RULES - COMPREHENSIVE HISTORICAL PRESERVATION:**

🎯 **COMPLETE CONTEXT CAPTURE**: This summary must contain ALL information needed to continue the conversation as if the full history was available

🎯 **PRESERVE OUTCOMES**: Document everything that was accomplished, learned, discovered, or decided

🎯 **TECHNICAL PRECISION**: Include specific technologies, configurations, error messages, solutions - technical details matter

🎯 **ARTIFACT COMPLETENESS**: Reference ALL artifacts with clear descriptions of their contents and importance

🎯 **CONVERSATION NARRATIVE**: Capture the logical flow - how did we get from start to current state?

🎯 **CONTINUATION CONTEXT**: Provide everything needed for smooth conversation continuation

🎯 **NO OPERATIONAL DETAILS**: Focus on WHAT was accomplished, not HOW (tools used, compression, etc.)

🎯 **HANDLE TRANSFERS SIMPLY**: Agent transfers/delegations are just routing - don't look for reasons or justifications. Simply note "conversation transferred to [specialist]" if relevant to context.

**Examples of GOOD content:**
✅ "User was implementing OAuth2 authentication in React app using Auth0, encountered CORS errors on localhost:3000, resolved by adding domain to Auth0 dashboard allowed origins"
✅ "Discovered that the API supports both REST and GraphQL endpoints, with GraphQL providing better performance for complex queries"
✅ "Configured webpack dev server with proxy settings to handle API calls during development"
✅ "Conversation transferred to QA specialist to handle testing questions"

**Examples of BAD content:**
❌ "Assistant used search tool to find information"
❌ "Multiple tool calls were made"
❌ "Artifacts were created for reference"
❌ "Assistant needed to transfer because user required specialized help" (don't invent reasons for transfers)

**REMEMBER**: This summary is REPLACING the entire conversation history. Include everything essential for context continuation.

Return **only** valid JSON.`;

    const { output: summary } = await generateText({
      model,
      prompt,
      output: Output.object({
        schema: ConversationHistorySummarySchema,
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
      'Failed to distill conversation history'
    );

    // Return minimal fallback summary
    return {
      type: 'conversation_history_summary_v1',
      session_id: conversationId,
      conversation_overview: 'Conversation session with technical discussion and problem-solving',
      user_goals: {
        primary: 'Technical assistance and problem-solving',
        secondary: [],
      },
      key_outcomes: {
        completed: [],
        partial: ['Ongoing technical work'],
        discoveries: [],
      },
      technical_context: {
        technologies: [],
        configurations: [],
        issues_encountered: [],
        solutions_applied: [],
      },
      conversation_artifacts: [],
      conversation_flow: {
        major_phases: ['Initial discussion', 'Technical exploration'],
        decision_points: [],
        topic_shifts: [],
      },
      context_for_continuation: {
        current_state: 'In progress - technical work ongoing',
        next_logical_steps: ['Continue with current technical objectives'],
        important_context: ['Review previous discussion for technical context'],
      },
    };
  }
}
