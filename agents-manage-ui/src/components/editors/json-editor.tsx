'use client';

import { type ComponentProps, type FC, useId } from 'react';
import { Button } from '@/components/ui/button';
import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import { MonacoEditor } from './monaco-editor';

interface JsonEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.json`;
}

export const JsonEditor: FC<JsonEditorProps> = ({ editorOptions, children, ...props }) => {
  'use memo';
  const id = useId();
  const { getEditorByUri } = useMonacoActions();
  const uri = props.uri ?? `${id}.json`;

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
      {...props}
      uri={uri}
    >
      <div className="absolute end-2 top-2 flex gap-2 z-1">
        {children}

        {!props.readOnly && (
          <Button
            type="button"
            onClick={() => {
              const editor = getEditorByUri(uri);
              const formatAction = editor?.getAction('editor.action.formatDocument');
              formatAction?.run();
            }}
            variant="outline"
            size="sm"
            className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
            disabled={!props.value?.trim()}
          >
            Format
          </Button>
        )}
      </div>
    </MonacoEditor>
  );
};
