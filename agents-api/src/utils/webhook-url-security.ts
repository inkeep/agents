import { validateUrlResolvesToPublicIp } from '@inkeep/agents-core/external-fetch';
import { env } from '../env';

export class WebhookUrlSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlSecurityError';
  }
}

const MAX_WEBHOOK_REDIRECTS = 5;

export function validateWebhookUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new WebhookUrlSecurityError('Invalid URL');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new WebhookUrlSecurityError(`Unsupported protocol: ${protocol}`);
  }

  if (parsed.username || parsed.password) {
    throw new WebhookUrlSecurityError('URLs with embedded credentials are not allowed');
  }

  return parsed;
}

async function validateAgainstSsrfPolicy(url: URL): Promise<void> {
  if (env.ENVIRONMENT !== 'development') {
    await validateUrlResolvesToPublicIp(url);
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export async function fetchWithSsrfProtection(url: string, init: RequestInit): Promise<Response> {
  let currentUrl = validateWebhookUrl(url);
  await validateAgainstSsrfPolicy(currentUrl);

  for (let hopCount = 0; hopCount <= MAX_WEBHOOK_REDIRECTS; hopCount++) {
    const response = await fetch(currentUrl.toString(), { ...init, redirect: 'manual' });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    if (hopCount === MAX_WEBHOOK_REDIRECTS) {
      throw new WebhookUrlSecurityError(`Too many redirects (exceeded ${MAX_WEBHOOK_REDIRECTS})`);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new WebhookUrlSecurityError('Redirect response missing Location header');
    }

    currentUrl = validateWebhookUrl(new URL(location, currentUrl).toString());
    await validateAgainstSsrfPolicy(currentUrl);
  }

  throw new WebhookUrlSecurityError('Unexpected redirect handling state');
}
