import { Streamdown } from 'streamdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
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
export function McpGuide() {
  const { PUBLIC_INKEEP_AGENTS_RUN_API_URL } = useRuntimeConfig();
  const mcpServerUrl = `${PUBLIC_INKEEP_AGENTS_RUN_API_URL}/v1/mcp`;
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
            test {item.label}
          </TabsContent>
        ))}
      </Tabs>

      <Streamdown>
        {`Add the following configuration to your Cursor MCP settings.

\`\`\`bash
{
  "AgentName": {
    "type": "mcp",
    "url": "${mcpServerUrl}",
    "headers": {
      "Authorization": "Bearer <agent_api_key>"
    }
  }
}
\`\`\`

`}
      </Streamdown>
    </div>
  );
}
