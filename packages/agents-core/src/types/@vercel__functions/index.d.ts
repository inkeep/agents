/**
 * Minimal type declarations for @vercel/functions.
 * agents-core uses dynamic `import('@vercel/functions')` so Vercel
 * runtime helpers are loaded lazily only in Vercel environments.
 */

declare module '@vercel/functions' {
  export function waitUntil(promise: Promise<unknown>): void;
  export function attachDatabasePool(dbPool: unknown): void;
}
