'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ScheduledTriggerWithAgent, TriggerWithAgent } from '@/lib/api/project-triggers';
import { ProjectScheduledTriggersTable } from './project-scheduled-triggers-table';
import { ProjectTriggersTable } from './project-triggers-table';

const VALID_TABS = ['scheduled', 'webhooks'] as const;
type TabValue = (typeof VALID_TABS)[number];

interface TriggersTabsProps {
  tenantId: string;
  projectId: string;
  webhookTriggers: TriggerWithAgent[];
  scheduledTriggers: ScheduledTriggerWithAgent[];
  agents: { id: string; name: string }[];
}

function NewTriggerDialog({
  tenantId,
  projectId,
  agents,
  type,
}: {
  tenantId: string;
  projectId: string;
  agents: { id: string; name: string }[];
  type: 'webhook' | 'scheduled';
}) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [open, setOpen] = useState(false);

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgent(agentId);
  };

  const triggerLabel = type === 'webhook' ? 'webhook trigger' : 'scheduled trigger';
  const path = type === 'webhook' ? 'webhooks' : 'scheduled';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Plus />
          New {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create {triggerLabel}</DialogTitle>
          <DialogDescription>Select an agent to create a new {triggerLabel} for.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <Combobox
            options={agents.map((agent) => ({
              value: agent.id,
              label: agent.name,
            }))}
            onSelect={handleAgentSelect}
            defaultValue={selectedAgent}
            placeholder="Select an agent"
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button asChild disabled={!selectedAgent}>
              <Link
                href={`/${tenantId}/projects/${projectId}/triggers/${path}/${selectedAgent}/new`}
              >
                Continue
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TriggersTabs({
  tenantId,
  projectId,
  webhookTriggers,
  scheduledTriggers,
  agents,
}: TriggersTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : 'scheduled';

  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex items-center justify-between border-b">
        <TabsList className="h-10 w-full justify-start border-none bg-transparent p-0 rounded-none">
          <TabsTrigger value="scheduled" variant="underline" className="h-10">
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="webhooks" variant="underline" className="h-10">
            Webhooks
          </TabsTrigger>
        </TabsList>
        {activeTab === 'scheduled' && agents.length > 0 && (
          <div className="flex items-center h-10 px-4">
            <NewTriggerDialog
              tenantId={tenantId}
              projectId={projectId}
              agents={agents}
              type="scheduled"
            />
          </div>
        )}
        {activeTab === 'webhooks' && agents.length > 0 && (
          <div className="flex items-center h-10 px-4">
            <NewTriggerDialog
              tenantId={tenantId}
              projectId={projectId}
              agents={agents}
              type="webhook"
            />
          </div>
        )}
      </div>

      <TabsContent value="scheduled" className="mt-6">
        <ProjectScheduledTriggersTable
          triggers={scheduledTriggers}
          tenantId={tenantId}
          projectId={projectId}
        />
      </TabsContent>

      <TabsContent value="webhooks" className="mt-6">
        <ProjectTriggersTable
          triggers={webhookTriggers}
          tenantId={tenantId}
          projectId={projectId}
        />
      </TabsContent>
    </Tabs>
  );
}
