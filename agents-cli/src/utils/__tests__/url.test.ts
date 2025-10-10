import { describe, expect, it } from 'vitest';
import { buildGraphViewUrl, normalizeBaseUrl } from '../url';

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

describe('buildGraphViewUrl', () => {
  const tenantId = 'test-tenant';
  const projectId = 'test-project';
  const graphId = 'test-graph';

  it('should build correct URL with provided base URL', () => {
    const result = buildGraphViewUrl('http://localhost:3000', tenantId, projectId, graphId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-graph'
    );
  });

  it('should use default URL when manageUiUrl is undefined', () => {
    const result = buildGraphViewUrl(undefined, tenantId, projectId, graphId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-graph'
    );
  });

  it('should handle trailing slashes in base URL', () => {
    const result = buildGraphViewUrl('http://localhost:3000/', tenantId, projectId, graphId);
    expect(result).toBe(
      'http://localhost:3000/test-tenant/projects/test-project/agents/test-graph'
    );
  });

  it('should handle URLs with existing paths', () => {
    const result = buildGraphViewUrl(
      'https://app.example.com/dashboard/',
      tenantId,
      projectId,
      graphId
    );
    expect(result).toBe(
      'https://app.example.com/dashboard/test-tenant/projects/test-project/agents/test-graph'
    );
  });

  it('should handle special characters in IDs', () => {
    const result = buildGraphViewUrl(
      'http://localhost:3000',
      'tenant-123',
      'project_456',
      'graph.with.dots'
    );
    expect(result).toBe(
      'http://localhost:3000/tenant-123/projects/project_456/agents/graph.with.dots'
    );
  });

  it('should throw error for invalid base URL', () => {
    expect(() => buildGraphViewUrl('not-a-url', tenantId, projectId, graphId)).toThrow(
      'Invalid URL format'
    );
  });

  it('should handle production URLs', () => {
    const result = buildGraphViewUrl(
      'https://manage.inkeep.com',
      'prod-tenant',
      'prod-project',
      'prod-graph'
    );
    expect(result).toBe(
      'https://manage.inkeep.com/prod-tenant/projects/prod-project/agents/prod-graph'
    );
  });
});
