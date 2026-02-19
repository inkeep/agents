import type { MiddlewareHandler } from 'hono';

export type AuthzMeta = { resource?: string; permission?: string; description: string };

export type ProjectScopedMiddleware = MiddlewareHandler & { readonly __projectScoped: true };

const authzMeta = new WeakMap<object, AuthzMeta>();

export function getAuthzMeta(mw: unknown): AuthzMeta | undefined {
  return typeof mw === 'function' ? authzMeta.get(mw as object) : undefined;
}

export function registerAuthzMeta(mw: object, meta: AuthzMeta): void {
  authzMeta.set(mw, meta);
}
