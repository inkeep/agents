import { Streamdown } from 'streamdown';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
export function ApiGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const apiUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  return (
    <div>
      <Streamdown>
        {`Example cURL request:

\`\`\`bash
curl -N \\
  -X POST "${apiUrl}" \\
  -H "Authorization: Bearer $INKEEP_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "x-emit-operations: true" \\
  -d '{
    "messages": [
      { "role": "user", "content": "What can you do?" }
    ],
    "conversationId": "chat-1234"
  }'
\`\`\`
`}
      </Streamdown>
    </div>
  );
}
