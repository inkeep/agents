'use client';

import { InkeepSidebarChat } from '@inkeep/agents-ui';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiToFormValues } from '@/components/agent/form/validation';
import { Button } from '@/components/ui/button';
import { INKEEP_BRAND_COLOR } from '@/constants/theme';
import { useCopilotContext } from '@/contexts/copilot';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { usePostHog } from '@/contexts/posthog';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { apiToGraph, applySelectionFromQueryState } from '@/features/agent/domain';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { useCopilotToken } from '@/hooks/use-copilot-token';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { useSidePane } from '@/hooks/use-side-pane';
import { getFullProjectAction } from '@/lib/actions/project-full';
import { projectQueryKeys } from '@/lib/query/keys/projects';
import { useMcpToolsQuery } from '@/lib/query/mcp-tools';
import { sentry } from '@/lib/sentry';
import { css } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-utils';
import { convertFullProjectToProject } from '@/lib/utils/project-converter';
import { IkpTool } from './message-parts/message';

const ANALYTICS_EXCLUDED_EVENTS = new Set(['sidebar_chat_opened', 'sidebar_chat_closed']);

const styleOverrides = css`
.ikp-markdown-code {
  background-color: var(--ikp-color-gray-100);
  color: var(--ikp-color-gray-900);
}

[data-theme=dark] .ikp-markdown-code {
  background-color: var(--ikp-color-white-alpha-100);
  color: var(--ikp-color-white-alpha-950);
}
`;

export function CopilotChat() {
  const {
    chatFunctionsRef,
    isOpen,
    setIsOpen,
    setIsStreaming,
    dynamicHeaders,
    setDynamicHeaders,
    isCopilotConfigured,
  } = useCopilotContext();
  const [conversationId, setConversationId] = useState(generateId);
  const posthog = usePostHog();
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();

  const form = useFullAgentFormContext();
  const queryClient = useQueryClient();
  const { refetch: refetchMcpTools } = useMcpToolsQuery({ skipDiscovery: true });
  const { nodeId, edgeId, setQueryState } = useSidePane();
  const { setInitial } = useAgentActions();

  // Callback function to fetch and update agent graph from copilot
  async function refreshAgentGraph(options?: { fetchTools?: boolean }) {
    try {
      const [fullProjectResult] = await Promise.all([
        getFullProjectAction(tenantId, projectId),
        options?.fetchTools ? refetchMcpTools() : Promise.resolve(null),
      ]);

      if (!fullProjectResult.success) {
        console.error('Failed to refresh agent graph:', fullProjectResult.error);
        return;
      }
      const fullProject = fullProjectResult.data;
      const updatedAgent = fullProject?.agents?.[agentId];
      // This makes current values the new default values
      form.reset(apiToFormValues(updatedAgent));

      // Deserialize agent data to nodes and edges
      const { nodes, edges } = apiToGraph(updatedAgent);
      const {
        nodes: nodesWithSelection,
        edges: edgesWithSelection,
        selectedNode,
        selectedEdge,
      } = applySelectionFromQueryState({
        nodes,
        edges,
        nodeId,
        edgeId,
      });

      // Update the store with all refreshed data
      setInitial(nodesWithSelection, edgesWithSelection);

      if (nodeId && !selectedNode) {
        setQueryState((prev) => ({
          ...prev,
          pane: 'agent',
          nodeId: null,
        }));
      }

      if (edgeId && !selectedEdge) {
        setQueryState((prev) => ({
          ...prev,
          pane: 'agent',
          edgeId: null,
        }));
      }

      // Update project data in React Query cache so components using useProjectQuery get fresh data
      const convertedProject = convertFullProjectToProject(fullProject, tenantId);
      queryClient.setQueryData(projectQueryKeys.detail(tenantId, projectId), convertedProject);
    } catch (error) {
      console.error('Failed to refresh agent graph:', error);
    }
  }

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onFinish() {
      refreshAgentGraph({ fetchTools: true });
    },
  });

  useEffect(() => {
    return () => setIsStreaming(false);
  }, []);

  useEffect(() => {
    const updateAgentGraph = (event: any) => {
      // we need to check if the conversationId is the same as the one in the event because this event is also triggered by the 'try now' chat.
      if (event.detail.type === 'tool_result' && event.detail.conversationId === conversationId) {
        refreshAgentGraph();
      }
      if (event.detail.type === 'error' && event.detail.conversationId === conversationId) {
        sentry.captureException(new Error('Copilot data operation error'), {
          extra: event.detail,
        });
      }
    };

    document.addEventListener('ikp-data-operation', updateAgentGraph);
    return () => {
      document.removeEventListener('ikp-data-operation', updateAgentGraph);
    };
  }, [
    conversationId,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    refreshAgentGraph,
  ]);

  const {
    PUBLIC_INKEEP_AGENTS_API_URL,
    PUBLIC_INKEEP_COPILOT_AGENT_ID,
    PUBLIC_INKEEP_COPILOT_PROJECT_ID,
    PUBLIC_INKEEP_COPILOT_TENANT_ID,
  } = useRuntimeConfig();

  const {
    apiKey: copilotToken,
    cookieHeader,
    isLoading: isLoadingToken,
    error: tokenError,
    retryCount,
    refresh: refreshToken,
  } = useCopilotToken();

  useEffect(() => {
    if (tokenError && !isLoadingToken && isOpen) {
      const isConfigError = tokenError.message?.includes('not configured');
      const errorMessage = isConfigError
        ? tokenError.message
        : 'Unable to connect to the Agent Editor. This may be due to a temporary network issue.';
      toast.error(errorMessage, {
        action: isConfigError ? undefined : (
          <Button
            variant="destructive-outline"
            size="sm"
            onClick={() => {
              refreshToken();
              setIsOpen(true);
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        ),
      });
      setIsOpen(false);
    }
  }, [tokenError, isLoadingToken, isOpen, refreshToken]);

  if (!isCopilotConfigured) {
    return null;
  }

  // Show loading state (including retries)
  if (isLoadingToken && isOpen) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span>{retryCount > 0 ? `Reconnecting (attempt ${retryCount}/3)...` : 'Loading...'}</span>
      </div>
    );
  }

  // Token not available (shouldn't happen if no error, but safety check)
  if (!copilotToken) {
    return null;
  }

  return (
    <div className="h-full flex flex-row gap-4">
      <div className="flex-1 min-w-0 h-full">
        <InkeepSidebarChat
          openSettings={{
            isOpen: isOpen,
            onOpenChange: setIsOpen,
          }}
          position="left"
          baseSettings={{
            async onEvent(event) {
              if (!ANALYTICS_EXCLUDED_EVENTS.has(event.eventName)) {
                posthog?.capture(event.eventName, {
                  ...event.properties,
                  source: 'copilot_chat',
                  tenantId,
                  projectId,
                  agentId,
                });
              }
              if (event.eventName === 'user_message_submitted') {
                setIsStreaming(true);
              }
              if (event.eventName === 'assistant_message_received') {
                setIsStreaming(false);
              }
              if (event.eventName === 'chat_clear_button_clicked') {
                setDynamicHeaders({});
                setConversationId(generateId());
                setIsStreaming(false);
              }
              if (event.eventName === 'chat_error') {
                sentry.captureException(new Error('Copilot chat error'), {
                  extra: { ...event.properties },
                });
              }
            },
            primaryBrandColor: INKEEP_BRAND_COLOR,
            shouldBypassCaptcha: true,
            colorMode: {
              sync: {
                target: document.documentElement,
                attributes: ['class'],
                isDarkMode: (attributes) => !!attributes?.class?.includes('dark'),
              },
            },
            theme: {
              styles: [
                {
                  key: 'custom-styles',
                  type: 'style',
                  value: styleOverrides,
                },
              ],
              colors: {
                gray: {
                  50: '#fafaf9',
                  100: '#f4f4f3',
                  200: '#eeeceb',
                  300: '#dedbd9',
                  400: '#cec7c2',
                  500: '#a9a19a',
                  600: '#75716b',
                  700: '#58534e',
                  800: '#443f3e',
                  900: '#2b2826',
                  950: '#1a1817',
                  1000: '#080706',
                },
                grayDark: {
                  950: 'oklch(0.141 0.005 285.823)',
                },
              },
            },
          }}
          aiChatSettings={{
            aiAssistantName: 'Agent Editor',
            isChatHistoryButtonVisible: false,
            components: {
              IkpTool(props) {
                return (
                  <IkpTool
                    {...props}
                    targetTenantId={tenantId}
                    targetProjectId={projectId}
                    onOAuthLogin={handleOAuthLogin}
                    refreshAgentGraph={refreshAgentGraph}
                  />
                );
              },
            },
            conversationId,
            chatFunctionsRef,
            aiAssistantAvatar: {
              light: '/assets/inkeep-icons/icon-blue.svg',
              dark: '/assets/inkeep-icons/icon-sky.svg',
            },
            baseUrl: PUBLIC_INKEEP_AGENTS_API_URL,
            headers: {
              'x-emit-operations': 'true',
              Authorization: `Bearer ${copilotToken}`,
              'x-inkeep-tenant-id': PUBLIC_INKEEP_COPILOT_TENANT_ID || '',
              'x-inkeep-project-id': PUBLIC_INKEEP_COPILOT_PROJECT_ID || '',
              'x-inkeep-agent-id': PUBLIC_INKEEP_COPILOT_AGENT_ID || '',
              // Target is the agent that the copilot is building or editing.
              'x-target-tenant-id': tenantId,
              'x-target-project-id': projectId,
              'x-target-agent-id': agentId,
              // conversationId and messageId from the 'try now' improve with AI button.
              ...(dynamicHeaders?.conversationId && {
                'x-inkeep-from-conversation-id': dynamicHeaders.conversationId,
              }),
              ...(dynamicHeaders?.messageId && {
                'x-inkeep-from-message-id': dynamicHeaders.messageId,
              }),
              // Forward cookies from the server action using custom header (Cookie is a forbidden header in browsers)
              ...(cookieHeader && { 'x-forwarded-cookie': cookieHeader }),
            },
            introMessage: `Hi! What would you like to change about \`${agentId}\`?`,
          }}
        />
      </div>
    </div>
  );
}
