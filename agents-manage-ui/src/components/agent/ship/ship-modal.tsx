import { Key, RocketIcon, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiGuide } from './api-guide';
import { ChatUIGuide } from './chat-ui-guide/chat-ui-guide';
import { McpGuide } from './mcp-guide';
import { NodeJsGuide } from './node-js-guide';
import { SdkGuide } from './sdk-guide';

const TAB_VALUES = {
  CHAT_UI: 'chat-ui',
  MCP_SERVER: 'mcp-server',
  SDK: 'sdk',
  API: 'api',
  NODE_JS: 'node-js',
} as const;

type TabValue = (typeof TAB_VALUES)[keyof typeof TAB_VALUES];

type TabItem = {
  label: string;
  value: TabValue;
};

const shipModalTabComponents: Record<TabValue, ComponentType> = {
  [TAB_VALUES.CHAT_UI]: ChatUIGuide,
  [TAB_VALUES.MCP_SERVER]: McpGuide,
  [TAB_VALUES.SDK]: SdkGuide,
  [TAB_VALUES.API]: ApiGuide,
  [TAB_VALUES.NODE_JS]: NodeJsGuide,
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
    label: 'Node JS',
    value: TAB_VALUES.NODE_JS,
  },
];

export function ShipModal() {
  const params = useParams();
  const { tenantId, projectId } = params;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RocketIcon className="size-4" />
          Ship
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-full! w-7xl" position="top" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between w-full gap-2">
            <DialogTitle>Talk to your agent</DialogTitle>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/${tenantId}/projects/${projectId}/api-keys`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Key className="size-4" />
                  Create API key
                </Link>
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm">
                  <X className="size-4 text-muted-foreground" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>
          </div>
          <DialogDescription className="sr-only">Talk to your agent.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={TAB_VALUES.CHAT_UI} className="min-w-0">
          <TabsList className="bg-transparent relative rounded-none border-b p-0 w-full justify-start gap-2">
            {shipModalTabItems.map((tab) => (
              <TabsTrigger
                key={tab.value}
                variant="underline"
                value={tab.value}
                className="text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(shipModalTabComponents).map(([value, Component]) => (
            <TabsContent key={value} value={value} className="py-4">
              <Component />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
