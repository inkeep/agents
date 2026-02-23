'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
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
  const [open, setOpen] = useState(false);

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
            onSelect={setSelectedAgent}
            defaultValue={selectedAgent}
            placeholder="Select an agent"
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            triggerClassName="w-full"
            className="w-[var(--radix-popover-trigger-width)]"
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
