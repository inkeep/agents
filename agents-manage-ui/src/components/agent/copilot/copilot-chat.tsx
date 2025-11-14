'use client';

import { InkeepSidebarChat } from '@inkeep/agents-ui';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { useCopilotContext } from './copilot-context';

interface CopilotChatProps {
  agentId?: string;
  projectId: string;
  tenantId: string;
}

const styleOverrides = `
.ikp-markdown-code {
  background-color: var(--ikp-color-gray-100);
  color: var(--ikp-color-gray-900);
}

[data-theme=dark] .ikp-markdown-code {
  background-color: var(--ikp-color-white-alpha-100);
  color: var(--ikp-color-white-alpha-950);
}
`;

export function CopilotChat({ agentId }: CopilotChatProps) {
  const { chatFunctionsRef, isOpen, setIsOpen } = useCopilotContext();
  const {
    PUBLIC_INKEEP_AGENTS_RUN_API_URL,
    PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET,
    PUBLIC_INKEEP_COPILOT_AGENT_ID,
    PUBLIC_INKEEP_COPILOT_PROJECT_ID,
    PUBLIC_INKEEP_COPILOT_TENANT_ID,
  } = useRuntimeConfig();

  if (
    !PUBLIC_INKEEP_COPILOT_AGENT_ID ||
    !PUBLIC_INKEEP_COPILOT_PROJECT_ID ||
    !PUBLIC_INKEEP_COPILOT_TENANT_ID
  ) {
    console.error(
      'PUBLIC_INKEEP_COPILOT_AGENT_ID, PUBLIC_INKEEP_COPILOT_PROJECT_ID, PUBLIC_INKEEP_COPILOT_TENANT_ID are not set, copilot chat will not be displayed'
    );
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
            chatFunctionsRef,
            aiAssistantAvatar: {
              light: '/assets/inkeep-icons/icon-blue.svg',
              dark: '/assets/inkeep-icons/icon-sky.svg',
            },
            agentUrl: `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`,
            headers: {
              'x-inkeep-tenant-id': PUBLIC_INKEEP_COPILOT_TENANT_ID,
              'x-inkeep-project-id': PUBLIC_INKEEP_COPILOT_PROJECT_ID,
              'x-inkeep-agent-id': PUBLIC_INKEEP_COPILOT_AGENT_ID,
              'x-emit-operations': 'true',
              Authorization: `Bearer ${PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET}`,
              // TODO we probably need to add some custom headers here to identify the agent and project we are working with but not sure what they will be called yet
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
