import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { contextConfig, fetchDefinition, headers } from '../../context/ContextConfig';
import type { DotPaths } from '../../context/validation-helpers';

describe('DotPaths type utility', () => {
  it('should generate paths for flat objects', () => {
    type FlatObj = { name: string; age: number };
    type Paths = DotPaths<FlatObj>;

    const validPaths: Paths[] = ['', 'name', 'age'];
    expect(validPaths).toBeDefined();
  });

  it('should generate paths for nested objects', () => {
    type NestedObj = { user: { name: string; address: { city: string } } };
    type Paths = DotPaths<NestedObj>;

    const validPaths: Paths[] = ['', 'user', 'user.name', 'user.address', 'user.address.city'];
    expect(validPaths).toBeDefined();
  });

  it('should generate paths for arrays', () => {
    type ArrayObj = { items: string[]; users: { name: string }[] };
    type Paths = DotPaths<ArrayObj>;

    const validPaths: Paths[] = [
      '',
      'items',
      'items[0]',
      'items[*]',
      'users',
      'users[0]',
      'users[*]',
      'users[0].name',
      'users[*].name',
    ];
    expect(validPaths).toBeDefined();
  });
});

describe('contextConfig.toTemplate', () => {
  const userSchema = z.object({
    name: z.string(),
    email: z.string(),
    profile: z.object({
      bio: z.string(),
      avatar: z.string(),
    }),
    tags: z.array(z.string()),
  });

  const userFetcher = fetchDefinition({
    id: 'user',
    name: 'User',
    trigger: 'initialization',
    fetchConfig: { url: '/api/user' },
    responseSchema: userSchema,
  });

  const config = contextConfig({
    id: 'test',
    graphId: 'test-graph',
    headers: z.object({ token: z.string() }),
    contextVariables: { user: userFetcher },
  });

  it('should return template strings for valid paths', () => {
    expect(config.toTemplate('user')).toBe('{{user}}');
    expect(config.toTemplate('user.name')).toBe('{{user.name}}');
    expect(config.toTemplate('user.profile.bio')).toBe('{{user.profile.bio}}');
    expect(config.toTemplate('user.tags[0]')).toBe('{{user.tags[0]}}');
    expect(config.toTemplate('user.tags[*]')).toBe('{{user.tags[*]}}');
  });

  // TypeScript compile-time check (won't run, just for type validation)
  it('should enforce type safety at compile time', () => {
    // These should compile
    config.toTemplate('user.name');
    config.toTemplate('user.profile.avatar');

    // @ts-expect-error - invalid path should cause type error
    config.toTemplate('user.invalid');
    // @ts-expect-error - invalid nested path should cause type error
    config.toTemplate('user.profile.invalid');

    expect(true).toBe(true);
  });
});

describe('headers.toTemplate', () => {
  const schema = z.object({
    userId: z.string(),
    session: z.object({
      id: z.string(),
      expires: z.number(),
    }),
    roles: z.array(z.string()),
  });

  const headersSchema = headers({ schema });

  it('should return template strings for headers paths', () => {
    expect(headersSchema.toTemplate('session')).toBe('{{headers.session}}');
    expect(headersSchema.toTemplate('session.id')).toBe('{{headers.session.id}}');
    expect(headersSchema.toTemplate('roles[0]')).toBe('{{headers.roles[0]}}');
    expect(headersSchema.toTemplate('roles[*]')).toBe('{{headers.roles[*]}}');
  });

  it('should enforce type safety for headers', () => {
    // Valid paths
    headersSchema.toTemplate('userId');
    headersSchema.toTemplate('session.id');
    headersSchema.toTemplate('roles[0]');

    // @ts-expect-error - invalid path
    headersSchema.toTemplate('invalid');
    // @ts-expect-error - invalid nested path
    headersSchema.toTemplate('session.invalid');

    expect(true).toBe(true);
  });
});
