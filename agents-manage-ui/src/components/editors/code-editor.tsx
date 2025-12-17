'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { MonacoEditor } from './monaco-editor';

interface CodeEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.${'js' | 'jsx' | 'ts' | 'tsx'}`;
}

export const CodeEditor: FC<CodeEditorProps> = ({
  uri,
  placeholder = 'Enter code...',
  editorOptions,
  ...props
}) => {
  const id = useId();
  uri ??= `${id}.jsx`;

  return (
    <MonacoEditor
      uri={uri}
      placeholder={placeholder}
      editorOptions={{
        ariaLabel: 'Code editor',
        ...editorOptions,
      }}
      {...props}
    />
  );
};
