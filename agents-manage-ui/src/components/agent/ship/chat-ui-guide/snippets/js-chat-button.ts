export const jsChatButtonTemplate = `Add the chat button component to your application:

\`\`\`js
const APP_ID = "{{APP_ID}}";
const AGENT_URL = "{{AGENT_URL}}";
const SESSION_URL = "{{SESSION_URL}}";

async function getSessionToken() {
  const response = await fetch(SESSION_URL, { method: "POST" });
  if (!response.ok) {
    throw new Error("Session token request failed: " + response.status);
  }
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
  const chatButton = Inkeep.ChatButton(config);
}

initChat();
\`\`\``;
