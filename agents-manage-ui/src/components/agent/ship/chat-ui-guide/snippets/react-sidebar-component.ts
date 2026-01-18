export const reactSidebarComponentTemplate = `import { {{COMPONENT_NAME}}, type {{COMPONENT_NAME}}Props } from "@inkeep/agents-ui";

const props: {{COMPONENT_NAME}}Props = {
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {{AI_CHAT_SETTINGS}},
};

export const InkeepWidget = () => {
  return (
    <>
      <button data-inkeep-sidebar-chat-trigger>
        Toggle sidebar
      </button>
      <{{COMPONENT_NAME}} {...props} />
    </>
  );
};`;
