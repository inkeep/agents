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
const APP_ID = "{{APP_ID}}";
const AGENT_URL = "{{AGENT_URL}}";
const SESSION_URL = "{{SESSION_URL}}";

async function getSessionToken() {
  const response = await fetch(SESSION_URL, { method: "POST" });
  const data = await response.json();
  return data.token;
}

async function initChat() {
  const token = await getSessionToken();
  const config = {
    baseSettings: {{BASE_SETTINGS}},
    aiChatSettings: {
      agentUrl: AGENT_URL,
      apiKey: token,
      headers: {
        "X-Inkeep-App-Id": APP_ID,
{{EMIT_OPERATIONS}}
      },
{{EXTRA_AI_CHAT_SETTINGS}}
    }
  };
  const embeddedChat = Inkeep.EmbeddedChat("#ikp-embedded-chat-target", config);
}

initChat();
\`\`\``;
