'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { Editor } from '@/components/editors/editor';
import { MonacoEditor } from './monaco-editor';

interface JsonEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.json`;
}

export const JsonEditor: FC<JsonEditorProps> = ({ editorOptions, children, uri, ...props }) => {
  'use memo';
  const id = useId();

  return (
    <MonacoEditor
      editorOptions={{
        ariaLabel: 'JSON editor',
        unicodeHighlight: {
          // Disable warnings for – ’ characters
          ambiguousCharacters: false,
        },
        ...editorOptions,
      }}
      uri={uri ?? `${id}.json`}
      {...props}
    >
      <div className="absolute end-2 top-2 flex gap-2 z-1">
        {children}
        {!props.readOnly && <Editor.FormatAction disabled={!props.value?.trim()} />}
      </div>
    </MonacoEditor>
  );
};
