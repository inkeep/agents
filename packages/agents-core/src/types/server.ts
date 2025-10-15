import type { Context } from 'hono';
import type { CredentialStoreType } from './utility';

/**
 * Credential store interface for managing different types of credentials
 */
export interface CredentialStore {
  /**
   * Unique identifier for this credential store
   */
  id: string;

  /**
   * Type of credential store
   */
  type: keyof typeof CredentialStoreType;

  /**
   * Get a credential by key
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a credential
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Check if a credential exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete a credential
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if the credential store is available and functional
   * @returns Promise resolving to availability status and optional reason if unavailable
   */
  checkAvailability(): Promise<{
    available: boolean;
    reason?: string;
  }>;
}

/**
 * Server configuration options for HTTP server behavior
 * These settings control connection management, timeouts, and server behavior
 */
export interface ServerOptions {
  /**
   * Server port to listen on
   * Default: 3000
   */
  port?: number;

  /**
   * Keep alive timeout in milliseconds
   * Time to wait for additional data after the last response before closing the connection.
   * Used for persistent connections to improve performance by reusing connections.
   * Scenario: Set higher (10-30s) for high-traffic APIs, lower (1-5s) for low-traffic services.
   * Default: 60000ms (60 seconds)
   */
  keepAliveTimeout?: number;

  /**
   * Enable keep alive connections
   * When true, allows connection reuse for multiple requests.
   * Improves performance but uses more server resources.
   * Scenario: Enable for APIs with frequent requests, disable for one-off services.
   * Default: true
   */
  keepAlive?: boolean;

  /**
   * Request timeout in milliseconds
   * Maximum time to wait for a complete request from the client.
   * Helps prevent DoS attacks by limiting resource consumption from slow clients.
   * Scenario: Set lower (30s) for simple APIs, higher (5-10min) for file upload services.
   * Default: 60000ms (60 seconds)
   */
  requestTimeout?: number;

  /**
   * Maximum request payload size in bytes
   * Limits the size of incoming request bodies via Content-Length header validation.
   * This is an API-level limit independent of model constraints, set high to accommodate large payloads.
   * Requests exceeding this limit will receive a 413 Payload Too Large response.
   * Scenario: Set lower for APIs with small payloads, keep at 1GB for general purpose APIs.
   * Default: 1073741824 bytes (1GB)
   */
  maxRequestSizeBytes?: number;
}

/**
 * CORS configuration compatible with Hono's CORSOptions
 */
export interface CorsConfig {
  /**
   * Allowed origins - string, array of strings, or function
   */
  origin?: string | string[] | ((origin: string, c?: Context) => string | null | undefined);

  /**
   * Allowed methods
   */
  allowMethods?: string[];

  /**
   * Allowed headers
   */
  allowHeaders?: string[];

  /**
   * Exposed headers
   */
  exposeHeaders?: string[];

  /**
   * Max age for preflight requests
   */
  maxAge?: number;

  /**
   * Whether to allow credentials
   */
  credentials?: boolean;
}

/**
 * Base server configuration for all Inkeep services
 */
export interface ServerConfig {
  /**
   * Server port to listen on
   */
  port?: number;

  /**
   * Server options for HTTP behavior
   */
  serverOptions?: ServerOptions;

  /**
   * Array of credential stores for managing API keys, tokens, etc.
   */
  credentialStores?: CredentialStore[];

  /**
   * CORS configuration
   */
  cors?: CorsConfig;
}
