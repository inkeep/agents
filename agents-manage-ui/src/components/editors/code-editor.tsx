'use client';

import { type ComponentProps, type FC, useId, useMemo } from 'react';
import { MonacoEditor } from './monaco-editor';

interface CodeEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.${string}`;
}

export const CodeEditor: FC<CodeEditorProps> = ({
  uri,
  placeholder = 'Enter code...',
  ...props
}) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.javascript` as `${string}.${string}`, [id]);

  return <MonacoEditor uri={uri} placeholder={placeholder} {...props} />;
};
