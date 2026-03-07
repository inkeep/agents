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
const CHALLENGE_URL = "{{CHALLENGE_URL}}";

// Proof-of-Work: fetch a challenge, solve it, and return the header.
// The server may require this for web_client apps when PoW is enabled.
// Requires: <script src="https://cdn.jsdelivr.net/npm/altcha-lib/dist/altcha.umd.js"></script>
async function getPowHeaders() {
  const res = await fetch(CHALLENGE_URL);
  if (res.status === 404) return {}; // PoW not enabled
  if (!res.ok) throw new Error("Failed to fetch PoW challenge");
  const challenge = await res.json();
  const { promise } = altcha.solveChallenge(
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
