'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { type FC, useEffect } from 'react';
import { CopilotProvider } from '@/contexts/copilot';
import { useAgentActions, useAgentStore } from '@/features/agent/state/use-agent-store';
import { useInitialCollapsedSidebar } from '@/hooks/use-initial-collapsed-sidebar';
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

const Layout: FC<LayoutProps<'/[tenantId]/projects/[projectId]/agents/[agentId]'>> = ({
  children,
}) => {
  const { setVariableSuggestions } = useAgentActions();
  const contextConfig = useAgentStore((state) => state.metadata.contextConfig);

  useInitialCollapsedSidebar();

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
  }, [contextConfig]);

  return (
    <ReactFlowProvider>
      <CopilotProvider>{children}</CopilotProvider>
    </ReactFlowProvider>
  );
};

export default Layout;
