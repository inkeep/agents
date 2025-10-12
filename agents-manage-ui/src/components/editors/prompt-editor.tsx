'use client';

import dynamic from 'next/dynamic';
import { type ComponentProps, type FC, useCallback, useId, useMemo, useState } from 'react';
import type * as monaco from 'monaco-editor';

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

  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editor) => {
      setEditor(editor);
    },
    []
  );

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
