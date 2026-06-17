import { env } from '../env';
import { getOAuthIssuer } from './oauthJwks';

const DEFAULT_BASE_URL = 'http://localhost:3002';

function resourceBaseUrl(): string {
  return env.INKEEP_AGENTS_API_URL || DEFAULT_BASE_URL;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

export function getProtectedResourceMetadata(): ProtectedResourceMetadata {
  return {
    resource: resourceBaseUrl(),
    authorization_servers: [getOAuthIssuer()],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    bearer_methods_supported: ['header'],
  };
}

export function protectedResourceMetadataUrl(): string {
  return `${resourceBaseUrl()}/.well-known/oauth-protected-resource`;
}

export function mcpWwwAuthenticateHeader(opts?: { error?: string; description?: string }): string {
  const parts = [`Bearer resource_metadata="${protectedResourceMetadataUrl()}"`];
  if (opts?.error) {
    parts.push(`error="${opts.error}"`);
  }
  if (opts?.description) {
    parts.push(`error_description="${opts.description}"`);
  }
  return parts.join(', ');
}
