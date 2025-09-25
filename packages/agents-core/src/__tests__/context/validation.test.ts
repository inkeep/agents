import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { contextConfig, fetchDefinition, requestContextSchema } from '../../context/ContextConfig';
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
    name: 'Test',
    requestContextSchema: z.object({ token: z.string() }),
    contextVariables: { user: userFetcher },
  });

  it('should return template strings for valid paths', () => {
    expect(config.toTemplate('requestContext')).toBe('{{requestContext}}');
    expect(config.toTemplate('requestContext.token')).toBe('{{requestContext.token}}');
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
    config.toTemplate('requestContext.token');

    // @ts-expect-error - invalid path should cause type error
    config.toTemplate('user.invalid');
    // @ts-expect-error - invalid nested path should cause type error
    config.toTemplate('user.profile.invalid');

    expect(true).toBe(true);
  });
});

describe('requestContextSchema.toTemplate', () => {
  const schema = z.object({
    userId: z.string(),
    session: z.object({
      id: z.string(),
      expires: z.number(),
    }),
    roles: z.array(z.string()),
  });

  const context = requestContextSchema({ schema });

  it('should return template strings for request context paths', () => {
    expect(context.toTemplate('userId')).toBe('{{requestContext.userId}}');
    expect(context.toTemplate('session')).toBe('{{requestContext.session}}');
    expect(context.toTemplate('session.id')).toBe('{{requestContext.session.id}}');
    expect(context.toTemplate('session.expires')).toBe('{{requestContext.session.expires}}');
    expect(context.toTemplate('roles[0]')).toBe('{{requestContext.roles[0]}}');
    expect(context.toTemplate('roles[*]')).toBe('{{requestContext.roles[*]}}');
  });

  it('should enforce type safety for request context', () => {
    // Valid paths
    context.toTemplate('userId');
    context.toTemplate('session.id');
    context.toTemplate('roles[0]');

    // @ts-expect-error - invalid path
    context.toTemplate('invalid');
    // @ts-expect-error - invalid nested path
    context.toTemplate('session.invalid');

    expect(true).toBe(true);
  });
});
