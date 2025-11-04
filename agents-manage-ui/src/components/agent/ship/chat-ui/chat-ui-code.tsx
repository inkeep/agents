import type { InkeepAIChatSettings, InkeepBaseSettings } from '@inkeep/agents-ui/types';
import { TabsContent } from '@radix-ui/react-tabs';
import { Streamdown } from 'streamdown';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  aiChatSettings: InkeepAIChatSettings;
}

const replacePlaceholders = (template: string, replacements: Record<string, string>): string => {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
};

const generateReactCode = (
  component: ChatUIComponent,
  componentName: string,
  baseSettingsJson: string,
  aiChatSettingsJson: string
): string => {
  const componentTemplate =
    component === ChatUIComponent.SIDEBAR_CHAT
      ? reactSidebarComponentTemplate
      : reactComponentTemplate;

  const componentCode = replacePlaceholders(componentTemplate, {
    COMPONENT_NAME: componentName,
    BASE_SETTINGS: baseSettingsJson,
    AI_CHAT_SETTINGS: aiChatSettingsJson,
  });

  return `${reactInstallSnippet}\n\nAdd the component to your application:\n\`\`\`tsx\n${componentCode}\n\`\`\``;
};

const generateJavaScriptCode = (
  component: ChatUIComponent,
  baseSettingsJson: string,
  aiChatSettingsJson: string
): string => {
  const componentTemplates: Record<ChatUIComponent, string> = {
    [ChatUIComponent.CHAT_BUTTON]: jsChatButtonTemplate,
    [ChatUIComponent.SIDEBAR_CHAT]: jsSidebarChatTemplate,
    [ChatUIComponent.EMBEDDED_CHAT]: jsEmbeddedChatTemplate,
  };

  const componentCode = replacePlaceholders(componentTemplates[component], {
    BASE_SETTINGS: baseSettingsJson,
    AI_CHAT_SETTINGS: aiChatSettingsJson,
  });

  return `${jsScriptTagSnippet}\n\n${componentCode}`;
};

export const ChatUICode = ({ component, baseSettings, aiChatSettings }: ChatUICodeProps) => {
  const componentMap: Record<ChatUIComponent, string> = {
    [ChatUIComponent.EMBEDDED_CHAT]: 'InkeepEmbeddedChat',
    [ChatUIComponent.CHAT_BUTTON]: 'InkeepChatButton',
    [ChatUIComponent.SIDEBAR_CHAT]: 'InkeepSidebarChat',
  };
  const componentName = componentMap[component];

  const indentJson = (json: string, spaces: number): string => {
    const indent = ' '.repeat(spaces);
    return json
      .split('\n')
      .map((line, index) => (index === 0 ? line : `${indent}${line}`))
      .join('\n');
  };

  const baseSettingsJson = indentJson(JSON.stringify(baseSettings, null, 2), 2);
  const aiChatSettingsJson = indentJson(JSON.stringify(aiChatSettings, null, 2), 2);

  const reactCode = generateReactCode(
    component,
    componentName,
    baseSettingsJson,
    aiChatSettingsJson
  );
  const javascriptCode = generateJavaScriptCode(component, baseSettingsJson, aiChatSettingsJson);

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
