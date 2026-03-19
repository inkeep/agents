export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

export class ZendeskApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly retryAfter?: number
  ) {
    super(`Zendesk API error: ${status} ${statusText}`);
    this.name = 'ZendeskApiError';
  }
}

export function getConfig(): ZendeskConfig {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const apiToken = process.env.ZENDESK_API_TOKEN;

  const missing: string[] = [];
  if (!subdomain) missing.push('ZENDESK_SUBDOMAIN');
  if (!email) missing.push('ZENDESK_EMAIL');
  if (!apiToken) missing.push('ZENDESK_API_TOKEN');

  if (missing.length > 0 || !subdomain || !email || !apiToken) {
    console.error(
      `Error: Missing required environment variables: ${missing.join(', ')}\n\n` +
        'Configure your Zendesk credentials:\n' +
        '  ZENDESK_SUBDOMAIN  - Your Zendesk subdomain (e.g., "mycompany" for mycompany.zendesk.com)\n' +
        '  ZENDESK_EMAIL      - Email associated with your API token\n' +
        '  ZENDESK_API_TOKEN  - Your Zendesk API token\n'
    );
    process.exit(1);
  }

  return { subdomain, email, apiToken };
}

export class ZendeskClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: ZendeskConfig) {
    this.baseUrl = `https://${config.subdomain}.zendesk.com/api/v2`;
    const credentials = Buffer.from(`${config.email}/token:${config.apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          searchParams.set(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      const retryAfter =
        response.status === 429
          ? parseInt(response.headers.get('Retry-After') || '60', 10)
          : undefined;
      throw new ZendeskApiError(response.status, response.statusText, body, retryAfter);
    }

    return (await response.json()) as T;
  }
}

export function handleError(error: unknown): string {
  if (error instanceof ZendeskApiError) {
    switch (error.status) {
      case 401:
        return 'Authentication failed. Check your ZENDESK_EMAIL and ZENDESK_API_TOKEN values.';
      case 403:
        return 'Permission denied. Your API token may not have access to this resource.';
      case 404:
        return 'Resource not found.';
      case 429:
        return `Rate limited by Zendesk. Retry after ${error.retryAfter ?? 60} seconds.`;
      default:
        return `Zendesk API error (${error.status}): ${error.body}`;
    }
  }
  if (error instanceof TypeError && (error as NodeJS.ErrnoException).cause) {
    return 'Could not connect to Zendesk. Check your ZENDESK_SUBDOMAIN value and network connection.';
  }
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
