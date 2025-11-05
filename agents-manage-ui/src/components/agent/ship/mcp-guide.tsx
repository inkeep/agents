import { Streamdown } from 'streamdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { DocsLink, Header } from './guide-header';

const TAB_VALUES = {
  CURSOR: 'cursor',
  VS_CODE: 'vs-code',
  WIND_SURF: 'windsurf',
  CLAUDE_DESKTOP: 'claude-desktop',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

type TabItem = {
  label: string;
  value: TabValue;
};

const tabItems: TabItem[] = [
  { label: 'Cursor', value: TAB_VALUES.CURSOR },
  { label: 'VS Code', value: TAB_VALUES.VS_CODE },
  { label: 'Windsurf', value: TAB_VALUES.WIND_SURF },
  { label: 'Claude Desktop', value: TAB_VALUES.CLAUDE_DESKTOP },
];

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '');
}

export function McpGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const mcpServerUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/v1/mcp`;
  const metadata = useAgentStore((state) => state.metadata);
  const agentName = toCamelCase(metadata?.name || 'agentName');
  return (
    <div>
      <Header.Container>
        <Header.Title title="MCP Server" />
        <DocsLink href={`${DOCS_BASE_URL}/talk-to-your-agents/mcp-server`} />
      </Header.Container>
      <Tabs defaultValue={TAB_VALUES.CURSOR}>
        <TabsList>
          {tabItems.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabItems.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <Streamdown>
              {`Add the following configuration to your ${item.label} MCP settings.

\`\`\`bash
{
  "${agentName}": {
    "type": "mcp",
    "url": "${mcpServerUrl}",
    "headers": {
      "Authorization": "Bearer <AGENT_API_KEY>"
    }
  }
}
\`\`\`

`}
            </Streamdown>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
