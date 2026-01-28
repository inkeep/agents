/**
 * Slack API Client
 *
 * A reusable client for making authenticated API calls from Slack commands.
 * Uses the user's session token stored in Nango to authenticate requests.
 *
 * Usage:
 * ```typescript
 * const client = new SlackApiClient({
 *   sessionToken: connection.inkeepSessionToken,
 *   tenantId: connection.tenantId,
 * });
 *
 * const projects = await client.listProjects();
 * const agents = await client.listAgents(projectId);
 * ```
 */

import { WebClient } from '@slack/web-api';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { parseSSEResponse } from '../../../../utils/sseParser';

const logger = getLogger('slack-api-client');

export class SlackApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'SlackApiError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }
}

export interface SlackApiClientConfig {
  sessionToken: string;
  tenantId: string;
  apiUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Project {
  id: string;
  name: string | null;
  description: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string | null;
  description: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  agentId: string;
  keyPrefix: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreationResponse {
  apiKey: ApiKey;
  key: string;
}

export interface AgentWithProject extends Agent {
  projectName: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

export class SlackApiClient {
  private readonly sessionToken: string;
  private readonly tenantId: string;
  private readonly apiUrl: string;

  constructor(config: SlackApiClientConfig) {
    this.sessionToken = config.sessionToken;
    this.tenantId = config.tenantId;
    this.apiUrl = config.apiUrl || env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.sessionToken}`,
    };
  }

  private buildUrl(path: string, params?: Record<string, string | number>): string {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = new URL(`${normalizedBase}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number>;
      expectNoContent?: boolean;
    }
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);

    logger.debug({ method, path, tenantId: this.tenantId }, 'Making API request');

    const response = await fetch(url, {
      method,
      headers: this.headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error(
        { status: response.status, path, tenantId: this.tenantId },
        'API request failed'
      );

      if (response.status === 401) {
        throw new SlackApiError(
          'Session expired. Please re-link your account from the dashboard.',
          response.status,
          errorBody
        );
      }

      throw new SlackApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    if (response.status === 204 || options?.expectNoContent) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async listProjects(options?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Project>> {
    return this.request<PaginatedResponse<Project>>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects`,
      { params: { page: options?.page || 1, limit: options?.limit || 100 } }
    );
  }

  async getProject(projectId: string): Promise<{ data: Project }> {
    return this.request<{ data: Project }>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}`
    );
  }

  async listAgents(
    projectId: string,
    options?: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<Agent>> {
    return this.request<PaginatedResponse<Agent>>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/agents`,
      { params: { page: options?.page || 1, limit: options?.limit || 100 } }
    );
  }

  async getAgent(projectId: string, agentId: string): Promise<{ data: Agent }> {
    return this.request<{ data: Agent }>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/agents/${agentId}`
    );
  }

  async listAllAgents(): Promise<AgentWithProject[]> {
    const projectsResult = await this.listProjects({ limit: 100 });
    const allAgents: AgentWithProject[] = [];

    for (const project of projectsResult.data) {
      try {
        const agentsResult = await this.listAgents(project.id, { limit: 100 });
        for (const agent of agentsResult.data) {
          allAgents.push({
            ...agent,
            projectName: project.name,
          });
        }
      } catch (error) {
        logger.warn({ projectId: project.id, error }, 'Failed to list agents for project');
      }
    }

    return allAgents;
  }

  async findAgentByName(agentName: string): Promise<AgentWithProject | null> {
    const agents = await this.listAllAgents();
    const normalizedSearch = agentName.toLowerCase().trim();

    const exactMatch = agents.find(
      (a) => a.name?.toLowerCase() === normalizedSearch || a.id.toLowerCase() === normalizedSearch
    );
    if (exactMatch) return exactMatch;

    const partialMatch = agents.find(
      (a) =>
        a.name?.toLowerCase().includes(normalizedSearch) ||
        a.id.toLowerCase().includes(normalizedSearch)
    );
    return partialMatch || null;
  }

  /**
   * Trigger an agent and get a response.
   * Uses the session token for auth via the sub-agent chat completions endpoint.
   */
  async triggerAgent(params: {
    projectId: string;
    agentId: string;
    subAgentId: string;
    question: string;
    conversationId?: string;
  }): Promise<{ content: string; conversationId?: string }> {
    const { projectId, agentId, subAgentId, question, conversationId } = params;

    logger.info(
      { projectId, agentId, subAgentId, tenantId: this.tenantId },
      'Triggering agent from Slack'
    );

    const url = this.buildUrl(
      `/run/tenants/${this.tenantId}/projects/${projectId}/agents/${agentId}/sub-agents/${subAgentId}/chat/completions`
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: subAgentId,
        messages: [{ role: 'user', content: question }],
        stream: false,
        ...(conversationId ? { conversationId } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error(
        { status: response.status, projectId, agentId, subAgentId },
        'Agent trigger failed'
      );

      if (response.status === 401) {
        throw new SlackApiError(
          'Session expired. Please re-link your account from the dashboard.',
          response.status,
          errorBody
        );
      }

      throw new SlackApiError(
        `Failed to trigger agent: ${response.status}`,
        response.status,
        errorBody
      );
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      content?: string;
      conversationId?: string;
    };

    const content =
      result.choices?.[0]?.message?.content || result.content || 'No response from agent';

    return {
      content,
      conversationId: result.conversationId,
    };
  }

  async listApiKeys(projectId: string, agentId?: string): Promise<PaginatedResponse<ApiKey>> {
    const params: Record<string, string | number> = { limit: 100 };
    if (agentId) {
      params.agentId = agentId;
    }
    return this.request<PaginatedResponse<ApiKey>>(
      'GET',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/api-keys`,
      { params }
    );
  }

  async createApiKey(
    projectId: string,
    agentId: string,
    name: string
  ): Promise<{ data: ApiKeyCreationResponse }> {
    return this.request<{ data: ApiKeyCreationResponse }>(
      'POST',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/api-keys`,
      {
        body: { agentId, name },
      }
    );
  }

  async deleteApiKey(projectId: string, apiKeyId: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/manage/tenants/${this.tenantId}/projects/${projectId}/api-keys/${apiKeyId}`,
      { expectNoContent: true }
    );
  }

  async getOrCreateAgentApiKey(projectId: string, agentId: string): Promise<string> {
    const existingKeys = await this.listApiKeys(projectId, agentId);
    const slackKey = existingKeys.data.find((k) => k.name === 'slack-integration');

    if (slackKey) {
      logger.debug(
        { apiKeyId: slackKey.id, agentId },
        'Deleting existing slack-integration key to create fresh one'
      );
      await this.deleteApiKey(projectId, slackKey.id);
    }

    const newKey = await this.createApiKey(projectId, agentId, 'slack-integration');
    return newKey.data.key;
  }

  getTenantId(): string {
    return this.tenantId;
  }
}

/**
 * Factory function to create a SlackApiClient from a Nango connection
 */
export function createSlackApiClient(connection: {
  inkeepSessionToken?: string;
  inkeepSessionExpiresAt?: string;
  tenantId?: string;
}): SlackApiClient {
  if (!connection.inkeepSessionToken) {
    throw new SlackApiError(
      'Session expired. Please re-link your account from the dashboard.',
      401
    );
  }

  if (connection.inkeepSessionExpiresAt) {
    const expiresAt = new Date(connection.inkeepSessionExpiresAt);
    if (expiresAt < new Date()) {
      throw new SlackApiError(
        'Session expired. Please re-link your account from the dashboard.',
        401
      );
    }
  }

  return new SlackApiClient({
    sessionToken: connection.inkeepSessionToken,
    tenantId: connection.tenantId || 'default',
  });
}

/**
 * Agent Execution Client
 *
 * Uses an API key to execute agents via the run API.
 * This is separate from SlackApiClient because it uses a different auth mechanism.
 */
export class AgentExecutionClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(config: { apiKey: string; apiUrl?: string }) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async chat(
    message: string,
    options?: {
      conversationId?: string;
    }
  ): Promise<string> {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = `${normalizedBase}/run/v1/chat/completions`;

    logger.debug({ hasConversationId: !!options?.conversationId }, 'Executing agent chat');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: 'default',
        messages: [{ role: 'user', content: message }],
        conversationId: options?.conversationId,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error({ status: response.status, errorBody }, 'Agent execution failed');

      if (response.status === 401) {
        throw new SlackApiError(
          'Agent API key is invalid or expired. Please reconfigure your default agent.',
          response.status,
          errorBody
        );
      }

      throw new SlackApiError(
        `Agent execution failed: ${response.status}`,
        response.status,
        errorBody
      );
    }

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      const result = parseSSEResponse(text);

      if (result.error) {
        throw new SlackApiError(result.error, 500);
      }

      if (!result.text) {
        throw new SlackApiError('No response from agent', 500);
      }

      return result.text;
    }

    const result = (await response.json()) as ChatCompletionResponse;

    if (!result.choices || result.choices.length === 0) {
      throw new SlackApiError('No response from agent', 500);
    }

    return result.choices[0].message.content;
  }

  /**
   * Stream chat response directly to Slack using Slack's chat streaming APIs.
   * This provides a real-time streaming experience like ChatGPT.
   *
   * Note: Streaming posts a visible message in the channel (not ephemeral).
   * For ephemeral responses, use the regular `chat()` method with deferred response.
   *
   * The response is streamed in a thread under an initial "thinking" message.
   */
  async chatWithSlackStream(
    message: string,
    slackConfig: {
      botToken: string;
      channelId: string;
      teamId: string;
      userId: string;
      threadTs?: string;
    }
  ): Promise<string> {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = `${normalizedBase}/run/v1/chat/completions`;

    logger.debug({ channelId: slackConfig.channelId }, 'Executing agent chat with Slack streaming');

    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        model: 'default',
        messages: [{ role: 'user', content: message }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error({ status: response.status, errorBody }, 'Agent execution failed');

      if (response.status === 401) {
        throw new SlackApiError(
          'Agent API key is invalid or expired. Please reconfigure your default agent.',
          response.status,
          errorBody
        );
      }

      throw new SlackApiError(
        `Agent execution failed: ${response.status}`,
        response.status,
        errorBody
      );
    }

    const slackClient = new WebClient(slackConfig.botToken);

    const initialMessage = await slackClient.chat.postMessage({
      channel: slackConfig.channelId,
      text: '🤔 _Thinking..._',
    });

    if (!initialMessage.ts) {
      throw new SlackApiError('Failed to post initial message', 500);
    }

    const threadTs = initialMessage.ts;

    const streamer = slackClient.chatStream({
      channel: slackConfig.channelId,
      recipient_team_id: slackConfig.teamId,
      recipient_user_id: slackConfig.userId,
      thread_ts: threadTs,
    });

    let fullText = '';

    if (!response.body) {
      throw new SlackApiError('No response body from agent', 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'text-delta' && data.delta) {
              fullText += data.delta;
              await streamer.append({ markdown_text: data.delta });
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      const feedbackBlock = {
        type: 'context_actions' as const,
        elements: [
          {
            type: 'feedback_buttons' as const,
            action_id: 'agent_feedback',
            positive_button: {
              text: { type: 'plain_text' as const, text: '👍' },
              value: 'positive',
            },
            negative_button: {
              text: { type: 'plain_text' as const, text: '👎' },
              value: 'negative',
            },
          },
        ],
      };

      await streamer.stop({ blocks: [feedbackBlock] });
    } catch (error) {
      logger.error({ error }, 'Error during Slack streaming');
      await streamer.stop();
      throw error;
    }

    return fullText;
  }
}

/**
 * Factory function to create an AgentExecutionClient
 */
export function createAgentExecutionClient(apiKey: string): AgentExecutionClient {
  return new AgentExecutionClient({ apiKey });
}

/**
 * Send a deferred response to Slack via response_url
 *
 * Slack slash commands have a 3-second timeout. For long-running operations
 * like agent execution, we need to:
 * 1. Respond immediately with a "thinking" message
 * 2. Process the request asynchronously
 * 3. Send the actual response via response_url
 */
export async function sendDeferredResponse(
  responseUrl: string,
  message: {
    response_type?: 'ephemeral' | 'in_channel';
    text?: string;
    blocks?: unknown[];
    replace_original?: boolean;
    delete_original?: boolean;
  }
): Promise<void> {
  try {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        response_type: message.response_type || 'ephemeral',
        replace_original: message.replace_original ?? true,
        ...message,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error(
        { status: response.status, errorBody },
        'Failed to send deferred Slack response'
      );
    } else {
      logger.debug({}, 'Deferred Slack response sent successfully');
    }
  } catch (error) {
    logger.error({ error }, 'Error sending deferred Slack response');
  }
}
