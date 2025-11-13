'use client';

import type { IDisposable } from 'monaco-editor';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import { getContextSuggestions } from '@/lib/context-suggestions';

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

export default function Layout({ children }: LayoutProps<'/[tenantId]'>) {
  const { resolvedTheme } = useTheme();
  const { setMonaco, setVariableSuggestions, setMonacoTheme } = useMonacoActions();
  const contextConfig = useAgentStore((state) => state.metadata.contextConfig);
  const isDark = resolvedTheme === 'dark';

  // Generate suggestions from context config
  useEffect(() => {
    const contextVariables = tryJsonParse(contextConfig.contextVariables);
    const headersSchema = tryJsonParse(contextConfig.headersSchema);
    const variables = getContextSuggestions({
      headersSchema,
      // @ts-expect-error -- todo: improve type
      contextVariables,
    });
    setVariableSuggestions(variables);
  }, [contextConfig, setVariableSuggestions]);

  useEffect(() => {
    let disposables: IDisposable[] = [];
    setMonaco().then(($disposables) => {
      disposables = $disposables;
    });

    return () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [setMonaco]);

  useEffect(() => {
    setMonacoTheme(isDark);
  }, [isDark, setMonacoTheme]);

  return children;
}
