import type { InkeepBaseSettings } from '@inkeep/agents-ui/types';
import { TabsContent } from '@radix-ui/react-tabs';
import { Streamdown } from 'streamdown';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { indentJson, replaceTemplatePlaceholders, serializeExtraSettings } from '../utils';
import { ChatUIComponent } from './chat-ui-preview-form';
import {
  jsChatButtonTemplate,
  jsEmbeddedChatTemplate,
  jsScriptTagSnippet,
  jsSidebarChatTemplate,
  reactComponentTemplate,
  reactInstallSnippet,
  reactSidebarComponentTemplate,
} from './snippets';

interface ChatUICodeProps {
  component: ChatUIComponent;
  baseSettings: InkeepBaseSettings;
  extraAiChatSettings: Record<string, unknown>;
  baseUrl: string;
}

const generateReactCode = (
  component: ChatUIComponent,
  replacements: Record<string, string>
): string => {
  const componentTemplate =
    component === ChatUIComponent.SIDEBAR_CHAT
      ? reactSidebarComponentTemplate
      : reactComponentTemplate;

  const componentCode = replaceTemplatePlaceholders(componentTemplate, replacements);

  return `${reactInstallSnippet}\n\nAdd the component to your application:\n\`\`\`tsx\n${componentCode}\n\`\`\``;
};

const generateJavaScriptCode = (
  component: ChatUIComponent,
  replacements: Record<string, string>
): string => {
  const componentTemplates: Record<ChatUIComponent, string> = {
    [ChatUIComponent.CHAT_BUTTON]: jsChatButtonTemplate,
    [ChatUIComponent.SIDEBAR_CHAT]: jsSidebarChatTemplate,
    [ChatUIComponent.EMBEDDED_CHAT]: jsEmbeddedChatTemplate,
  };

  const componentCode = replaceTemplatePlaceholders(componentTemplates[component], replacements);

  return `${jsScriptTagSnippet}\n\n${componentCode}`;
};

export const ChatUICode = ({
  component,
  baseSettings,
  extraAiChatSettings,
  baseUrl,
}: ChatUICodeProps) => {
  const componentMap: Record<ChatUIComponent, string> = {
    [ChatUIComponent.EMBEDDED_CHAT]: 'InkeepEmbeddedChat',
    [ChatUIComponent.CHAT_BUTTON]: 'InkeepChatButton',
    [ChatUIComponent.SIDEBAR_CHAT]: 'InkeepSidebarChat',
  };
  const componentName = componentMap[component];

  const baseSettingsJson = indentJson(JSON.stringify(baseSettings, null, 2), 2);
  const extraSettingsStr = serializeExtraSettings(extraAiChatSettings, 4);

  const replacements: Record<string, string> = {
    APP_ID: 'YOUR_APP_ID',
    BASE_URL: baseUrl,
    BASE_SETTINGS: baseSettingsJson,
    EXTRA_AI_CHAT_SETTINGS: extraSettingsStr,
    COMPONENT_NAME: componentName,
  };

  const reactCode = generateReactCode(component, replacements);
  const javascriptCode = generateJavaScriptCode(component, replacements);

  return (
    <div>
      <Tabs defaultValue="react">
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="react" className="py-0.5">
            React
          </TabsTrigger>
          <TabsTrigger value="js" className="py-0.5">
            Javascript
          </TabsTrigger>
        </TabsList>
        <TabsContent value="react">
          <Streamdown>{reactCode}</Streamdown>
        </TabsContent>
        <TabsContent value="js">
          <Streamdown>{javascriptCode}</Streamdown>
        </TabsContent>
      </Tabs>
    </div>
  );
};
