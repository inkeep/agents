'use client';
import { InkeepEmbeddedChat } from '@inkeep/cxkit-react-oss';
import type { ComponentsConfig, InkeepCallbackEvent } from '@inkeep/cxkit-react-oss/types';
import { nanoid } from 'nanoid';
import { useEffect, useRef } from 'react';
import { INKEEP_AGENTS_RUN_API_URL } from '@/lib/api/api-config';
import { IkpMessage as IkpMessageComponent } from './ikp-message';

interface ChatWidgetProps {
  graphId?: string;
  projectId: string;
  tenantId: string;
  conversationId: string;
  setConversationId: (conversationId: string) => void;
  startPolling: () => void;
  stopPolling: () => void;
  customHeaders?: Record<string, string>;
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
[data-role="user"] .ikp-ai-chat-message-header {
  display: none;
}

.ikp-ai-chat-message-header {
  margin-bottom: 16px;
}

.ikp-ai-chat-message-wrapper:not(:last-child):after {
  border-bottom-width: 0px;
}
 [data-role="user"] .ikp-ai-chat-message-name {
  display: none;
  margin-bottom: 0px;
}
.ikp-ai-chat-message-content, .ikp-ai-chat-input {
  font-size: 14px;
}
.ikp-ai-chat-message-avatar-content {
  width: 24px;
  height: 24px;
}
[data-widget-md] .ikp-ai-chat-message-avatar {
  height: 24px;
}
.ikp-ai-chat-message-name {
  background: none;
  padding-left: 0px;
  padding-right: 0px;
  margin-left: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ikp-color-gray-600);
}
.ikp-ai-chat-tagline__text {
  font-size: 13px;
}
.ikp-ai-chat-input__fieldset {
  padding: 4px;
}
.ikp-ai-chat-input__send-button {
  height: 36px;
  width: 36px;
}
.ikp-ai-chat-tagline__logo {
  display: none;
}
.ikp-ai-chat-tagline__brand-name {
  font-weight: 500;
}
.ikp-ai-chat-tagline__brand-name:before {
  content: '';
  margin-top: 1px;
  margin-left: 6px;
  margin-right: 3px;
  width: 20px;
  height: 20px;
  background: url('/assets/logo-outline.svg');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

/* Dark mode styles for chat containers */
[data-theme=dark] .ikp-sidebar-chat__close-button {
  color: var(--ikp-color-gray-50);
}
[data-theme=dark] .ikp-ai-chat-message-name {
  background: none;
}
`;

export function ChatWidget({
  graphId,
  projectId,
  tenantId,
  conversationId,
  setConversationId,
  startPolling,
  stopPolling,
  customHeaders,
}: ChatWidgetProps) {
  const stopPollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            onEvent: (event: InkeepCallbackEvent) => {
              if (event.eventName === 'assistant_message_received') {
                // Add a delay before stopping polling to allow activity data to be available
                stopPollingTimeoutRef.current = setTimeout(() => {
                  stopPolling();
                  stopPollingTimeoutRef.current = null;
                }, 5000);
              }
              if (event.eventName === 'user_message_submitted') {
                // Cancel any pending stop polling timeout since we need to keep polling
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                startPolling();
              }
              if (event.eventName === 'chat_clear_button_clicked') {
                // Cancel any pending stop polling timeout
                if (stopPollingTimeoutRef.current) {
                  clearTimeout(stopPollingTimeoutRef.current);
                  stopPollingTimeoutRef.current = null;
                }
                stopPolling();
                setConversationId(nanoid());
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
            conversationId,
            graphUrl: graphId ? `${INKEEP_AGENTS_RUN_API_URL}/api/chat` : undefined,
            headers: {
              'x-inkeep-tenant-id': tenantId,
              'x-inkeep-project-id': projectId,
              'x-inkeep-graph-id': graphId,
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET}`,
              ...customHeaders,
            },
            components: {
              IkpMessage,
            },
            introMessage: 'Hi!',
          }}
        />
      </div>
    </div>
  );
}

const IkpMessage: ComponentsConfig<Record<string, unknown>>['IkpMessage'] = (props) => {
  const { message, renderMarkdown, renderComponent } = props;

  // Check if we're still streaming - the last event should be a completion data-operation
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
