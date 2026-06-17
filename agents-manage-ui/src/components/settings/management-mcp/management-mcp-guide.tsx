'use client';

import type { LucideProps } from 'lucide-react';
import { Streamdown } from 'streamdown';
import { replaceTemplatePlaceholders } from '@/components/agent/ship/utils';
import { ClaudeIcon } from '@/components/icons/claude';
import { CursorIcon } from '@/components/icons/cursor';
import { VSCodeIcon } from '@/components/icons/vs-code';
import { WindsurfIcon } from '@/components/icons/windsurf';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import {
  claudeCodeTemplate,
  claudeDesktopTemplate,
  cursorTemplate,
  vscodeTemplate,
  windsurfTemplate,
} from './snippets';

const SERVER_NAME = 'inkeep';

const TAB_VALUES = {
  CURSOR: 'cursor',
  VS_CODE: 'vs-code',
  WIND_SURF: 'windsurf',
  CLAUDE_CODE: 'claude-code',
  CLAUDE_DESKTOP: 'claude-desktop',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

type DeepLink = {
  label: string;
  build: (serverUrl: string) => string;
};

type TabItem = {
  label: string;
  value: TabValue;
  content: string;
  IconComponent?: React.ComponentType<LucideProps>;
  deeplink?: DeepLink;
};

// Cursor one-click install: base64-encoded bare server config object, server
// name passed separately. Clicking opens Cursor's approval dialog, then the
// OAuth flow on first connect. https://cursor.com/docs/deeplinks
const buildCursorLink = (serverUrl: string) =>
  `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${btoa(
    JSON.stringify({ url: serverUrl })
  )}`;

// VS Code install redirect: URL-encoded bare server config object. The
// vscode.dev redirect hands off to the local VS Code URL handler.
const buildVscodeLink = (serverUrl: string) =>
  `https://vscode.dev/redirect/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(
    JSON.stringify({ type: 'http', url: serverUrl })
  )}`;

const tabItems: TabItem[] = [
  {
    label: 'Cursor',
    value: TAB_VALUES.CURSOR,
    content: cursorTemplate,
    IconComponent: CursorIcon,
    deeplink: { label: 'Add to Cursor', build: buildCursorLink },
  },
  {
    label: 'VS Code',
    value: TAB_VALUES.VS_CODE,
    content: vscodeTemplate,
    IconComponent: VSCodeIcon,
    deeplink: { label: 'Install in VS Code', build: buildVscodeLink },
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
  {
    label: 'Claude Desktop',
    value: TAB_VALUES.CLAUDE_DESKTOP,
    content: claudeDesktopTemplate,
    IconComponent: ClaudeIcon,
  },
];

export function ManagementMcpGuide() {
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const mcpServerUrl = `${PUBLIC_INKEEP_AGENTS_API_URL}/mcp`;

  return (
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
          {item.deeplink && (
            <div className="mb-4 flex flex-col gap-2">
              <Button asChild className="w-fit gap-2">
                <a href={item.deeplink.build(mcpServerUrl)}>
                  {item.IconComponent && <item.IconComponent className="size-4" />}
                  {item.deeplink.label}
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">Or add it manually:</p>
            </div>
          )}
          <Streamdown>
            {replaceTemplatePlaceholders(item.content, {
              MCP_SERVER_URL: mcpServerUrl,
            })}
          </Streamdown>
        </TabsContent>
      ))}
    </Tabs>
  );
}
