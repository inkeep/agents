/**
 * Minimal type declarations for @vercel/functions.
 * The actual package is a dependency of agents-api; agents-core uses
 * dynamic `import('@vercel/functions')` that resolves at runtime from
 * the host application's node_modules.
 */

declare module '@vercel/functions' {
  export function waitUntil(promise: Promise<unknown>): void;
}
