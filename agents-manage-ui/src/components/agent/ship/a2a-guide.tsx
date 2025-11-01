import { Streamdown } from 'streamdown';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

export function A2AGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  return (
    <div className="space-y-4">
      <p>
        The A2A (Agent-to-Agent) endpoint lets third-party agents, agent platforms, or agent
        workspaces interact with your Inkeep Agent using a standard agent protocol.
      </p>
      <Streamdown>
        {`**Endpoints:**

**Agent card discovery (agent or sub-agent-level):**

\`\`\`bash
GET ${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/agents/.well-known/agent.json
\`\`\`

**A2A protocol (agent or sub-agent-level):**

\`\`\`bash
POST ${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/agents/.well-known/agent.json
\`\`\`
`}
      </Streamdown>
    </div>
  );
}
