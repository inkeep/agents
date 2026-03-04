export const reactComponentTemplate = `import { useState, useEffect } from "react";
import { {{COMPONENT_NAME}}, type {{COMPONENT_NAME}}Props } from "@inkeep/agents-ui";

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

export const InkeepWidget = () => {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getSessionToken().then(setToken);
  }, []);

  if (!token) return null;

  const props: {{COMPONENT_NAME}}Props = {
    baseSettings: {{BASE_SETTINGS}},
    aiChatSettings: {
      agentUrl: AGENT_URL,
      apiKey: token,
      headers: {
        "X-Inkeep-App-Id": APP_ID,
{{EMIT_OPERATIONS}}
      },
{{EXTRA_AI_CHAT_SETTINGS}}
    },
  };

  return <{{COMPONENT_NAME}} {...props} />;
};`;
