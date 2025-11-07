import type { LucideProps } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { ClaudeIcon } from '@/components/icons/claude';
import { CursorIcon } from '@/components/icons/cursor';
import { VSCodeIcon } from '@/components/icons/vs-code';
import { WindsurfIcon } from '@/components/icons/windsurf';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { DocsLink, Header } from '../guide-header';
import { replaceTemplatePlaceholders, toCamelCase } from '../utils';
import { claudeCodeTemplate, cursorTemplate, vscodeTemplate, windsurfTemplate } from './snippets';

const TAB_VALUES = {
  CURSOR: 'cursor',
  VS_CODE: 'vs-code',
  WIND_SURF: 'windsurf',
  CLAUDE_CODE: 'claude-code',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

type TabItem = {
  label: string;
  value: TabValue;
  content: string;
  IconComponent?: React.ComponentType<LucideProps>;
};

const tabItems: TabItem[] = [
  {
    label: 'Cursor',
    value: TAB_VALUES.CURSOR,
    content: cursorTemplate,
    IconComponent: CursorIcon,
  },
  {
    label: 'VS Code',
    value: TAB_VALUES.VS_CODE,
    content: vscodeTemplate,
    IconComponent: VSCodeIcon,
  },
  {
    label: 'Windsurf',
    value: TAB_VALUES.WIND_SURF,
    content: windsurfTemplate,
    IconComponent: WindsurfIcon,
  },
  {
    label: 'Claude Code',
    value: TAB_VALUES.CLAUDE_CODE,
    content: claudeCodeTemplate,
    IconComponent: ClaudeIcon,
  },
];

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
        <TabsList className="mb-3 bg-transparent gap-3 px-0">
          {tabItems.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="rounded-full border gap-2 data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:shadow-none"
            >
              {item.IconComponent && <item.IconComponent className="size-4" />}
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabItems.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <Streamdown>
              {replaceTemplatePlaceholders(item.content, {
                AGENT_NAME: agentName,
                MCP_SERVER_URL: mcpServerUrl,
              })}
            </Streamdown>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
