import { InkeepChatButton, InkeepEmbeddedChat, InkeepSidebarChat } from '@inkeep/agents-ui';
import type { InkeepAIChatSettings, InkeepBaseSettings } from '@inkeep/agents-ui/types';
import { SidebarIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { ChatUIComponent } from './chat-ui-preview-form';

const styleOverrides = `
  .ikp-chat-bubble__root {
    position: absolute;
  }
  .ikp-chat-button__container {
    position: absolute;
  }
  .ikp-sidebar-chat__root {
    border-radius: 0px 9px 9px 0px;
  }
  [data-sidebar] .ikp-ai-chat-wrapper {
    border-radius: inherit;
  }
`;

export interface ChatUIPreviewProps {
  component: ChatUIComponent;
  baseSettings: InkeepBaseSettings;
  aiChatSettings: InkeepAIChatSettings;
  shouldEmitDataOperations: boolean;
}
const componentMap = {
  [ChatUIComponent.EMBEDDED_CHAT]: InkeepEmbeddedChat,
  [ChatUIComponent.CHAT_BUTTON]: InkeepChatButton,
  [ChatUIComponent.SIDEBAR_CHAT]: InkeepSidebarChat,
};

export function ChatUIPreview({
  component,
  baseSettings,
  aiChatSettings,
  shouldEmitDataOperations,
}: ChatUIPreviewProps) {
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();
  const { PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET } = useRuntimeConfig();

  const Component = componentMap[component];

  return (
    <div
      className={`relative flex flex-row gap-2 h-full w-full  ${component === ChatUIComponent.EMBEDDED_CHAT ? 'bg-background justify-center' : 'rounded-lg border bg-sidebar justify-between'}`}
    >
      {component === ChatUIComponent.SIDEBAR_CHAT && (
        <div className="p-4">
          <Button variant="outline" size="sm" data-inkeep-sidebar-chat-trigger>
            <SidebarIcon className="size-4" />
            Toggle sidebar
          </Button>
        </div>
      )}
      <div
        className={`h-full ${component === ChatUIComponent.SIDEBAR_CHAT ? 'rounded-[0_9px_9px_0]' : 'w-full'} ${component === ChatUIComponent.EMBEDDED_CHAT ? 'max-w-[500px]' : ''}`}
      >
        <Component
          shouldAutoFocusInput={false}
          openSettings={{
            defaultOpen: true,
          }}
          baseSettings={{
            ...baseSettings,
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
            },
          }}
          aiChatSettings={{
            ...aiChatSettings,
            headers: {
              'x-inkeep-tenant-id': tenantId,
              'x-inkeep-project-id': projectId,
              'x-inkeep-agent-id': agentId,
              Authorization: `Bearer ${PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET}`,
              'x-emit-operations': shouldEmitDataOperations ? 'true' : 'false',
            },
          }}
        />
      </div>
    </div>
  );
}
