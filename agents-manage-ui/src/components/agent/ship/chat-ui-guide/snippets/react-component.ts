export const reactComponentTemplate = `import { useState, useEffect } from "react";
import { {{COMPONENT_NAME}}, type {{COMPONENT_NAME}}Props } from "@inkeep/agents-ui";

const APP_ID = "{{APP_ID}}";
const AGENT_URL = "{{AGENT_URL}}";
const SESSION_URL = "{{SESSION_URL}}";
const CHALLENGE_URL = "{{CHALLENGE_URL}}";

async function getSessionToken() {
  const response = await fetch(SESSION_URL, {
    method: "POST",
    headers: await getPowHeaders(),
  });
  if (!response.ok) {
    throw new Error("Session token request failed: " + response.status);
  }
  const data = await response.json();
  return data.token;
}

// Proof-of-Work: fetch a challenge, solve it, and return the header.
// The server may require this for web_client apps when PoW is enabled.
async function getPowHeaders(): Promise<Record<string, string>> {
  const res = await fetch(CHALLENGE_URL);
  if (res.status === 404) return {}; // PoW not enabled
  if (!res.ok) throw new Error("Failed to fetch PoW challenge");
  const challenge = await res.json();
  const { solveChallenge } = await import("altcha-lib");
  const { promise } = solveChallenge(
    challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber
  );
  const solution = await promise;
  const payload = btoa(JSON.stringify({
    algorithm: challenge.algorithm,
    challenge: challenge.challenge,
    number: solution?.number,
    salt: challenge.salt,
    signature: challenge.signature,
  }));
  return { "X-Inkeep-Altcha": payload };
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
