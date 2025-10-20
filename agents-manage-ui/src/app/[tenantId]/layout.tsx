'use client';

import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import { getContextSuggestions } from '@/lib/context-suggestions';
import type { IDisposable } from 'monaco-editor';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect } from 'react';
import { useAgentStore } from '@/features/agent/state/use-agent-store';

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

export default function Layout({ children }: { children: ReactNode }) {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignore `isDark`
  useEffect(() => {
    let disposables: IDisposable[] = [];
    setMonaco(isDark).then(($disposables) => {
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
