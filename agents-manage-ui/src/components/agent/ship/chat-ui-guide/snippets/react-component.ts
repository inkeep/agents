export const reactComponentTemplate = `import { {{COMPONENT_NAME}}, type {{COMPONENT_NAME}}Props } from "@inkeep/agents-ui";

const props: {{COMPONENT_NAME}}Props = {
  appId: "{{APP_ID}}",
  baseUrl: "{{BASE_URL}}",
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {
{{EXTRA_AI_CHAT_SETTINGS}}
  },
};

export const InkeepWidget = () => {
  return <{{COMPONENT_NAME}} {...props} />;
};`;
