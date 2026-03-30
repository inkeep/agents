'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { AgentSummary } from '@/lib/api/project-triggers';

export function NewTriggerDialog({
  tenantId,
  projectId,
  agents,
  type,
}: {
  tenantId: string;
  projectId: string;
  agents: AgentSummary[];
  type: 'webhook' | 'scheduled';
}) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const triggerLabel = type === 'webhook' ? 'webhook trigger' : 'scheduled trigger';
  const path = type === 'webhook' ? 'webhooks' : 'scheduled';

  return (
    <Dialog
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSelectedAgent('');
        }
      }}
    >
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
            onSelect={setSelectedAgent}
            defaultValue={selectedAgent}
            placeholder="Select an agent"
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
          />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
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
