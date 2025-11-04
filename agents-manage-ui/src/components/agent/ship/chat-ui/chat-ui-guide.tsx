import type { InkeepAIChatSettings, InkeepBaseSettings } from '@inkeep/agents-ui/types';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { DocsLink } from '../docs-link';
import { ChatUICode } from './chat-ui-code';
import { ChatUIPreview } from './chat-ui-preview';
import { ChatUIComponent, ChatUIPreviewForm } from './chat-ui-preview-form';

interface ChatUIProps {
  component: ChatUIComponent;
  baseSettings: InkeepBaseSettings;
  aiChatSettings: InkeepAIChatSettings;
}

export function ChatUIGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const agentUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  const [showCode, setShowCode] = useState(false);
  const form = useForm<Partial<ChatUIProps>>({
    defaultValues: {
      component: ChatUIComponent.EMBEDDED_CHAT,
      baseSettings: {
        primaryBrandColor: '#3784ff',
      },
      aiChatSettings: {
        agentUrl: 'http://localhost:3003/api/chat',
        aiAssistantAvatar: '',
        introMessage: 'Hi! How can I help?',
        placeholder: 'How do I get started?',
      },
    },
  });
  const allValues = form.watch();
  const component = (allValues.component ?? ChatUIComponent.EMBEDDED_CHAT) as ChatUIComponent;
  const baseSettings = allValues.baseSettings ?? { primaryBrandColor: '#3784ff' };
  const aiChatSettings = allValues.aiChatSettings ?? {
    agentUrl,
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-md font-medium">Chat UI</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCode(!showCode)}>
            {showCode ? <EyeIcon className="size-4" /> : <CodeIcon className="size-4" />}
            {showCode ? 'View preview' : 'View code'}
          </Button>
          <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/react/chat-button`} />
        </div>
      </div>
      {showCode ? (
        <ChatUICode
          component={component}
          baseSettings={baseSettings}
          aiChatSettings={aiChatSettings}
        />
      ) : (
        <div className="flex flex-row gap-12 w-full">
          <ChatUIPreviewForm form={form} />
          <div className="flex-1 h-[500px]">
            <ChatUIPreview
              component={component}
              baseSettings={baseSettings}
              aiChatSettings={aiChatSettings}
            />
          </div>
        </div>
      )}
    </div>
  );
}
