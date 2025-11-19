'use client';
import { InkeepEmbeddedChat } from '@inkeep/agents-ui';
import type { ComponentsConfig, InkeepCallbackEvent } from '@inkeep/agents-ui/types';
import { useCallback, useEffect, useRef } from 'react';
import { DynamicComponentRenderer } from '@/components/data-components/render/dynamic-component-renderer';
import type { ConversationDetail } from '@/components/traces/timeline/types';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import type { DataComponent } from '@/lib/api/data-components';
import { generateId } from '@/lib/utils/id-utils';
import { IkpMessage as IkpMessageComponent } from './ikp-message';

interface ChatWidgetProps {
  agentId?: string;
  projectId: string;
  tenantId: string;
  conversationId: string;
  setConversationId: (conversationId: string) => void;
  startPolling: () => void;
  stopPolling: () => void;
  customHeaders?: Record<string, string>;
  chatActivities: ConversationDetail | null;
  dataComponentLookup?: Record<string, DataComponent>;
  ref?: string;
}

const styleOverrides = `
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

export function ChatWidget({
  agentId,
  projectId,
  tenantId,
  conversationId,
  setConversationId,
  startPolling,
  stopPolling,
  customHeaders = {},
  chatActivities,
  dataComponentLookup = {},
  ref,
}: ChatWidgetProps) {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL, PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET } =
    useRuntimeConfig();
  const stopPollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReceivedAssistantMessageRef = useRef(false);
  const POLLING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // Helper function to reset the stop polling timeout
  const resetStopPollingTimeout = useCallback(() => {
    // Clear any existing timeout
    if (stopPollingTimeoutRef.current) {
      clearTimeout(stopPollingTimeoutRef.current);
      stopPollingTimeoutRef.current = null;
    }

    // Set a new timeout for 5 minutes
    stopPollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      stopPollingTimeoutRef.current = null;
    }, POLLING_TIMEOUT_MS);
  }, [stopPolling]);

  // Reset timeout when new activities come in AFTER assistant message received
  // biome-ignore lint/correctness/useExhaustiveDependencies: activities length is intentionally tracked to reset timeout on new activities
  useEffect(() => {
    // Only reset timeout if we've already received the assistant message and new activities were added
    if (hasReceivedAssistantMessageRef.current) {
      resetStopPollingTimeout();
    }
  }, [chatActivities?.activities?.length, resetStopPollingTimeout]);

  useEffect(() => {
    return () => {
      if (stopPollingTimeoutRef.current) {
        clearTimeout(stopPollingTimeoutRef.current);
        stopPollingTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-row gap-4">
      <div className="flex-1 min-w-0 h-full">
        <InkeepEmbeddedChat
          baseSettings={{
            onEvent: async (event: InkeepCallbackEvent) => {
              if (event.eventName === 'assistant_message_received') {
                // Mark that we've received the assistant message
                hasReceivedAssistantMessageRef.current = true;
                // Reset the timeout to 5 minutes after receiving an assistant message
                resetStopPollingTimeout();
              }
              if (event.eventName === 'user_message_submitted') {
                // Reset the flag
                hasReceivedAssistantMessageRef.current = false;
                // Cancel any pending stop polling timeout since we need to keep polling
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                startPolling();
              }
              if (event.eventName === 'chat_clear_button_clicked') {
                // Reset the flag
                hasReceivedAssistantMessageRef.current = false;
                // Cancel any pending stop polling timeout
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                stopPolling();
                setConversationId(generateId());
              }
            },
            primaryBrandColor: '#3784ff',
            colorMode: {
              sync: {
                target: document.documentElement,
                attributes: ['class'],
                isDarkMode: (attributes: Record<string, string | null>) =>
                  !!attributes?.class?.includes('dark'),
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
            aiAssistantAvatar: {
              light: '/assets/inkeep-icons/icon-blue.svg',
              dark: '/assets/inkeep-icons/icon-sky.svg',
            },
            conversationId,
            agentUrl:
              agentId && ref
                ? `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat?ref=${encodeURIComponent(ref)}`
                : agentId
                  ? `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`
                  : undefined,
            headers: {
              'x-inkeep-tenant-id': tenantId,
              'x-inkeep-project-id': projectId,
              'x-inkeep-agent-id': agentId || '',
              'x-emit-operations': 'true',
              Authorization: `Bearer ${PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET}`,
              ...customHeaders,
            },

            components: new Proxy(
              {},
              {
                get: (_, componentName) => {
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
    </div>
  );
}

// using the built in IkpMessage component from agents-ui but leaving this here for reference / testing
const _IkpMessage: ComponentsConfig<Record<string, unknown>>['IkpMessage'] = (props) => {
  const { message, renderMarkdown, renderComponent } = props;

  const lastPart = message.parts[message.parts.length - 1];
  const isStreaming = !(
    lastPart?.type === 'data-operation' && lastPart?.data?.type === 'completion'
  );

  // Use our new IkpMessage component
  return (
    <div>
      <IkpMessageComponent
        message={message as any}
        isStreaming={isStreaming}
        renderMarkdown={renderMarkdown}
        renderComponent={renderComponent}
      />
    </div>
  );
};
