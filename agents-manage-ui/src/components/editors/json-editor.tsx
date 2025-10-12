'use client';

import dynamic from 'next/dynamic';
export type { JsonEditorRef } from './json-editor-base';

/**
 * This wrapper file dynamically imports the actual `JsonEditor` component
 * from './json-editor-base' using Next.js dynamic import.
 *
 * Purpose:
 * - Prevent Monaco from being loaded on the server since it access to `window` object
 * - Enable code splitting and faster initial loads
 * - Keep import paths consistent across the app
 **/
export const JsonEditor = dynamic(
  () => import('./json-editor-base').then((mod) => mod.JsonEditor),
  { ssr: false } // ensures it only loads on the client side
);
