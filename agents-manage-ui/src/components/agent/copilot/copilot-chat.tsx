'use client';

import { InkeepSidebarChat } from '@inkeep/agents-ui';
import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { INKEEP_BRAND_COLOR } from '@/constants/theme';
import { useCopilotContext } from '@/contexts/copilot';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useCopilotToken } from '@/hooks/use-copilot-token';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { sentry } from '@/lib/sentry';
import { css } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-utils';
import { IkpTool } from './message-parts/message';

interface CopilotChatProps {
  agentId?: string;
  projectId: string;
  tenantId: string;
  refreshAgentGraph: (options?: { fetchTools?: boolean }) => Promise<void>;
}

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

export function CopilotChat({ agentId, tenantId, projectId, refreshAgentGraph }: CopilotChatProps) {
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

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onFinish: () => {
      refreshAgentGraph({ fetchTools: true });
    },
  });

  useEffect(() => {
    return () => setIsStreaming(false);
  }, [setIsStreaming]);

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
  }, [conversationId, refreshAgentGraph]);

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
  }, [tokenError, isLoadingToken, isOpen, setIsOpen, refreshToken]);

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
            components: {
              IkpTool: (props: any) =>
                IkpTool({
                  ...props,
                  copilotAgentId: PUBLIC_INKEEP_COPILOT_AGENT_ID,
                  copilotProjectId: PUBLIC_INKEEP_COPILOT_PROJECT_ID,
                  copilotTenantId: PUBLIC_INKEEP_COPILOT_TENANT_ID,
                  apiUrl: PUBLIC_INKEEP_AGENTS_API_URL,
                  targetTenantId: tenantId,
                  targetProjectId: projectId,
                  onOAuthLogin: handleOAuthLogin,
                  refreshAgentGraph: refreshAgentGraph,
                  cookieHeader: cookieHeader,
                  copilotToken: copilotToken,
                }),
            },
            conversationId,
            chatFunctionsRef,
            aiAssistantAvatar: {
              light: '/assets/inkeep-icons/icon-blue.svg',
              dark: '/assets/inkeep-icons/icon-sky.svg',
            },
            agentUrl: `${PUBLIC_INKEEP_AGENTS_API_URL}/run/api/chat`,
            headers: {
              'x-emit-operations': 'true',
              Authorization: `Bearer ${copilotToken}`,
              'x-inkeep-tenant-id': PUBLIC_INKEEP_COPILOT_TENANT_ID || '',
              'x-inkeep-project-id': PUBLIC_INKEEP_COPILOT_PROJECT_ID || '',
              'x-inkeep-agent-id': PUBLIC_INKEEP_COPILOT_AGENT_ID || '',
              // Target is the agent that the copilot is building or editing.
              'x-target-tenant-id': tenantId,
              'x-target-project-id': projectId,
              ...(agentId ? { 'x-target-agent-id': agentId } : {}),
              // conversationId and messageId from the 'try now' improve with AI button.
              ...(dynamicHeaders?.conversationId
                ? { 'x-inkeep-from-conversation-id': dynamicHeaders.conversationId }
                : {}),
              ...(dynamicHeaders?.messageId
                ? { 'x-inkeep-from-message-id': dynamicHeaders.messageId }
                : {}),
              // Forward cookies from the server action using custom header (Cookie is a forbidden header in browsers)
              ...(cookieHeader ? { 'x-forwarded-cookie': cookieHeader } : {}),
            },
            exampleQuestionsLabel: agentId ? undefined : 'Try one of these examples:',
            exampleQuestions: agentId
              ? undefined
              : [
                  {
                    label: 'Build a weather agent',
                    value: 'Help me build an agent that can tell me the weather in any city.',
                  },
                  {
                    label: 'Build a recipe agent',
                    value: 'Help me build an agent that can help me find recipes.',
                  },
                  {
                    label: 'Build a travel agent',
                    value: 'Help me build an agent that can help me plan my travel.',
                  },
                ],
            introMessage: agentId
              ? `Hi! What would you like to change about \`${agentId}\`?`
              : 'Hi! What would you like to build?',
          }}
        />
      </div>
    </div>
  );
}
