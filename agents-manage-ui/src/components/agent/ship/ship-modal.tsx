import { BookOpen, RocketIcon } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { StyledTabsTrigger } from '@/components/data-components/render/component-render-generator';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { A2AGuide } from './a2a-guide';
import { ApiGuide } from './api-guide';
import { ChatUiGuide } from './chat-ui-guide';
import { McpGuide } from './mcp-guide';
import { SdkGuide } from './sdk-guide';

const TAB_VALUES = {
  CHAT_UI: 'chat-ui',
  MCP_SERVER: 'mcp-server',
  SDK: 'sdk',
  API: 'api',
  A2A: 'a2a',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

type TabItem = {
  label: string;
  value: TabValue;
};

const shipModalTabComponents: Record<TabValue, ComponentType> = {
  [TAB_VALUES.CHAT_UI]: ChatUiGuide,
  [TAB_VALUES.MCP_SERVER]: McpGuide,
  [TAB_VALUES.SDK]: SdkGuide,
  [TAB_VALUES.API]: ApiGuide,
  [TAB_VALUES.A2A]: A2AGuide,
};

const shipModalTabItems: TabItem[] = [
  {
    label: 'Chat UI',
    value: TAB_VALUES.CHAT_UI,
  },
  {
    label: 'MCP Server',
    value: TAB_VALUES.MCP_SERVER,
  },
  {
    label: 'Vercel SDK',
    value: TAB_VALUES.SDK,
  },
  {
    label: 'REST API',
    value: TAB_VALUES.API,
  },
  {
    label: 'Agent to Agent',
    value: TAB_VALUES.A2A,
  },
];

const docsUrlMap: Record<TabValue, string> = {
  [TAB_VALUES.CHAT_UI]: `${DOCS_BASE_URL}/talk-to-your-agents/react/chat-button`,
  [TAB_VALUES.MCP_SERVER]: `${DOCS_BASE_URL}/talk-to-your-agents/mcp-server`,
  [TAB_VALUES.API]: `${DOCS_BASE_URL}/talk-to-your-agents/chat-api`,
  [TAB_VALUES.SDK]: `${DOCS_BASE_URL}/talk-to-your-agents/vercel-ai-sdk/use-chat`,
  [TAB_VALUES.A2A]: `${DOCS_BASE_URL}/talk-to-your-agents/a2a`,
};

export function ShipModal() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RocketIcon className="size-4" />
          Ship
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full! w-5xl">
        <DialogHeader>
          <DialogTitle>Talk to your agent</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={TAB_VALUES.CHAT_UI} className="min-w-0">
          <TabsList className="bg-transparent relative rounded-none border-b p-0 w-full justify-start gap-2">
            {shipModalTabItems.map((tab) => (
              <StyledTabsTrigger key={tab.value} value={tab.value} className="text-sm">
                {tab.label}
              </StyledTabsTrigger>
            ))}
          </TabsList>
          {Object.entries(shipModalTabComponents).map(([value, Component]) => (
            <TabsContent key={value} value={value} className="py-4">
              <Component />
              <DialogFooter>
                <Button asChild variant="ghost">
                  <Link
                    href={docsUrlMap[value as TabValue]}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <BookOpen className="size-4" />
                    View Docs
                  </Link>
                </Button>
              </DialogFooter>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
