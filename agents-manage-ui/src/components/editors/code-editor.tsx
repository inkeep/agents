'use client';

import { type ComponentProps, type FC, useId, useMemo } from 'react';
import { MonacoEditor } from './monaco-editor';

interface CodeEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.${string}`;
}

export const CodeEditor: FC<CodeEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.js` as `${string}.${string}`, [id]);

  return <MonacoEditor uri={uri} {...props} />;
};
