export const jsEmbeddedChatTemplate = `Add the embedded chat component to your application:

Define an element in your page that will be the "container" for the embedded chat.

\`\`\`html
<div style="display: flex; align-items: center; justify-content: center; height: calc(100vh - 16px);">
  <div style="max-height: 600px; height: 100%;">
    <div id="ikp-embedded-chat-target"></div>
  </div>
</div>
\`\`\`

Insert the EmbeddedChat widget by using the \`Inkeep.EmbeddedChat()\` function.

\`\`\`js
const config = {
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {{AI_CHAT_SETTINGS}}
};

const embeddedChat = Inkeep.EmbeddedChat("#ikp-embedded-chat-target", config);
\`\`\``;
