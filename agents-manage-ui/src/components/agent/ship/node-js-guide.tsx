import { useParams } from 'next/navigation';
import { Streamdown } from 'streamdown';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { DocsLink, Header } from './guide-header';

export function NodeJsGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const apiUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/api/chat`;
  const { agentId } = useParams();

  return (
    <div>
      <Header.Container>
        <Header.Title title="Node.js Backend" />
        <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/chat-api`} />
      </Header.Container>
      <Streamdown>
        {`Example Next.js API route (\`app/api/chat/route.ts\`):

\`\`\`typescript
export async function POST(req: Request) {
  const { messages, conversationId } = await req.json();

  const response = await fetch('${apiUrl}', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${process.env.INKEEP_AGENT_API_KEY}\`,
      'Content-Type': 'application/json',
      'x-emit-operations': 'true',
    },
    body: JSON.stringify({
      messages,
      conversationId,
    }),
  });

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
\`\`\`

Example response (Server-Sent Events stream):

\`\`\`bash
data: {"type":"data-operation","data":{"type":"agent_initializing","details":{"sessionId":"chatds-12345678910111","agentId":"${agentId}"}}}

data: {"type":"text-start","id":"1234567891011-abcdefghi"}

data: {"type":"text-delta","id":"1234567891011-abcdefghi","delta":"I answer"}

data: {"type":"text-delta","id":"1234567891011-abcdefghi","delta":" technical questions"}

data: {"type":"text-end","id":"1234567891011-abcdefghi"}

data: [DONE]
\`\`\`
`}
      </Streamdown>
    </div>
  );
}
