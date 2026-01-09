/**
 * Shared base API client for making HTTP requests
 * Used by both CLI and SDK to ensure consistent API communication
 *
 * This is a thin wrapper around fetch that provides consistent header handling.
 * Implementations should construct Authorization headers and pass them via options.
 */

import {
  generateInternalServiceToken,
  type InternalServiceId,
} from '../utils/internal-service-auth';

/**
 * Makes an HTTP request with consistent header defaults
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options (headers will be merged with defaults)
 * @returns Promise<Response>
 *
 * @example
 * ```typescript
 * // With Authorization header
 * const response = await apiFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: {
 *     Authorization: 'Bearer your-api-key'
 *   },
 *   body: JSON.stringify({ data: 'value' })
 * });
 *
 * // Without Authorization
 * const response = await apiFetch('https://api.example.com/public', {
 *   method: 'GET'
 * });
 * ```
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

export class BaseApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = 'BaseApiError';
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }
}

export type BaseApiClientAuth =
  | {
      mode: 'internalService';
      internalServiceName: InternalServiceId;
    }
  | {
      mode: 'apiKey';
      apiKey: string;
      isCI?: boolean;
    };

export interface BaseApiClientConfig {
  apiUrl: string;
  tenantId: string;
  projectId: string;
  auth: BaseApiClientAuth;
  ref?: string;
  userId?: string;
  userEmail?: string;
}

export abstract class BaseApiClient {
  protected apiUrl: string;
  protected tenantId: string | undefined;
  protected projectId: string;
  protected apiKey: string | undefined;
  protected isCI: boolean;
  protected internalServiceName?: InternalServiceId;
  protected ref?: string;
  protected userId?: string;
  protected userEmail?: string;
  
  protected constructor(config: BaseApiClientConfig) {
    this.apiUrl = config.apiUrl;
    this.tenantId = config.tenantId;
    this.projectId = config.projectId;
    this.apiKey = config.auth.mode === 'apiKey' ? config.auth.apiKey : undefined;
    this.isCI = config.auth.mode === 'apiKey' ? (config.auth.isCI ?? false) : false;
    this.internalServiceName =
      config.auth.mode === 'internalService' ? config.auth.internalServiceName : undefined;
    this.ref = config.ref;
    this.userId = config.userId;
    this.userEmail = config.userEmail;
  }

  protected checkTenantId(): string {
    if (!this.tenantId) {
      throw new Error('No tenant ID configured. Please run: inkeep init');
    }
    return this.tenantId;
  }

  /**
   * Builds a URL from the base API URL and a path
   * Supports optional ref and pagination query parameters
   */
  protected buildUrl(path: string, params?: { page?: number; limit?: number }): string {
    const normalizedBase = this.apiUrl.replace(/\/$/, '');
    const url = new URL(`${normalizedBase}${path}`);
    if (this.ref !== undefined && this.ref !== 'main') {
      url.searchParams.set('ref', this.ref);
    }
    if (params?.page !== undefined) {
      url.searchParams.set('page', String(params.page));
    }
    if (params?.limit !== undefined) {
      url.searchParams.set('limit', String(params.limit));
    }
    return url.toString();
  }

  /**
   * Gets auth headers for requests
   * Handles both internal service JWT tokens and API key authentication
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    const tenantId = this.checkTenantId();

    if (this.internalServiceName) {
      // Internal service mode: generate JWT token
      const token = await generateInternalServiceToken({
        serviceId: this.internalServiceName,
        tenantId,
        projectId: this.projectId,
        userId: this.userId,
      });
      return { Authorization: `Bearer ${token}` };
    }

    // API key mode
    if (this.apiKey) {
      if (this.isCI) {
        return { 'X-API-Key': this.apiKey };
      }
      return { Authorization: `Bearer ${this.apiKey}` };
    }

    return {};
  }

  /**
   * Wrapper around fetch that automatically includes auth header
   * Uses X-API-Key for CI mode, Authorization Bearer for interactive mode
   * @deprecated Use getAuthHeaders() with apiFetch() instead for more flexibility
   */
  protected async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // Build headers with auth if API key is present
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    // Add auth header based on mode
    if (this.apiKey) {
      if (this.isCI) {
        // CI mode: use X-API-Key header for tenant-level API keys
        headers['X-API-Key'] = this.apiKey;
      } else {
        // Interactive mode: use Bearer token for user session tokens
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
    }

    return apiFetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Creates an error instance for failed requests
   * Override in subclasses to return specific error types
   */
  protected createError(message: string, statusCode: number, responseBody: string): BaseApiError {
    return new BaseApiError(message, statusCode, responseBody);
  }

  /**
   * Extracts data from a successful response
   * Override in subclasses if the API wraps responses (e.g., { data: ... })
   */
  protected async extractResponseData<T>(response: Response): Promise<T> {
    return response.json() as Promise<T>;
  }

  /**
   * Makes a GET request with authentication
   */
  protected async makeGetRequest<T>(path: string, errorContext: string): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    const response = await apiFetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw this.createError(
        `${errorContext}: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return this.extractResponseData<T>(response);
  }

  /**
   * Makes a POST request with authentication
   */
  protected async makePostRequest<T>(
    path: string,
    body: unknown,
    errorContext: string
  ): Promise<T> {
    const url = this.buildUrl(path);
    const headers = await this.getAuthHeaders();

    const response = await apiFetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw this.createError(
        `${errorContext}: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return this.extractResponseData<T>(response);
  }

  /**
   * Makes paginated GET requests and collects all results
   */
  protected async makePaginatedGetRequest<T>(
    path: string,
    errorContext: string,
    pageSize: number = 100
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = 1;
    const headers = await this.getAuthHeaders();

    while (true) {
      const url = this.buildUrl(path, { page: currentPage, limit: pageSize });

      const response = await apiFetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw this.createError(
          `${errorContext}: ${response.status} ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const json = (await response.json()) as {
        data: T[];
        pagination: { page: number; limit: number; total: number; pages: number };
      };
      allItems.push(...json.data);

      if (currentPage >= json.pagination.pages) {
        break;
      }
      currentPage++;
    }

    return allItems;
  }

  getTenantId(): string | undefined {
    return this.tenantId;
  }

  getProjectId(): string {
    return this.projectId;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  getIsCI(): boolean {
    return this.isCI;
  }
}
