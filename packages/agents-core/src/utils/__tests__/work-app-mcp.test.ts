import { describe, expect, it } from 'vitest';
import { isTrustedWorkAppMcpUrl, TRUSTED_WORK_APP_MCP_PATHS } from '../work-app-mcp';

describe('isTrustedWorkAppMcpUrl', () => {
  const path = TRUSTED_WORK_APP_MCP_PATHS.slack;

  it('returns true for matching origin and trusted path', () => {
    expect(
      isTrustedWorkAppMcpUrl(
        'https://api.example.com/work-apps/slack/mcp',
        path,
        'https://api.example.com'
      )
    ).toBe(true);
  });

  it('returns false for attacker-controlled multi-part tld domain', () => {
    expect(
      isTrustedWorkAppMcpUrl(
        'https://evil.co.uk/work-apps/slack/mcp',
        path,
        'https://api.example.co.uk'
      )
    ).toBe(false);
  });

  it('returns false when scheme does not match', () => {
    expect(
      isTrustedWorkAppMcpUrl(
        'http://api.example.com/work-apps/slack/mcp',
        path,
        'https://api.example.com'
      )
    ).toBe(false);
  });

  it('returns false when port does not match', () => {
    expect(
      isTrustedWorkAppMcpUrl(
        'https://api.example.com:8443/work-apps/slack/mcp',
        path,
        'https://api.example.com'
      )
    ).toBe(false);
  });

  it('returns false when path does not match', () => {
    expect(
      isTrustedWorkAppMcpUrl(
        'https://api.example.com/work-apps/slack/mcp/extra',
        path,
        'https://api.example.com'
      )
    ).toBe(false);
  });
});
