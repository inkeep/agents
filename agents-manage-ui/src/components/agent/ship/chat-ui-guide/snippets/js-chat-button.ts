export const jsChatButtonTemplate = `Add the chat button component to your application:

\`\`\`js
const config = {
  appId: "{{APP_ID}}",
  baseUrl: "{{BASE_URL}}",
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {
{{EXTRA_AI_CHAT_SETTINGS}}
  }
};

const chatButton = Inkeep.ChatButton(config);
\`\`\``;
