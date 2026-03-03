export const jsSidebarChatTemplate = `Add the sidebar chat component to your application:

Define an element in your page that will be the "container" for the sidebar chat. Also add a button that will trigger the sidebar chat and give it the data attribute \`data-inkeep-sidebar-chat-trigger\`.

\`\`\`html
<div style="display: flex; flex-direction: row; height: 100vh; max-height: 100vh; padding: 0; margin: 0; overflow: hidden;">
  <div style="display: flex; flex-direction: column; height: 100vh; max-height: 100vh; padding: 0; margin: 0; overflow-y: auto; flex: 1;">
    <!-- your app content here -->
    <button data-inkeep-sidebar-chat-trigger="">Toggle Sidebar Chat</button>
  </div>
  <!-- the sidebar chat will be inserted into this div -->
  <div id="ikp-sidebar-chat-target"></div>
</div>
\`\`\`

Insert the SidebarChat widget by using the \`Inkeep.SidebarChat()\` function.

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
  const sidebarChat = Inkeep.SidebarChat("#ikp-sidebar-chat-target", config);
}

initChat();
\`\`\``;
