import { contextConfig, fetchDefinition, headers } from "@inkeep/agents-core";
import { z } from "zod";
export const headersBuilder = headers({
    schema: z.object({
        'x-target-tenant-id': z.string(),
        'x-target-project-id': z.string(),
        'x-target-agent-id': z.string().optional(),
        'x-inkeep-from-conversation-id': z.string().optional(),
        'x-inkeep-from-message-id': z.string().optional(),
    }),
});

const conversationResponseSchema = z
.object({
  data: z.object({
    messages: z.array(z.any()),
    formatted: z.object({
      llmContext: z.string(),
    }),
  }),
})
.openapi('ConversationWithFormattedMessagesResponse');


const llmsTxt = fetchDefinition({
    id: 'llmsTxt',
    trigger: 'initialization',
    fetchConfig: {
        url: 'http://localhost:3010/api/docs/fragments',
    },
    responseSchema: z.string(),
});

const fetchProjectInformation = fetchDefinition({
    id: 'fetchProjectInformation',
    trigger: 'initialization',
    fetchConfig: {
        url: `http://localhost:3002/tenants/${headersBuilder.toTemplate('x-target-tenant-id')}/project-full/${headersBuilder.toTemplate('x-target-project-id')}`,
    },
    responseSchema: z.any(),
});

const fetchConversationHistory = fetchDefinition({
    id: 'fetchConversationHistory',
    trigger: 'initialization',
    fetchConfig: {
        url: `http://localhost:3002/tenants/${headersBuilder.toTemplate('x-target-tenant-id')}/projects/${headersBuilder.toTemplate('x-target-project-id')}/conversations/${headersBuilder.toTemplate('x-inkeep-from-conversation-id')}`,
        method: 'GET',
        transform: 'data.formatted.llmContext'
    },
    responseSchema: z.any(),
    defaultValue: 'There is no specific conversation that triggered this session.'
});

export const contextBuilder = contextConfig({
    id: 'builder',
    headers: headersBuilder,
    contextVariables: {
        coreConcepts: llmsTxt,
        projectInformation: fetchProjectInformation,
        conversationHistory: fetchConversationHistory,
    },
});