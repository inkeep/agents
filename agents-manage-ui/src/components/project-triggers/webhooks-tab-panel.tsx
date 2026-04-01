'use client';

import { useMemo, useState } from 'react';
import { Combobox } from '@/components/ui/combobox';
import type { AgentSummary, TriggerWithAgent } from '@/lib/api/project-triggers';
import { FilterTriggerComponent } from '../traces/filters/filter-trigger';
import { NewTriggerDialog } from './new-trigger-dialog';
import { ProjectTriggersTable } from './project-triggers-table';

export function WebhooksTabPanel({
  tenantId,
  projectId,
  triggers,
  agents,
}: {
  tenantId: string;
  projectId: string;
  triggers: TriggerWithAgent[];
  agents: AgentSummary[];
}) {
  const [agentFilter, setAgentFilter] = useState<string>('');

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
          <NewTriggerDialog
            tenantId={tenantId}
            projectId={projectId}
            agents={agents}
            type="webhook"
          />
        )}
      </div>
      <ProjectTriggersTable triggers={filteredTriggers} tenantId={tenantId} projectId={projectId} />
    </div>
  );
}
