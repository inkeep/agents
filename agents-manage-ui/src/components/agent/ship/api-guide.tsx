import { Streamdown } from 'streamdown';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { DocsLink, Header } from './guide-header';

export function ApiGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const apiUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  return (
    <div>
      <Header.Container>
        <Header.Title title="REST API" />
        <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/chat-api`} />
      </Header.Container>
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
