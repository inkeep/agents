export const reactComponentTemplate = `import { {{COMPONENT_NAME}}, type {{COMPONENT_NAME}}Props } from "@inkeep/agents-ui";

const props: {{COMPONENT_NAME}}Props = {
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {{AI_CHAT_SETTINGS}},
};

export const InkeepWidget = () => {
  return <{{COMPONENT_NAME}} {...props} />;
};`;
