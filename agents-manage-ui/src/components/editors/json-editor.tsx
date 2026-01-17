'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { MonacoEditor } from './monaco-editor';

interface JsonEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.json`;
}

export const JsonEditor: FC<JsonEditorProps> = ({ uri, editorOptions, ...props }) => {
  const id = useId();
  return (
    <MonacoEditor
      uri={uri ?? `${id}.json`}
      editorOptions={{
        ariaLabel: 'JSON editor',
        ...editorOptions,
      }}
      {...props}
    />
  );
};
