'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { Editor } from '@/components/editors/editor';
import { MonacoEditor } from './monaco-editor';

interface CodeEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.${'js' | 'jsx' | 'ts' | 'tsx'}`;
}

export const CodeEditor: FC<CodeEditorProps> = ({
  placeholder = 'Enter code...',
  editorOptions,
  children,
  uri,
  ...props
}) => {
  'use memo';
  const id = useId();

  return (
    <MonacoEditor
      placeholder={placeholder}
      editorOptions={{
        ariaLabel: 'Code editor',
        ...editorOptions,
      }}
      uri={uri ?? `${id}.jsx`}
      {...props}
    >
      <div className="absolute end-2 top-2 flex gap-2 z-1">
        {children}

        {!props.readOnly && <Editor.FormatAction disabled={!props.value?.trim()} />}
      </div>
    </MonacoEditor>
  );
};
