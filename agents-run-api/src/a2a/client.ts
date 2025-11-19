import type {
  A2AError,
  AgentCard,
  CancelTaskResponse,
  GetTaskPushNotificationConfigResponse,
  GetTaskResponse,
  JSONRPCError,
  JSONRPCErrorResponse,
  JSONRPCRequest,
  JSONRPCResult,
  Message,
  MessageSendParams,
  ResolvedRef,
  SendMessageResponse,
  SendStreamingMessageResponse,
  SendStreamingMessageSuccessResponse,
  SetTaskPushNotificationConfigResponse,
  Task,
  TaskArtifactUpdateEvent,
  TaskIdParams,
  TaskPushNotificationConfig,
  TaskQueryParams,
  TaskStatusUpdateEvent,
} from '@inkeep/agents-core';
import { getLogger } from '../logger';

const logger = getLogger('a2aClient');

type A2AStreamEventData = Message | Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

export type BackoffStrategy = {
  initialInterval: number;
  maxInterval: number;
  exponent: number;
  maxElapsedTime: number;
};

export type RetryConfig =
  | { strategy: 'none' }
  | {
      strategy: 'backoff';
      backoff?: BackoffStrategy;
      retryConnectionErrors?: boolean;
      statusCodes?: string[];
    };

export interface A2AClientOptions {
  retryConfig?: RetryConfig;
  ref?: ResolvedRef;
  headers?: Record<string, string>;
}

const DEFAULT_BACKOFF: BackoffStrategy = {
  initialInterval: 500,
  maxInterval: 60000,
  exponent: 1.5,
  maxElapsedTime: 30000, // 30 seconds for A2A calls
};

const DEFAULT_RETRY_STATUS_CODES = ['429', '500', '502', '503', '504'];

/**
 * Error classes for retry logic
 */
class PermanentError extends Error {
  override readonly cause: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    let msg = message;
    if (options?.cause) {
      msg += `: ${options.cause}`;
    }
    super(msg, options);
    this.name = 'PermanentError';
    if (typeof this.cause === 'undefined') {
      this.cause = options?.cause;
    }
    Object.setPrototypeOf(this, PermanentError.prototype);
  }
}

class TemporaryError extends Error {
  response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.response = response;
    this.name = 'TemporaryError';
    Object.setPrototypeOf(this, TemporaryError.prototype);
  }
}

/**
 * A2AClient is a TypeScript HTTP client for interacting with A2A-compliant agents.
 *
 * Features:
 * - Configurable retry behavior with exponential backoff
 * - Automatic retry on network errors and configurable HTTP status codes
 * - Support for custom retry strategies and timeouts
 *
 * Default retry behavior:
 * - Retries on: 429, 500, 502, 503, 504 status codes and network errors
 * - Initial delay: 500ms, max delay: 60s, exponential backoff (1.5x)
 * - Max total retry time: 30 seconds
 *
 * @example
 * // Default retry behavior
 * const client = new A2AClient('https://agent.example.com');
 *
 * // Custom retry configuration
 * const client = new A2AClient('https://agent.example.com', {
 *   retryConfig: {
 *     strategy: 'backoff',
 *     retryConnectionErrors: true,
 *     statusCodes: ['429', '502', '503', '504'],
 *     backoff: {
 *       initialInterval: 1000,
 *       maxInterval: 30000,
 *       exponent: 2,
 *       maxElapsedTime: 60000
 *     }
 *   }
 * });
 *
 * // Disable retries
 * const client = new A2AClient('https://agent.example.com', {
 *   retryConfig: { strategy: 'none' }
 * });
 */
export class A2AClient {
  private agentBaseUrl: string;
  private agentCardPromise: Promise<AgentCard>;
  private requestIdCounter = 1;
  private serviceEndpointUrl?: string; // To be populated from AgentCard after fetching
  private options: A2AClientOptions;

  /**
   * Constructs an A2AClient instance.
   * It initiates fetching the agent card from the provided agent baseUrl.
   * The Agent Card is expected at `${agentBaseUrl}/.well-known/agent.json`.
   * The `url` field from the Agent Card will be used as the RPC service endpoint.
   * @param agentBaseUrl The base URL of the A2A agent (e.g., https://agent.example.com).
   * @param options Optional configuration including retry behavior.
   */
  constructor(agentBaseUrl: string, options?: A2AClientOptions) {
    this.agentBaseUrl = agentBaseUrl.replace(/\/$/, ''); // Remove trailing slash if any
    this.options = {
      retryConfig: {
        strategy: 'backoff',
        backoff: DEFAULT_BACKOFF,
        retryConnectionErrors: true,
        statusCodes: DEFAULT_RETRY_STATUS_CODES,
      },
      ...options,
    };
    this.agentCardPromise = this._fetchAndCacheAgentCard();
  }

  /**
   * Fetches the Agent Card from the agent's well-known URI and caches its service endpoint URL.
   * This method is called by the constructor.
   * @returns A Promise that resolves to the AgentCard.
   */
  private async _fetchAndCacheAgentCard(): Promise<AgentCard> {
    const agentCardUrl = `${this.agentBaseUrl}/.well-known/agent.json`;

    // Add ref as query parameter if it exists
    const url = new URL(agentCardUrl);
    if (this.options.ref) {
      url.searchParams.set('ref', this.options.ref.name);
    }

    getLogger('a2a').info(
      { agentCardUrl: url.toString(), agentBaseUrl: this.agentBaseUrl },
      'agentCardUrl'
    );
    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          ...(this.options.headers || {}),
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Agent Card from ${url.toString()}: ${response.status} ${response.statusText}`
        );
      }
      const agentCard: AgentCard = await response.json();
      if (!agentCard.url) {
        throw new Error(
          "Fetched Agent Card does not contain a valid 'url' for the service endpoint."
        );
      }
      this.serviceEndpointUrl = agentCard.url; // Cache the service endpoint URL from the agent card
      return agentCard;
    } catch (error) {
      console.error('Error fetching or parsing Agent Card:', error);
      throw error;
    }
  }

  /**
   * Retrieves the Agent Card.
   * If an `agentBaseUrl` is provided, it fetches the card from that specific URL.
   * Otherwise, it returns the card fetched and cached during client construction.
   * @param agentBaseUrl Optional. The base URL of the agent to fetch the card from.
   * If provided, this will fetch a new card, not use the cached one from the constructor's URL.
   * @returns A Promise that resolves to the AgentCard.
   */
  public async getAgentCard(agentBaseUrl?: string): Promise<AgentCard> {
    if (agentBaseUrl) {
      const specificAgentBaseUrl = agentBaseUrl.replace(/\/$/, '');
      const agentCardUrl = `${specificAgentBaseUrl}/.well-known/agent.json`;

      // Add ref as query parameter if it exists
      const url = new URL(agentCardUrl);
      if (this.options.ref) {
        url.searchParams.set('ref', this.options.ref.name);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          ...(this.options.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Agent Card from ${url.toString()}: ${response.status} ${response.statusText}`
        );
      }
      return (await response.json()) as AgentCard;
    }
    return this.agentCardPromise;
  }

  /**
   * Gets the RPC service endpoint URL. Ensures the agent card has been fetched first.
   * Adds ref as query parameter if it exists.
   * @returns A Promise that resolves to the service endpoint URL string.
   */
  private async _getServiceEndpoint(): Promise<string> {
    let endpoint: string;
    if (this.serviceEndpointUrl) {
      endpoint = this.serviceEndpointUrl;
    } else {
      await this.agentCardPromise;
      if (!this.serviceEndpointUrl) {
        throw new Error(
          'Agent Card URL for RPC endpoint is not available. Fetching might have failed.'
        );
      }
      endpoint = this.serviceEndpointUrl;
    }

    // Add ref as query parameter if it exists
    if (this.options.ref) {
      const url = new URL(endpoint);
      url.searchParams.set('ref', this.options.ref.name);
      return url.toString();
    }

    return endpoint;
  }

  /**
   * Retry utility functions
   */
  private async retry(fetchFn: () => Promise<Response>): Promise<Response> {
    const config = this.options.retryConfig;
    if (!config || config.strategy === 'none') {
      return await fetchFn();
    }

    const statusCodes = config.statusCodes || DEFAULT_RETRY_STATUS_CODES;
    return this.retryBackoff(
      this.wrapFetcher(fetchFn, {
        statusCodes,
        retryConnectionErrors: !!config.retryConnectionErrors,
      }),
      config.backoff ?? DEFAULT_BACKOFF
    );
  }

  private wrapFetcher(
    fn: () => Promise<Response>,
    options: {
      statusCodes: string[];
      retryConnectionErrors: boolean;
    }
  ): () => Promise<Response> {
    return async () => {
      try {
        const res = await fn();
        if (this.isRetryableResponse(res, options.statusCodes)) {
          throw new TemporaryError('Response failed with retryable status code', res);
        }
        return res;
      } catch (err: unknown) {
        if (err instanceof TemporaryError) {
          throw err;
        }

        if (options.retryConnectionErrors && this.isRetryableError(err)) {
          throw err;
        }

        throw new PermanentError('Permanent error', { cause: err });
      }
    };
  }

  private isRetryableResponse(res: Response, statusCodes: string[]): boolean {
    const actual = `${res.status}`;
    const codeRangeRE = /^[0-9]xx$/i;

    return statusCodes.some((code) => {
      if (!codeRangeRE.test(code)) {
        return code === actual;
      }

      const expectFamily = code.charAt(0);
      if (!expectFamily) {
        throw new Error('Invalid status code range');
      }

      const actualFamily = actual.charAt(0);
      if (!actualFamily) {
        throw new Error(`Invalid response status code: ${actual}`);
      }

      return actualFamily === expectFamily;
    });
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('fetch')
      );
    }
    return false;
  }

  private async retryBackoff(
    fn: () => Promise<Response>,
    strategy: BackoffStrategy
  ): Promise<Response> {
    const { maxElapsedTime, initialInterval, exponent, maxInterval } = strategy;

    const start = Date.now();
    let attempt = 0;

    while (true) {
      try {
        const res = await fn();
        if (attempt > 0) {
          logger.info(
            {
              attempts: attempt + 1,
              elapsedTime: Date.now() - start,
            },
            'A2A request succeeded after retries'
          );
        }
        return res;
      } catch (err: unknown) {
        if (err instanceof PermanentError) {
          throw err.cause;
        }

        const elapsed = Date.now() - start;
        if (elapsed > maxElapsedTime) {
          logger.warn(
            {
              attempts: attempt + 1,
              elapsedTime: elapsed,
              maxElapsedTime,
            },
            'A2A request max retry time exceeded'
          );
          if (err instanceof TemporaryError) {
            return err.response;
          }
          throw err;
        }

        let retryInterval = 0;
        if (err instanceof TemporaryError) {
          retryInterval = this.retryIntervalFromResponse(err.response);
        }

        if (retryInterval <= 0) {
          retryInterval = initialInterval * attempt ** exponent + Math.random() * 1000;
        }

        const delayMs = Math.min(retryInterval, maxInterval);

        logger.info(
          {
            attempt: attempt + 1,
            delayMs,
            error: err instanceof TemporaryError ? `HTTP ${err.response.status}` : 'Network error',
          },
          'A2A request failed, retrying after delay'
        );

        await this.delay(delayMs);
        attempt++;
      }
    }
  }

  private retryIntervalFromResponse(res: Response): number {
    const retryVal = res.headers.get('retry-after') || '';
    if (!retryVal) {
      return 0;
    }

    const parsedNumber = Number(retryVal);
    if (Number.isInteger(parsedNumber)) {
      return parsedNumber * 1000;
    }

    const parsedDate = Date.parse(retryVal);
    if (Number.isInteger(parsedDate)) {
      const deltaMS = parsedDate - Date.now();
      return deltaMS > 0 ? Math.ceil(deltaMS) : 0;
    }

    return 0;
  }

  private async delay(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /**
   * Helper method to make a generic JSON-RPC POST request.
   * @param method The RPC method name.
   * @param params The parameters for the RPC method.
   * @returns A Promise that resolves to the RPC response.
   */
  private async _postRpcRequest<
    TParams,
    TResponse extends JSONRPCResult<any> | JSONRPCErrorResponse,
  >(method: string, params: TParams): Promise<TResponse> {
    const endpoint = await this._getServiceEndpoint();
    const requestId = this.requestIdCounter++;
    const rpcRequest: JSONRPCRequest = {
      jsonrpc: '2.0',
      method,
      params: params as { [key: string]: any }, // Cast because TParams structure varies per method
      id: requestId,
    };

    const httpResponse = await this.retry(async () => {
      return fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json', // Expect JSON response for non-streaming requests
          ...(this.options.headers || {}),
        },
        body: JSON.stringify(rpcRequest),
      });
    });

    if (!httpResponse.ok) {
      let errorBodyText = '(empty or non-JSON response)';
      try {
        errorBodyText = await httpResponse.text();
        const errorJson = JSON.parse(errorBodyText);
        if (!errorJson.jsonrpc && errorJson.error) {
          throw new Error(
            `RPC error for ${method}: ${errorJson.error.message} (Code: ${errorJson.error.code}, HTTP Status: ${httpResponse.status}) Data: ${JSON.stringify(errorJson.error.data)}`
          );
        }
        if (!errorJson.jsonrpc) {
          throw new Error(
            `HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`
          );
        }
      } catch (e: any) {
        if (e.message.startsWith('RPC error for') || e.message.startsWith('HTTP error for'))
          throw e;
        throw new Error(
          `HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`
        );
      }
    }

    const rpcResponse = await httpResponse.json();

    if (rpcResponse.id !== requestId) {
      logger.warn(
        {
          method,
          expectedId: requestId,
          receivedId: rpcResponse.id,
        },
        'RPC response ID mismatch - this may lead to incorrect response handling'
      );
    }

    return rpcResponse as TResponse;
  }

  /**
   * Sends a message to the agent.
   * The behavior (blocking/non-blocking) and push notification configuration
   * are specified within the `params.configuration` object.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * @param params The parameters for sending the message, including the message content and configuration.
   * @returns A Promise resolving to SendMessageResponse, which can be a Message, Task, or an error.
   */
  public async sendMessage(params: MessageSendParams): Promise<SendMessageResponse> {
    return this._postRpcRequest<MessageSendParams, SendMessageResponse>('message/send', params);
  }

  /**
   * Sends a message to the agent and streams back responses using Server-Sent Events (SSE).
   * Push notification configuration can be specified in `params.configuration`.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params The parameters for sending the message.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   * The generator throws an error if streaming is not supported or if an HTTP/SSE error occurs.
   */
  public async *sendMessageStream(
    params: MessageSendParams
  ): AsyncGenerator<A2AStreamEventData, void, undefined> {
    const endpoint = await this._getServiceEndpoint();
    const clientRequestId = this.requestIdCounter++; // Use a unique ID for this stream request
    const rpcRequest: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'message/stream',
      params: params as { [key: string]: any },
      id: clientRequestId,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream', // Crucial for SSE
        ...(this.options.headers || {}),
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error) {
          throw new Error(
            `HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}. RPC Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`
          );
        }
      } catch (e: any) {
        if (e.message.startsWith('HTTP error establishing stream')) throw e;
        throw new Error(
          `HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}. Response: ${errorBody || '(empty)'}`
        );
      }
      throw new Error(
        `HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}`
      );
    }
    if (!response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
      throw new Error(
        "Invalid response Content-Type for SSE stream. Expected 'text/event-stream'."
      );
    }

    yield* this._parseA2ASseStream<A2AStreamEventData>(response, clientRequestId);
  }

  /**
   * Sets or updates the push notification configuration for a given task.
   * Requires the agent to support push notifications (`capabilities.pushNotifications: true` in AgentCard).
   * @param params Parameters containing the taskId and the TaskPushNotificationConfig.
   * @returns A Promise resolving to SetTaskPushNotificationConfigResponse.
   */
  public async setTaskPushNotificationConfig(
    params: TaskPushNotificationConfig
  ): Promise<SetTaskPushNotificationConfigResponse> {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.pushNotifications) {
      throw new Error(
        'Agent does not support push notifications (AgentCard.capabilities.pushNotifications is not true).'
      );
    }
    return this._postRpcRequest<TaskPushNotificationConfig, SetTaskPushNotificationConfigResponse>(
      'tasks/pushNotificationConfig/set',
      params
    );
  }

  /**
   * Gets the push notification configuration for a given task.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to GetTaskPushNotificationConfigResponse.
   */
  public async getTaskPushNotificationConfig(
    params: TaskIdParams
  ): Promise<GetTaskPushNotificationConfigResponse> {
    return this._postRpcRequest<TaskIdParams, GetTaskPushNotificationConfigResponse>(
      'tasks/pushNotificationConfig/get',
      params
    );
  }

  /**
   * Retrieves a task by its ID.
   * @param params Parameters containing the taskId and optional historyLength.
   * @returns A Promise resolving to GetTaskResponse, which contains the Task object or an error.
   */
  public async getTask(params: TaskQueryParams): Promise<GetTaskResponse> {
    return this._postRpcRequest<TaskQueryParams, GetTaskResponse>('tasks/get', params);
  }

  /**
   * Cancels a task by its ID.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to CancelTaskResponse, which contains the updated Task object or an error.
   */
  public async cancelTask(params: TaskIdParams): Promise<CancelTaskResponse> {
    return this._postRpcRequest<TaskIdParams, CancelTaskResponse>('tasks/cancel', params);
  }

  /**
   * Resubscribes to a task's event stream using Server-Sent Events (SSE).
   * This is used if a previous SSE connection for an active task was broken.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params Parameters containing the taskId.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   */
  public async *resubscribeTask(
    params: TaskIdParams
  ): AsyncGenerator<A2AStreamEventData, void, undefined> {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.streaming) {
      throw new Error('Agent does not support streaming (required for tasks/resubscribe).');
    }

    const endpoint = await this._getServiceEndpoint();
    const clientRequestId = this.requestIdCounter++; // Unique ID for this resubscribe request
    const rpcRequest: JSONRPCRequest = {
      jsonrpc: '2.0',
      method: 'tasks/resubscribe',
      params: params as { [key: string]: any },
      id: clientRequestId,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(this.options.headers || {}),
      },
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error) {
          throw new Error(
            `HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}. RPC Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`
          );
        }
      } catch (e: any) {
        if (e.message.startsWith('HTTP error establishing stream')) throw e;
        throw new Error(
          `HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}. Response: ${errorBody || '(empty)'}`
        );
      }
      throw new Error(
        `HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}`
      );
    }
    if (!response.headers.get('Content-Type')?.startsWith('text/event-stream')) {
      throw new Error(
        "Invalid response Content-Type for SSE stream on resubscribe. Expected 'text/event-stream'."
      );
    }

    yield* this._parseA2ASseStream<A2AStreamEventData>(response, clientRequestId);
  }

  /**
   * Parses an HTTP response body as an A2A Server-Sent Event stream.
   * Each 'data' field of an SSE event is expected to be a JSON-RPC 2.0 Response object,
   * specifically a SendStreamingMessageResponse (or similar structure for resubscribe).
   * @param response The HTTP Response object whose body is the SSE stream.
   * @param originalRequestId The ID of the client's JSON-RPC request that initiated this stream.
   * Used to validate the `id` in the streamed JSON-RPC responses.
   * @returns An AsyncGenerator yielding the `result` field of each valid JSON-RPC success response from the stream.
   */
  private async *_parseA2ASseStream<TStreamItem>(
    response: Response,
    originalRequestId: number | string | null
  ): AsyncGenerator<TStreamItem, void, undefined> {
    if (!response.body) {
      throw new Error('SSE response body is undefined. Cannot read stream.');
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

    let buffer = ''; // Holds incomplete lines from the stream
    let eventDataBuffer = ''; // Holds accumulated 'data:' lines for the current event

    try {
      while (true) {
        const { done, value } = await reader.read();
        logger.info({ done, value }, 'parseA2ASseStream');
        if (done) {
          if (eventDataBuffer.trim()) {
            const result = this._processSseEventData<TStreamItem>(
              eventDataBuffer,
              originalRequestId
            );
            yield result;
          }
          break; // Stream finished
        }

        buffer += value; // Append new chunk to buffer
        let lineEndIndex: number;
        lineEndIndex = buffer.indexOf('\n');
        while (lineEndIndex >= 0) {
          const line = buffer.substring(0, lineEndIndex).trim(); // Get and trim the line
          buffer = buffer.substring(lineEndIndex + 1); // Remove processed line from buffer

          if (line === '') {
            if (eventDataBuffer) {
              const result = this._processSseEventData<TStreamItem>(
                eventDataBuffer,
                originalRequestId
              );
              yield result;
              eventDataBuffer = ''; // Reset buffer for the next event
            }
          } else if (line.startsWith('data:')) {
            eventDataBuffer += `${line.substring(5).trimStart()}\n`; // Append data (multi-line data is possible)
          } else if (line.startsWith(':')) {
          } else if (line.includes(':')) {
          }
          lineEndIndex = buffer.indexOf('\n'); // Update for next iteration
        }
      }
    } catch (error: any) {
      console.error('Error reading or parsing SSE stream:', error.message);
      throw error;
    } finally {
      reader.releaseLock(); // Ensure the reader lock is released
    }
  }

  /**
   * Processes a single SSE event's data string, expecting it to be a JSON-RPC response.
   * @param jsonData The string content from one or more 'data:' lines of an SSE event.
   * @param originalRequestId The ID of the client's request that initiated the stream.
   * @returns The `result` field of the parsed JSON-RPC success response.
   * @throws Error if data is not valid JSON, not a valid JSON-RPC response, an error response, or ID mismatch.
   */
  private _processSseEventData<TStreamItem>(
    jsonData: string,
    originalRequestId: number | string | null
  ): TStreamItem {
    if (!jsonData.trim()) {
      throw new Error('Attempted to process empty SSE event data.');
    }
    try {
      // SSE data can be multi-line, ensure it's treated as a single JSON string.
      const sseJsonRpcResponse = JSON.parse(jsonData.replace(/\n$/, '')); // Remove trailing newline if any

      // Type assertion to SendStreamingMessageResponse, as this is the expected structure for A2A streams.
      const a2aStreamResponse = sseJsonRpcResponse as SendStreamingMessageResponse;

      if (a2aStreamResponse.id !== originalRequestId) {
        // According to JSON-RPC spec, notifications (which SSE events can be seen as) might not have an ID,
        // or if they do, it should match. A2A spec implies streamed events are tied to the initial request.
        console.warn(
          `SSE Event's JSON-RPC response ID mismatch. Client request ID: ${originalRequestId}, event response ID: ${a2aStreamResponse.id}.`
        );
        // Depending on strictness, this could be an error. For now, it's a warning.
      }

      if (a2aStreamResponse.error) {
        const err = a2aStreamResponse.error as JSONRPCError | A2AError;
        throw new Error(
          `SSE event contained an error: ${err.message} (Code: ${err.code}) Data: ${JSON.stringify(err.data)}`
        );
      }

      // Check if 'result' exists, as it's mandatory for successful JSON-RPC responses
      if (
        !('result' in a2aStreamResponse) ||
        typeof (a2aStreamResponse as SendStreamingMessageSuccessResponse).result === 'undefined'
      ) {
        throw new Error(`SSE event JSON-RPC response is missing 'result' field. Data: ${jsonData}`);
      }

      const successResponse = a2aStreamResponse as SendStreamingMessageSuccessResponse;
      return successResponse.result as TStreamItem;
    } catch (e: any) {
      // Catch errors from JSON.parse or if it's an error response that was thrown by this function
      if (
        e.message.startsWith('SSE event contained an error') ||
        e.message.startsWith("SSE event JSON-RPC response is missing 'result' field")
      ) {
        throw e; // Re-throw errors already processed/identified by this function
      }
      // For other parsing errors or unexpected structures:
      console.error(
        'Failed to parse SSE event data string or unexpected JSON-RPC structure:',
        jsonData,
        e
      );
      throw new Error(
        `Failed to parse SSE event data: "${jsonData.substring(0, 100)}...". Original error: ${e.message}`
      );
    }
  }
}
