'use client';

import dynamic from 'next/dynamic';
import {
  type ComponentProps,
  type FC,
  useCallback,
  useId,
  useMemo,
  useState,
  useEffect,
} from 'react';
import type { IDisposable } from 'monaco-editor';
import { getContextSuggestions } from '@/lib/context-suggestions';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

/**
 * Purpose: Prevent Monaco from being loaded on the server since it access to `window` object.
 **/
export const MonacoEditor = dynamic(
  () => import('./monaco-editor').then((mod) => mod.MonacoEditor),
  { ssr: false } // ensures it only loads on the client side
);

// Reserved keys that are always valid
const RESERVED_KEYS = new Set(['$time', '$date', '$timestamp', '$now']);

function tryJsonParse(json = ''): object {
  if (!json.trim()) {
    return {};
  }
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

interface PromptEditorProps extends Omit<ComponentProps<typeof MonacoEditor>, 'uri'> {
  uri?: `${string}.plaintext`;
}

export const PromptEditor: FC<PromptEditorProps> = ({ uri, ...props }) => {
  const id = useId();
  uri ??= useMemo(() => `${id.replaceAll('_', '')}.plaintext` as `${string}.plaintext`, [id]);

  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor>();
  const [monaco, setMonaco] = useState<typeof import('monaco-editor')>();
  const contextConfig = useAgentStore((state) => state.metadata.contextConfig);

  // Generate suggestions from context config
  const suggestions = useMemo(() => {
    const contextVariables = tryJsonParse(contextConfig.contextVariables);
    const headersSchema = tryJsonParse(contextConfig.headersSchema);
    return getContextSuggestions({
      headersSchema,
      // @ts-expect-error -- todo: improve type
      contextVariables,
    });
  }, [contextConfig]);

  useEffect(() => {
    if (!monaco || !editor) {
      return;
    }

    const disposables: IDisposable[] = [
      monaco.languages.registerCompletionItemProvider('plaintext', {
        triggerCharacters: ['{'],
        provideCompletionItems(model, position) {
          return { suggestions: [] };
        },
      }),
    ];

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [editor, monaco]);

  const handleOnMount = useCallback<NonNullable<ComponentProps<typeof MonacoEditor>['onMount']>>(
    (editorInstance, monaco) => {
      setEditor(editorInstance);
      setMonaco(monaco);
    },
    []
  );

  return <MonacoEditor uri={uri} onMount={handleOnMount} {...props} />;
};
