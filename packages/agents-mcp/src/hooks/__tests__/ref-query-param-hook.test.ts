import { describe, expect, it } from 'vitest';
import { RefQueryParamHook } from '../ref-query-param-hook.js';

describe('RefQueryParamHook', () => {
  const mockHookCtx = {} as any;

  it('should append ref query parameter to request URL', async () => {
    const hook = new RefQueryParamHook('feature-branch');
    const request = new Request('https://api.example.com/manage/tenants/t1/projects/p1/agents');

    const result = await hook.beforeRequest(mockHookCtx, request);

    const url = new URL(result.url);
    expect(url.searchParams.get('ref')).toBe('feature-branch');
  });

  it('should not modify request when ref is main', async () => {
    const hook = new RefQueryParamHook('main');
    const request = new Request('https://api.example.com/manage/tenants/t1/projects/p1/agents');

    const result = await hook.beforeRequest(mockHookCtx, request);

    const url = new URL(result.url);
    expect(url.searchParams.get('ref')).toBeNull();
  });

  it('should not modify request when ref is empty', async () => {
    const hook = new RefQueryParamHook('');
    const request = new Request('https://api.example.com/manage/tenants/t1/projects/p1/agents');

    const result = await hook.beforeRequest(mockHookCtx, request);

    const url = new URL(result.url);
    expect(url.searchParams.get('ref')).toBeNull();
  });

  it('should preserve existing query parameters', async () => {
    const hook = new RefQueryParamHook('my-branch');
    const request = new Request(
      'https://api.example.com/manage/tenants/t1/projects/p1/agents?page=1&limit=10'
    );

    const result = await hook.beforeRequest(mockHookCtx, request);

    const url = new URL(result.url);
    expect(url.searchParams.get('ref')).toBe('my-branch');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
  });
});
