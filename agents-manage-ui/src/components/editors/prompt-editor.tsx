'use client';

import dynamic from 'next/dynamic';
import { type ComponentProps, type FC, useId, useMemo } from 'react';

/**
 * Purpose:
 * Prevent Monaco from being loaded on the server since it access to `window` object
 **/
export const MonacoEditor = dynamic(
  () => import('./monaco-editor').then((mod) => mod.MonacoEditor),
  { ssr: false } // ensures it only loads on the client side
);

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.plaintext`;
}

export const PromptEditor: FC<PromptEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.plaintext` as `${string}.plaintext`, [id]);

  return <MonacoEditor uri={uri} {...props} />;
};
