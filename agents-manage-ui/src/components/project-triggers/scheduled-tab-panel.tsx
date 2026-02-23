'use client';

import { History } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { getProjectScheduledTriggersAction } from '@/lib/actions/project-triggers';
import type { AgentSummary, ScheduledTriggerWithAgent } from '@/lib/api/project-triggers';
import { FilterTriggerComponent } from '../traces/filters/filter-trigger';
import { NewTriggerDialog } from './new-trigger-dialog';
import { ProjectScheduledTriggersTable } from './project-scheduled-triggers-table';

const POLLING_INTERVAL_MS = 3000;

export function ScheduledTabPanel({
  tenantId,
  projectId,
  initialTriggers,
  agents,
}: {
  tenantId: string;
  projectId: string;
  initialTriggers: ScheduledTriggerWithAgent[];
  agents: AgentSummary[];
}) {
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [triggers, setTriggers] = useState(initialTriggers);

  useEffect(() => {
    const fetchTriggers = async () => {
      try {
        const updatedTriggers = await getProjectScheduledTriggersAction(tenantId, projectId);
        setTriggers(updatedTriggers);
      } catch (error) {
        console.error('Failed to fetch scheduled triggers:', error);
        2;
      }
    };

    const intervalId = setInterval(fetchTriggers, POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [tenantId, projectId]);

  const filteredTriggers = useMemo(() => {
    if (!agentFilter) return triggers;
    return triggers.filter((t) => t.agentId === agentFilter);
  }, [triggers, agentFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {agents.length > 1 && (
            <Combobox
              options={[
                { value: '', label: 'All agents' },
                ...agents.map((agent) => ({
                  value: agent.id,
                  label: agent.name,
                })),
              ]}
              onSelect={setAgentFilter}
              defaultValue={agentFilter}
              placeholder="Filter by agent"
              searchPlaceholder="Search agents..."
              notFoundMessage="No agents found."
              className="w-[200px]"
              TriggerComponent={
                <FilterTriggerComponent
                  filterLabel={agentFilter ? 'Agent' : 'All agents'}
                  multipleCheckboxValues={agentFilter ? [agentFilter] : []}
                  isRemovable={true}
                  onDeleteFilter={() => setAgentFilter('')}
                  options={agents.map((agent) => ({
                    value: agent.id,
                    label: agent.name,
                  }))}
                />
              }
            />
          )}
        </div>
        {agents.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/${tenantId}/projects/${projectId}/triggers/invocations`}>
                <History className="mr-1 h-4 w-4" />
                All Invocations
              </Link>
            </Button>
            <NewTriggerDialog
              tenantId={tenantId}
              projectId={projectId}
              agents={agents}
              type="scheduled"
            />
          </div>
        )}
      </div>
      <ProjectScheduledTriggersTable
        triggers={filteredTriggers}
        tenantId={tenantId}
        projectId={projectId}
      />
    </div>
  );
}
