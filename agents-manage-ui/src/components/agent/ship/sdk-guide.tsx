import { useParams } from 'next/navigation';
import { Streamdown } from 'streamdown';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export function SdkGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const apiUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  const { tenantId, projectId, agentId } = useParams();

  return (
    <div className="space-y-4">
      <p>
        Use the Vercel AI SDK's useChat hook to build React chat interfaces that stream responses
        from your agent.
      </p>
      <Streamdown>
        {`Install the package:

\`\`\`bash
npm install ai @ai-sdk/react
\`\`\`

Example Next.js implementation using Vercel AI SDK:

\`\`\`tsx
"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function Page() {
  const { messages, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "${apiUrl}",
      headers: {
        "x-inkeep-tenant-id": "${tenantId}",
        "x-inkeep-project-id": "${projectId}",
        "x-inkeep-agent-id": "${agentId}",
      },
    }),
  });
  const [input, setInput] = useState("");

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map((message) => (
          <div key={message.id} className="border rounded p-3">
            <div className="font-semibold mb-2">
              {message.role === "user" ? "👤 User" : "🤖 Assistant"}
            </div>

            <div className="space-y-2">
              {message.parts.map((part, partIndex) => {
                const partKey = \`\${message.id}-\${part.type}-\${partIndex}\`;

                if (part.type === "text") {
                  return (
                    <div key={partKey} className="whitespace-pre-wrap">
                      {part.text}
                    </div>
                  );
                }
                
                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Send
        </button>
      </form>
    </div>
  );
}
\`\`\`
`}
      </Streamdown>
    </div>
  );
}
