'use client';
import { InkeepEmbeddedChat } from '@inkeep/agents-ui';
import { type Dispatch, useEffect, useRef, useState } from 'react';
import { DynamicComponentRenderer } from '@/components/dynamic-component-renderer';
import type { ConversationDetail } from '@/components/traces/timeline/types';
import { INKEEP_BRAND_COLOR } from '@/constants/theme';
import { useCopilotContext } from '@/contexts/copilot';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useTempApiKey } from '@/hooks/use-temp-api-key';
import type { DataComponent } from '@/lib/api/data-components';
import { css } from '@/lib/utils';
import { FeedbackDialog } from './feedback-dialog';

interface ChatWidgetProps {
  agentId?: string;
  projectId: string;
  tenantId: string;
  conversationId: string;
  resetPlaygroundConversationId: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  customHeaders?: Record<string, string>;
  chatActivities: ConversationDetail | null;
  dataComponentLookup?: Record<string, DataComponent>;
  setShowTraces: Dispatch<boolean>;
  hasHeadersError: boolean;
}

const styleOverrides = css`
.ikp-ai-chat-wrapper {
  height: 100%;
  max-height: unset;
  box-shadow: none;
}

.ikp-ai-chat-message-wrapper {
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.ikp-markdown-code {
  background-color: var(--ikp-color-gray-100);
  color: var(--ikp-color-gray-900);
}

[data-theme=dark] .ikp-markdown-code {
  background-color: var(--ikp-color-white-alpha-100);
  color: var(--ikp-color-white-alpha-950);
}
`;

const styleHeadersError = css`
.ikp-ai-chat-input__fieldset {
  border: 1px #ef4444 solid;
  &:after {
    content: 'Custom headers are invalid.';
    position: absolute;
    top: -30px;
    font-size: 14px;
    color: #ef4444;
    display: block;
  }
}
`;

export function ChatWidget({
  agentId,
  projectId,
  tenantId,
  conversationId,
  resetPlaygroundConversationId,
  startPolling,
  stopPolling,
  customHeaders,
  chatActivities,
  dataComponentLookup = {},
  setShowTraces,
  hasHeadersError,
}: ChatWidgetProps) {
  'use memo';

  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const { isCopilotConfigured } = useCopilotContext();
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [messageId, setMessageId] = useState<string | undefined>(undefined);
  const { apiKey: tempApiKey, isLoading: isLoadingKey } = useTempApiKey({
    tenantId,
    projectId,
    agentId: agentId || '',
    enabled: !!agentId,
  });
  const stopPollingTimeoutRef = useRef<number | null>(null);
  const hasReceivedAssistantMessageRef = useRef(false);
  const POLLING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // Helper function to reset the stop polling timeout
  function resetStopPollingTimeout() {
    // Clear any existing timeout
    if (stopPollingTimeoutRef.current) {
      clearTimeout(stopPollingTimeoutRef.current);
      stopPollingTimeoutRef.current = null;
    }

    // Set a new timeout for 5 minutes
    stopPollingTimeoutRef.current = window.setTimeout(() => {
      stopPolling();
      stopPollingTimeoutRef.current = null;
    }, POLLING_TIMEOUT_MS);
  }

  // Reset timeout when new activities come in AFTER assistant message received
  // biome-ignore lint/correctness/useExhaustiveDependencies: activities length is intentionally tracked to reset timeout on new activities
  useEffect(() => {
    // Only reset timeout if we've already received the assistant message and new activities were added
    if (hasReceivedAssistantMessageRef.current) {
      resetStopPollingTimeout();
    }
  }, [
    chatActivities?.activities?.length,
    // biome-ignore lint/correctness/useExhaustiveDependencies: false positive, variable is stable and optimized by the React Compiler
    resetStopPollingTimeout,
  ]);

  useEffect(() => {
    return () => {
      if (stopPollingTimeoutRef.current) {
        clearTimeout(stopPollingTimeoutRef.current);
        stopPollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Don't render chat until we have the API key
  if (isLoadingKey || !tempApiKey) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          {isLoadingKey ? 'Initializing playground...' : 'Failed to initialize playground'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row gap-4">
      <div className="flex-1 min-w-0 h-full">
        <InkeepEmbeddedChat
          baseSettings={{
            async onEvent(event) {
              if (event.eventName === 'assistant_message_received') {
                // Mark that we've received the assistant message
                hasReceivedAssistantMessageRef.current = true;
                // Reset the timeout to 5 minutes after receiving an assistant message
                resetStopPollingTimeout();
              } else if (event.eventName === 'user_message_submitted') {
                // Reset the flag
                hasReceivedAssistantMessageRef.current = false;
                // Cancel any pending stop polling timeout since we need to keep polling
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                startPolling();
              } else if (event.eventName === 'chat_clear_button_clicked') {
                // Reset the flag
                hasReceivedAssistantMessageRef.current = false;
                // Cancel any pending stop polling timeout
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                stopPolling();
                resetPlaygroundConversationId();
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
                { key: 'custom-styles', type: 'style', value: styleOverrides },
                ...(hasHeadersError
                  ? [{ key: 'chat-input-error', type: 'style' as const, value: styleHeadersError }]
                  : []),
              ],
              primaryColors: {
                textColorOnPrimary: '#ffffff',
              },
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
            aiAssistantAvatar: {
              light: '/assets/inkeep-icons/icon-blue.svg',
              dark: '/assets/inkeep-icons/icon-sky.svg',
            },
            isViewOnly: hasHeadersError,
            conversationId,
            agentUrl: agentId ? `${PUBLIC_INKEEP_AGENTS_API_URL}/run/api/chat` : undefined,
            headers: {
              'x-inkeep-tenant-id': tenantId,
              'x-inkeep-project-id': projectId,
              'x-inkeep-agent-id': agentId || '',
              'x-emit-operations': 'true',
              Authorization: `Bearer ${tempApiKey}`,
              ...customHeaders,
            },
            messageActions: isCopilotConfigured
              ? [
                  {
                    label: 'Improve with AI',
                    icon: { builtIn: 'LuSparkles' },
                    action: {
                      type: 'invoke_message_callback',
                      callback({ messageId }) {
                        setMessageId(messageId);
                        setIsFeedbackDialogOpen(true);
                      },
                    },
                  },
                ]
              : undefined,
            components: new Proxy(
              {},
              {
                get(_, componentName) {
                  const matchingComponent = Object.values(dataComponentLookup).find(
                    (component) => component.name === componentName && !!component.render?.component
                  );

                  if (!matchingComponent) {
                    return undefined;
                  }

                  const Component = function Component(props: any) {
                    return (
                      <DynamicComponentRenderer
                        code={matchingComponent.render?.component || ''}
                        props={props || {}}
                      />
                    );
                  };
                  return Component;
                },
              }
            ),
            introMessage: 'Hi! How can I help?',
          }}
        />
      </div>
      {isFeedbackDialogOpen && (
        <FeedbackDialog
          isOpen={isFeedbackDialogOpen}
          onOpenChange={setIsFeedbackDialogOpen}
          conversationId={conversationId}
          messageId={messageId}
          setShowTraces={setShowTraces}
        />
      )}
    </div>
  );
}
