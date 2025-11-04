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
const config = {
  baseSettings: {{BASE_SETTINGS}},
  aiChatSettings: {{AI_CHAT_SETTINGS}}
};

const sidebarChat = Inkeep.SidebarChat("#ikp-sidebar-chat-target", config);
\`\`\``;
