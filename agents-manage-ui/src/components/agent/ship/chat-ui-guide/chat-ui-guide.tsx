import type { InkeepAIChatSettings, InkeepBaseSettings } from '@inkeep/agents-ui/types';
import { CodeIcon, EyeIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { DocsLink, Header } from '../guide-header';
import { ChatUICode } from './chat-ui-code';
import { ChatUIPreview } from './chat-ui-preview';
import { ChatUIComponent, ChatUIPreviewForm } from './chat-ui-preview-form';

interface ChatUIProps {
  component: ChatUIComponent;
  baseSettings: InkeepBaseSettings;
  aiChatSettings: InkeepAIChatSettings;
  shouldEmitDataOperations: boolean;
}

export function ChatUIGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const agentUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  const form = useForm<Partial<ChatUIProps>>({
    defaultValues: {
      component: ChatUIComponent.EMBEDDED_CHAT,
      baseSettings: {
        primaryBrandColor: '#3784ff',
      },
      aiChatSettings: {
        agentUrl,
        aiAssistantAvatar: '',
        introMessage: 'Hi! How can I help?',
        placeholder: 'How do I get started?',
      },
      shouldEmitDataOperations: true,
    },
  });
  const allValues = form.watch();
  const component = (allValues.component ?? ChatUIComponent.EMBEDDED_CHAT) as ChatUIComponent;
  const baseSettings = allValues.baseSettings ?? { primaryBrandColor: '#3784ff' };
  const aiChatSettings = allValues.aiChatSettings ?? {
    agentUrl,
  };
  const shouldEmitDataOperations = allValues.shouldEmitDataOperations ?? true;

  return (
    <Tabs defaultValue="preview">
      <Header.Container>
        <Header.Title title="Chat UI" />
        <div className="flex items-center gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="preview" className="py-0.5 px-2.5 gap-2">
              <EyeIcon className="size-4" />
              <span>Preview</span>
            </TabsTrigger>

            <TabsTrigger value="code" className="py-0.5 px-2.5 gap-2">
              <CodeIcon className="size-4" />
              <span>Code</span>
            </TabsTrigger>
          </TabsList>
          {/* todo should this link change based on the react vs js toggle? */}
          <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/react/chat-button`} />
        </div>
      </Header.Container>
      <TabsContent value="preview">
        <div className="flex flex-row gap-12 w-full">
          <ChatUIPreviewForm form={form} />
          <div className="flex-3/5 w-full h-[500px]">
            <ChatUIPreview
              component={component}
              baseSettings={baseSettings}
              aiChatSettings={aiChatSettings}
              shouldEmitDataOperations={shouldEmitDataOperations}
              // force re-render when shouldEmitDataOperations changes otherwise the headers will not be updated
              key={shouldEmitDataOperations ? 'true' : 'false'}
            />
          </div>
        </div>
      </TabsContent>
      <TabsContent value="code">
        <ChatUICode
          component={component}
          baseSettings={{ ...baseSettings }}
          aiChatSettings={{
            ...aiChatSettings,
            apiKey: 'INKEEP_AGENT_API_KEY',
            headers: { 'x-emit-operations': shouldEmitDataOperations ? 'true' : 'false' },
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
