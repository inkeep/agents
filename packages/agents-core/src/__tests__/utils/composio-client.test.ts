import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureComposioMCPServer } from '../../utils/third-party-mcp-servers/composio-client';

describe('configureComposioMCPServer', () => {
  const originalEnv = process.env.COMPOSIO_API_KEY;

  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = 'test-composio-key';
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.COMPOSIO_API_KEY = originalEnv;
    } else {
      delete process.env.COMPOSIO_API_KEY;
    }
  });

  it('should inject user_id and x-api-key for composio URLs', () => {
    const config: any = { url: 'https://backend.composio.dev/v3/mcp/server-123' };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project');

    const url = new URL(config.url);
    expect(url.searchParams.get('user_id')).toBe('tenant-1||project-1');
    expect(config.headers['x-api-key']).toBe('test-composio-key');
  });

  it('should inject connected_account_id when provided', () => {
    const config: any = { url: 'https://backend.composio.dev/v3/mcp/server-123' };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project', undefined, 'ca_abc-123');

    const url = new URL(config.url);
    expect(url.searchParams.get('user_id')).toBe('tenant-1||project-1');
    expect(url.searchParams.get('connected_account_id')).toBe('ca_abc-123');
  });

  it('should NOT inject connected_account_id when not provided', () => {
    const config: any = { url: 'https://backend.composio.dev/v3/mcp/server-123' };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project');

    const url = new URL(config.url);
    expect(url.searchParams.has('connected_account_id')).toBe(false);
  });

  it('should not overwrite existing user_id', () => {
    const config: any = {
      url: 'https://backend.composio.dev/v3/mcp/server-123?user_id=existing-user',
    };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project');

    const url = new URL(config.url);
    expect(url.searchParams.get('user_id')).toBe('existing-user');
  });

  it('should not overwrite existing connected_account_id', () => {
    const config: any = {
      url: 'https://backend.composio.dev/v3/mcp/server-123?connected_account_id=ca_existing',
    };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project', undefined, 'ca_new-one');

    const url = new URL(config.url);
    expect(url.searchParams.get('connected_account_id')).toBe('ca_existing');
  });

  it('should be a no-op for non-composio URLs', () => {
    const config: any = { url: 'https://mcp.example.com/server' };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'project', undefined, 'ca_123');

    expect(config.url).toBe('https://mcp.example.com/server');
    expect(config.headers).toBeUndefined();
  });

  it('should use userId for user-scoped credential scope', () => {
    const config: any = { url: 'https://backend.composio.dev/v3/mcp/server-123' };

    configureComposioMCPServer(config, 'tenant-1', 'project-1', 'user', 'user-42', 'ca_abc');

    const url = new URL(config.url);
    expect(url.searchParams.get('user_id')).toBe('user-42');
    expect(url.searchParams.get('connected_account_id')).toBe('ca_abc');
  });
});
