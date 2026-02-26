import { describe, expect, it } from 'vitest';
import { buildClearCookieHeader, computeCandidateDomains } from '../route';

describe('computeCandidateDomains', () => {
  it('returns only undefined for localhost', () => {
    expect(computeCandidateDomains('localhost')).toEqual([undefined]);
  });

  it('returns only undefined for IP addresses', () => {
    expect(computeCandidateDomains('127.0.0.1')).toEqual([undefined]);
    expect(computeCandidateDomains('192.168.1.100')).toEqual([undefined]);
  });

  it('returns auto-computed domain for 2-part hostname', () => {
    expect(computeCandidateDomains('inkeep.com')).toEqual([undefined, '.inkeep.com']);
  });

  it('returns auto-computed and root domains for 3-part hostname', () => {
    expect(computeCandidateDomains('app.inkeep.com')).toEqual([
      undefined,
      '.app.inkeep.com',
      '.inkeep.com',
    ]);
  });

  it('returns auto-computed and root domains for 4-part hostname', () => {
    expect(computeCandidateDomains('api.agents.inkeep.com')).toEqual([
      undefined,
      '.agents.inkeep.com',
      '.inkeep.com',
    ]);
  });

  it('returns only undefined for single-part hostname', () => {
    expect(computeCandidateDomains('myhost')).toEqual([undefined]);
  });
});

describe('buildClearCookieHeader', () => {
  it('builds secure cookie header without domain', () => {
    const header = buildClearCookieHeader('better-auth.session_token', true);
    expect(header).toBe(
      'better-auth.session_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=None; Secure'
    );
  });

  it('builds non-secure cookie header without domain', () => {
    const header = buildClearCookieHeader('better-auth.session_token', false);
    expect(header).toBe(
      'better-auth.session_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax'
    );
  });

  it('includes domain when provided', () => {
    const header = buildClearCookieHeader('better-auth.session_token', true, '.inkeep.com');
    expect(header).toBe(
      'better-auth.session_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=None; Secure; Domain=.inkeep.com'
    );
  });

  it('builds non-secure header with domain', () => {
    const header = buildClearCookieHeader('better-auth.session_token', false, '.app.inkeep.com');
    expect(header).toBe(
      'better-auth.session_token=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax; Domain=.app.inkeep.com'
    );
  });
});
