import { describe, expect, it } from 'vitest';
import { buildAgentViewUrl, normalizeBaseUrl } from '../url';

describe('normalizeBaseUrl', () => {
  it('should remove trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('http://localhost:3000//')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('http://localhost:3000///')).toBe('http://localhost:3000');
  });

  it('should preserve URLs without trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com');
  });

  it('should handle URLs with paths', () => {
    expect(normalizeBaseUrl('http://localhost:3000/app/')).toBe('http://localhost:3000/app');
    expect(normalizeBaseUrl('https://example.com/dashboard/')).toBe(
      'https://example.com/dashboard'
    );
  });

  it('should trim whitespace', () => {
    expect(normalizeBaseUrl('  http://localhost:3000  ')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('\thttp://localhost:3000/\n')).toBe('http://localhost:3000');
  });

  it('should validate URL format', () => {
    expect(() => normalizeBaseUrl('localhost:3000')).toThrow('Invalid URL format');
    expect(() => normalizeBaseUrl('not-a-url')).toThrow('Invalid URL format');
    expect(() => normalizeBaseUrl('ftp://localhost')).toThrow('Invalid URL format');
    expect(() => normalizeBaseUrl('')).toThrow('Invalid URL format');
  });

  it('should accept both http and https protocols', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('https://localhost:3000')).toBe('https://localhost:3000');
    expect(normalizeBaseUrl('HTTP://localhost:3000')).toBe('HTTP://localhost:3000');
    expect(normalizeBaseUrl('HTTPS://localhost:3000')).toBe('HTTPS://localhost:3000');
  });
});

describe('buildAgentViewUrl', () => {
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const agentId = 'test-agent';

  it('should build correct URL with provided base URL', () => {
    const result = buildAgentViewUrl('http://localhost:3000', tenantId, projectId, agentId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-agent'
    );
  });

  it('should use default URL when manageUiUrl is undefined', () => {
    const result = buildAgentViewUrl(undefined, tenantId, projectId, agentId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-agent'
    );
  });

  it('should handle trailing slashes in base URL', () => {
    const result = buildAgentViewUrl('http://localhost:3000/', tenantId, projectId, agentId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-agent'
    );
  });

  it('should handle URLs with existing paths', () => {
    const result = buildAgentViewUrl(
      'https://app.example.com/dashboard/',
      tenantId,
      projectId,
      agentId
    );
    expect(result).toBe(
      'https://app.example.com/dashboard/test-tenant/projects/test-project/agents/test-agent'
    );
  });

  it('should handle special characters in IDs', () => {
    const result = buildAgentViewUrl(
      'http://localhost:3000',
      'tenant-123',
      'project_456',
      'agent.with.dots'
    );
    expect(result).toBe(
      'http://localhost:3000/tenant-123/projects/project_456/agents/agent.with.dots'
    );
  });

  it('should throw error for invalid base URL', () => {
    expect(() => buildAgentViewUrl('not-a-url', tenantId, projectId, agentId)).toThrow(
      'Invalid URL format'
    );
  });

  it('should handle production URLs', () => {
    const result = buildAgentViewUrl(
      'https://manage.inkeep.com',
      'prod-tenant',
      'prod-project',
      'prod-agent'
    );
    expect(result).toBe(
      'https://manage.inkeep.com/prod-tenant/projects/prod-project/agents/prod-agent'
    );
  });
});
